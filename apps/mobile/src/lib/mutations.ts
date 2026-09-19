import { decode } from "base64-arraybuffer";
import type { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createUuid } from "./id";
import { supabase } from "./supabase";
import {
  createMutationRunner,
  RejectedMutation,
  type MutationReply,
  type PendingMutation,
} from "./mutation-model";

export async function assertAccount(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== userId)
    throw new Error(
      "Sign in to the original account to finish this save. Pending changes are retained.",
    );
}

export async function signOutRejectedSession(checked: Session | null) {
  const { data } = await supabase.auth.getSession();
  if (checked && data.session?.access_token === checked.access_token)
    await supabase.auth.signOut({ scope: "local" });
}

export async function sendMutation(
  userId: string,
  operationId: string,
  request: Record<string, unknown>,
): Promise<MutationReply> {
  await assertAccount(userId);
  const checkedSession = (await supabase.auth.getSession()).data.session;
  const { upload, ...payload } = request;
  if (
    request.table === "progress_photos" &&
    request.action === "create" &&
    upload
  ) {
    const photo = upload as { base64: string; path: string };
    if (!photo.path.startsWith(userId + "/"))
      throw new Error("Photo belongs to a different account.");
    const { error: sessionError } = await supabase.rpc(
      "require_active_session",
      { p_user_id: userId },
    );
    if (sessionError) {
      if (sessionError.code === "28000")
        await signOutRejectedSession(checkedSession);
      throw new Error(sessionError.message);
    }
    const { error: uploadError } = await supabase.storage
      .from("progress-photos")
      .upload(photo.path, decode(photo.base64), {
        cacheControl: "31536000",
        contentType: "image/jpeg",
        upsert: false,
      });
    if (
      uploadError &&
      String((uploadError as { statusCode?: string }).statusCode) !== "409"
    )
      throw new Error(uploadError.message);
  }
  const { data, error } = await supabase.rpc("commit_health_mutation", {
    p_user_id: userId,
    p_operation_id: operationId,
    p_request: payload,
  });
  if (error) {
    if (error.code === "28000") await signOutRejectedSession(checkedSession);
    if (error.code === "42501" || error.code === "PGRST202")
      throw new Error(
        "This save requires the latest app and service update. Your changes are retained; try again after updating.",
      );
    if (
      ["23502", "23503", "23505", "23514", "22003", "22P02", "P0001"].includes(
        error.code,
      )
    )
      throw new RejectedMutation(error.message);
    throw new Error(error.message);
  }
  if (!data || (data.status !== "accepted" && data.status !== "conflict"))
    throw new Error(
      "The save could not be confirmed. Retry to check its status.",
    );
  if (request.table === "progress_photos" && data.status === "accepted") {
    await assertAccount(userId);
    const rows = data.data as Record<string, unknown>[];
    if (request.action === "delete") {
      const { error: removeError } = await supabase.storage
        .from("progress-photos")
        .remove(rows.map((row) => String(row.object_path)));
      if (removeError) throw new Error(removeError.message);
    } else {
      for (const row of rows) {
        const { data: url, error: urlError } = await supabase.storage
          .from("progress-photos")
          .createSignedUrl(String(row.object_path), 3600);
        if (urlError) throw new Error(urlError.message);
        row.signed_url = url.signedUrl;
      }
    }
  }
  return data as MutationReply;
}

async function exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
  // Cross-tab coordination in the browser; native runner already excludes
  // overlapping submissions within this process.
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request(key, work);
  return work();
}
export const runMutation = createMutationRunner({
  storage: AsyncStorage,
  id: createUuid,
  assertAccount,
  exclusive,
  send: (user, pending) => sendMutation(user, pending.id, pending.request),
});

export async function retryPendingMutation(
  userId: string,
  key: string,
  expected: PendingMutation,
): Promise<MutationReply | undefined> {
  if (!key.startsWith(`healthapp:pending-write:v2:${userId}:`))
    throw new Error("This pending save belongs to another account.");
  return exclusive(key, async () => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw || (JSON.parse(raw) as PendingMutation).id !== expected.id)
      return undefined;
    const reply = await sendMutation(userId, expected.id, expected.request);
    await assertAccount(userId);
    const current = await AsyncStorage.getItem(key);
    if (current && (JSON.parse(current) as PendingMutation).id === expected.id)
      await AsyncStorage.removeItem(key);
    return reply;
  });
}

export function recordValues(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([key]) =>
        ![
          "id",
          "user_id",
          "version",
          "created_at",
          "updated_at",
          "change_seq",
        ].includes(key),
    ),
  );
}

export async function createRecords(
  userId: string,
  table: string,
  slot: string,
  intent: unknown,
  build: () => Record<string, unknown>[],
  retainUntilDraftCleared = false,
) {
  return runMutation<Record<string, unknown>[]>(
    userId,
    slot,
    intent,
    () => ({
      table,
      action: "create",
      rows: build().map((row) => ({
        id: row.id ?? createUuid(),
        version: 0,
        values: recordValues(row),
      })),
    }),
    retainUntilDraftCleared,
  );
}

export async function completePendingDraftSave(userId: string, slot: string) {
  await assertAccount(userId);
  const key = `healthapp:pending-write:v2:${userId}:${slot}`;
  await exclusive(key, async () => {
    const raw = await AsyncStorage.getItem(key);
    if (raw && (JSON.parse(raw) as PendingMutation).completed)
      await AsyncStorage.removeItem(key);
  });
}

export async function changeRecord(
  userId: string,
  table: string,
  id: string,
  version: number,
  values?: Record<string, unknown>,
) {
  if (!Number.isSafeInteger(version) || version < 1)
    throw new Error(
      "Reopen this record before editing; its saved version is unavailable.",
    );
  return runMutation<Record<string, unknown>[]>(
    userId,
    `${table}:${id}`,
    { version, values: values ? recordValues(values) : null },
    () => ({
      table,
      action: values ? "update" : "delete",
      rows: [{ id, version, values: values ? recordValues(values) : {} }],
    }),
  );
}

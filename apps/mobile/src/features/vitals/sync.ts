import type { VitalSample } from "../../domain/vitals";
import { serviceErrorMessage } from "../../lib/service-errors";
import { supabase } from "../../lib/supabase";
import {
  assertAccount,
  sendMutation,
  signOutRejectedSession,
} from "../../lib/mutations";
import { readVitalRow } from "./store-model";
import {
  cachedVitals,
  queueVitals,
  queuedChanges,
  prepareChange,
  acceptChange,
  failChange,
  applyRemotePage,
  syncCursor,
  lastVitalSyncAt,
  saveVitalSyncAt,
} from "./storage";

export const queueLocalVitals = queueVitals;
export async function markVitalsDeleted(
  samples: VitalSample[],
): Promise<VitalSample[]> {
  const tombstones = samples.map((sample) => ({
    ...sample,
    deletedAt: new Date().toISOString(),
  }));
  await queueVitals(tombstones);
  return tombstones;
}
type SyncResult = {
  synced: number;
  pending: number;
  lastSyncedAt?: string;
  error?: string;
};
const running = new Map<string, Promise<SyncResult>>();
export async function drainVitalSync(user: string) { await running.get(user); }
export function syncVitals(userId: string): Promise<SyncResult> {
  const existing = running.get(userId);
  if (existing) return existing.then(() => syncVitals(userId));
  const work = performSync(userId).finally(() => running.delete(userId));
  running.set(userId, work);
  return work;
}
async function performSync(userId: string): Promise<SyncResult> {
  let synced = 0;
  let issue: string | undefined;
  try {
    await assertAccount(userId);
    for (const candidate of await queuedChanges(userId)) {
      await assertAccount(userId);
      const operation = await prepareChange(userId, candidate.id);
      if (!operation?.request) continue;
      try {
        const reply = await sendMutation(
          userId,
          operation.id,
          operation.request,
        );
        await assertAccount(userId);
        if (reply.status === "conflict") {
          issue =
            "Some readings changed on another device. Your local edits are retained. Review Pending readings in Settings.";
          await failChange(userId, operation.id, issue, {
            id: reply.id,
            current: reply.current
              ? readVitalRow(reply.current as Record<string, unknown>)
              : null,
          });
        } else {
          await acceptChange(
            userId,
            operation.id,
            (reply.data as Record<string, unknown>[]).map(readVitalRow),
          );
          synced++;
        }
      } catch (error) {
        issue =
          error instanceof Error
            ? error.message
            : "Sync could not be confirmed. Pending readings are retained.";
        await failChange(userId, operation.id, issue);
        break;
      }
    }
    let cursor = await syncCursor(userId);
    let through: number | undefined;
    for (;;) {
      await assertAccount(userId);
      const checkedSession = (await supabase.auth.getSession()).data.session;
      const { data, error } = await supabase.rpc("read_vital_changes", {
        p_user_id: userId,
        p_after: cursor,
        p_through: through ?? null,
        p_limit: 200,
      });
      if (error) {
        if (error.code === "28000")
          await signOutRejectedSession(checkedSession);
        throw new Error(serviceErrorMessage(error));
      }
      await assertAccount(userId);
      if (
        !data ||
        !Array.isArray(data.rows) ||
        !Number.isSafeInteger(data.cursor) ||
        data.cursor < cursor
      )
        throw new Error(
          "Invalid sync response. Pending readings are retained.",
        );
      const next = Number(data.cursor);
      if (!data.done && next === cursor)
        throw new Error("Sync did not advance. Retry when connected.");
      await applyRemotePage(userId, data.rows.map(readVitalRow), next);
      cursor = next;
      through = Number(data.through);
      if (data.done) break;
    }
    const pending = (await queuedChanges(userId)).length;
    if (pending && !issue)
      issue =
        "Readings are saved on this device and waiting to sync. Review Pending readings in Settings.";
    const lastSyncedAt = new Date().toISOString();
    await saveVitalSyncAt(userId, lastSyncedAt);
    return { synced, pending, lastSyncedAt, error: issue };
  } catch (error) {
    return {
      synced,
      pending: (await queuedChanges(userId)).length,
      error:
        error instanceof Error
          ? error.message
          : "Sync failed. Pending readings are retained.",
    };
  }
}
export const loadCachedVitals = cachedVitals;
export const loadLastVitalSyncAt = lastVitalSyncAt;

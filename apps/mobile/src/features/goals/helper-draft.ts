import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ZodType } from "zod";
import type { HelperKind } from "./helper-model";
const writes = new Map<string, Promise<void>>();
export const helperDraftKey = (user: string, kind: HelperKind) =>
  `healthapp:goal-helper-draft:${user}:${kind}`;
export async function loadHelperDraft<D>(
  user: string,
  kind: HelperKind,
  schema: ZodType<D>,
) {
  const key = helperDraftKey(user, kind);
  await writes.get(key)?.catch(() => undefined);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
export function storeHelperDraft<D>(
  user: string,
  kind: HelperKind,
  draft: D | null,
  onlyIfUnchanged?: D,
) {
  const key = helperDraftKey(user, kind);
  const body = draft === null ? null : JSON.stringify(draft);
  const next = (writes.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      if (
        onlyIfUnchanged !== undefined &&
        (await AsyncStorage.getItem(key)) !== JSON.stringify(onlyIfUnchanged)
      )
        return;
      if (body === null) await AsyncStorage.removeItem(key);
      else await AsyncStorage.setItem(key, body);
    });
  writes.set(key, next);
  void next
    .finally(() => {
      if (writes.get(key) === next) writes.delete(key);
    })
    .catch(() => undefined);
  return next;
}

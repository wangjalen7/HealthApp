import type { PendingIntent } from "./navigation-model";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  captureIntent,
  clearIntent,
  type IntentState,
  type NotificationTap,
} from "./navigation-model";
import { serializeSchedules } from "./schedule-model";
const key = "healthapp:notification-intent:v2";
const run = serializeSchedules();
const listeners = new Set<() => void>();
export const observeIntent = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export async function loadIntent(): Promise<IntentState> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return { seen: [] };
  try {
    const value = JSON.parse(raw) as IntentState;
    const seen = Array.isArray(value.seen)
      ? value.seen.filter((k) => typeof k === "string").slice(-100)
      : [];
    if (!value.pending) return { seen };
    const valid = captureIntent(
      { seen: [] },
      { key: value.pending.key, data: value.pending.payload },
      0,
    ).pending;
    return valid && Number.isFinite(value.pending.expiresAt)
      ? { seen, pending: { ...valid, expiresAt: value.pending.expiresAt } }
      : { seen };
  } catch {
    return { seen: [] };
  }
}
async function store(value: IntentState) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
  for (const l of listeners) l();
}
export function saveTap(tap: NotificationTap) {
  return run(async () => {
    const before = await loadIntent();
    const after = captureIntent(before, tap, Date.now());
    if (after !== before) await store(after);
  });
}
export function discardIntent(user?: string) {
  return run(async () => {
    const state = await loadIntent();
    if (!user || state.pending?.payload.userId === user)
      await store(clearIntent(state));
  });
}
export function consumeIntent(key: string) {
  return run(async () => {
    const state = await loadIntent();
    if (state.pending?.key !== key) return false;
    await store(clearIntent(state));
    return state.pending.expiresAt > Date.now();
  });
}

export function restoreDeferredIntent(pending: PendingIntent) {
  return run(async () => {
    const s = await loadIntent();
    if (!s.pending && pending.expiresAt > Date.now())
      await store({ pending, seen: s.seen.filter((k) => k !== pending.key) });
  });
}

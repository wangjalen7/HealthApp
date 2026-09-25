import { entryDaySchema } from "../../lib/entry-date";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

export const cardioDraftSchema = z.object({
  entryDay: entryDaySchema,
  activityType: z
    .enum(["walk", "run", "swim", "tennis", "cycle", "other"])
    .optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  distanceMiles: z.number().min(0).max(1000).optional(),
  notes: z.string().max(1000).default(""),
});

export type CardioDraft = z.infer<typeof cardioDraftSchema>;

const keyFor = (userId: string) => `healthapp:cardio-draft:${userId}`;
const queues = new Map<string, Promise<void>>();

function queue(key: string, write: () => Promise<void>) {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}

export function cardioDraftHasContent(draft: CardioDraft) {
  return Boolean(
    draft.entryDay ||
    draft.activityType ||
    draft.durationMinutes ||
    draft.distanceMiles !== undefined ||
    draft.notes.trim(),
  );
}

export async function loadCardioDraft(userId: string) {
  try {
    await queues.get(keyFor(userId));
    const raw = await AsyncStorage.getItem(keyFor(userId));
    return raw ? cardioDraftSchema.parse(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

export function saveCardioDraft(userId: string, draft: CardioDraft) {
  const value = cardioDraftSchema.parse(draft);
  const key = keyFor(userId);
  return queue(key, () => AsyncStorage.setItem(key, JSON.stringify(value)));
}

export function clearCardioDraft(userId: string) {
  const key = keyFor(userId);
  return queue(key, () => AsyncStorage.removeItem(key));
}

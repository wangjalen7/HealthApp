import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

const muscleGroupSchema = z.enum([
  "Back",
  "Chest",
  "Tri",
  "Bi",
  "Delt",
  "Legs",
  "Abs",
]);
const draftEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120),
  setCount: z.number().int().min(0).max(12),
  reps: z.array(z.number().int().min(0).max(500)).max(12),
  weight: z.number().min(0).max(5000).optional(),
});

export const workoutDraftSchema = z.object({
  muscleGroups: z.array(muscleGroupSchema).max(7),
  entries: z.array(draftEntrySchema).max(30),
  notes: z.string().max(1000),
});

export type MuscleGroup = z.infer<typeof muscleGroupSchema>;
export type WorkoutDraft = z.infer<typeof workoutDraftSchema>;

const draftKey = (userId: string): string =>
  `healthapp:workout-draft:${userId}`;
const writeQueues = new Map<string, Promise<void>>();

function queueWrite(key: string, write: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  writeQueues.set(key, next);
  void next.finally(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  });
  return next;
}

export function workoutDraftHasContent(draft: WorkoutDraft): boolean {
  return Boolean(
    draft.muscleGroups.length || draft.entries.length || draft.notes.trim(),
  );
}

export async function loadWorkoutDraft(
  userId: string,
): Promise<WorkoutDraft | undefined> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId));
    return raw ? workoutDraftSchema.parse(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

export function saveWorkoutDraft(
  userId: string,
  draft: WorkoutDraft,
): Promise<void> {
  const value = workoutDraftSchema.parse(draft);
  const key = draftKey(userId);
  return queueWrite(key, () =>
    AsyncStorage.setItem(key, JSON.stringify(value)),
  );
}

export function clearWorkoutDraft(userId: string): Promise<void> {
  const key = draftKey(userId);
  return queueWrite(key, () => AsyncStorage.removeItem(key));
}

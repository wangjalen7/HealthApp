import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

export const muscleGroups = [
  "Back",
  "Chest",
  "Tri",
  "Bi",
  "Delt",
  "Legs",
  "Abs",
] as const;
export const muscleGroupSchema = z.enum(muscleGroups);
const draftEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120),
  muscleGroup: muscleGroupSchema.optional(),
  setCount: z.number().int().min(0).max(12),
  reps: z.array(z.number().int().min(0).max(500)).max(12),
  weight: z.number().min(0).max(5000).optional(),
  rightReps: z.array(z.number().int().min(0).max(500)).max(12).optional(),
  rightWeight: z.number().min(0).max(5000).optional(),
  plan: z
    .object({
      rir: z.number().int().min(0).max(5).optional(),
      restSeconds: z.number().int().min(15).max(600).optional(),
      technique: z.string().max(300).optional(),
    })
    .optional(),
});

export const workoutDraftSchema = z.object({
  muscleGroups: z.array(muscleGroupSchema).max(7),
  entries: z.array(draftEntrySchema).max(30),
  location: z.string().max(160).default(""),
  notes: z.string().max(1000),
});

export type MuscleGroup = z.infer<typeof muscleGroupSchema>;
export type WorkoutDraft = z.infer<typeof workoutDraftSchema>;
export type WorkoutDraftEntry = WorkoutDraft["entries"][number];

export function muscleGroupLabel(group: string): string {
  if (group === "Bi") return "Bicep";
  if (group === "Tri") return "Tricep";
  if (group === "Delt") return "Shoulders";
  return group;
}

const unilateralNamePatterns = [
  /\bunilateral\b/i,
  /\b(?:single|one)[ -]?(?:arm|hand|leg|side|limb)\b/i,
  /\b(?:single|one)[ -]sided\b/i,
  /\b(?:each|per)[ -]?(?:arm|hand|leg|side|limb)\b/i,
  /\b(?:left|right)[ /&-]+(?:right|left)\b/i,
  /\b(?:l\s*\/\s*r|r\s*\/\s*l)\b/i,
];

export function isUnilateralExerciseName(name: string): boolean {
  const normalized = name.trim().replace(/[–—]/g, "-");
  return unilateralNamePatterns.some((pattern) => pattern.test(normalized));
}

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
    draft.muscleGroups.length ||
    draft.entries.length ||
    draft.location.trim() ||
    draft.notes.trim(),
  );
}

export function normalizeWorkoutDraftStructure(
  draft: WorkoutDraft,
): WorkoutDraft {
  return {
    ...draft,
    muscleGroups: [
      ...new Set([
        ...draft.muscleGroups,
        ...draft.entries.flatMap((entry) =>
          entry.muscleGroup ? [entry.muscleGroup] : [],
        ),
      ]),
    ],
    entries: draft.entries.map((entry) => ({
      ...entry,
      reps: Array.from(
        { length: entry.setCount },
        (_, index) => entry.reps[index] ?? 0,
      ),
      rightReps: isUnilateralExerciseName(entry.name)
        ? Array.from(
            { length: entry.setCount },
            (_, index) => entry.rightReps?.[index] ?? entry.reps[index] ?? 0,
          )
        : [],
    })),
  };
}

export function workoutEntryCompletionIssue(
  entry: WorkoutDraftEntry,
  selectedGroups: MuscleGroup[],
  index: number,
): string | undefined {
  const label = entry.name.trim() || `Exercise ${index + 1}`;
  if (!entry.name.trim()) return `${label}: enter an exercise name.`;
  if (!entry.muscleGroup || !selectedGroups.includes(entry.muscleGroup))
    return `${label}: choose one of the selected muscle groups.`;
  if (entry.setCount <= 0) return `${label}: enter the number of sets.`;
  if (
    entry.reps.length !== entry.setCount ||
    entry.reps.some((reps) => !Number.isInteger(reps) || reps <= 0)
  )
    return `${label}: enter reps for all ${entry.setCount} sets.`;
  if (entry.weight === undefined || entry.weight < 0)
    return `${label}: enter a working weight; use 0 lb for bodyweight.`;
  if (isUnilateralExerciseName(entry.name)) {
    if (
      entry.rightReps?.length !== entry.setCount ||
      entry.rightReps.some((reps) => !Number.isInteger(reps) || reps <= 0)
    )
      return `${label}: enter right-side reps for all ${entry.setCount} sets.`;
    if (entry.rightWeight === undefined || entry.rightWeight < 0)
      return `${label}: enter a right-side weight; use 0 lb for bodyweight.`;
  }
  return undefined;
}

export function moveWorkoutEntry<T extends { id: string }>(
  entries: T[],
  entryId: string,
  direction: -1 | 1,
): T[] {
  const index = entries.findIndex((entry) => entry.id === entryId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= entries.length) return entries;
  const moved = [...entries];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}

export async function loadWorkoutDraft(
  userId: string,
): Promise<WorkoutDraft | undefined> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId));
    return raw
      ? normalizeWorkoutDraftStructure(
          workoutDraftSchema.parse(JSON.parse(raw)),
        )
      : undefined;
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

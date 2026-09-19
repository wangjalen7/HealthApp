import { serviceErrorMessage } from "../../lib/service-errors";
import { runMutation, createRecords, changeRecord } from "../../lib/mutations";
import { collectPages } from "../../lib/pagination";
import { z } from "zod";

import { supabase } from "../../lib/supabase";
import { createId } from "../vitals/storage";
import {
  buildExerciseGuidance,
  type ExerciseGuidance,
  type PerformanceSession,
} from "./progression";
import { rankSavedNames, suggestGymLocations } from "./catalog";
import { muscleGroupSchema, type MuscleGroup } from "./workout-draft";

const workoutSetSchema = z
  .object({
    exerciseName: z.string().trim().min(1).max(120),
    exerciseOrder: z.number().int().min(1).max(100),
    muscleGroup: muscleGroupSchema,
    weight: z.number().min(0).max(5000),
    reps: z.number().int().min(1).max(500),
    sideMode: z.enum(["bilateral", "unilateral"]).optional(),
    rightWeight: z.number().min(0).max(5000).optional(),
    rightReps: z.number().int().min(1).max(500).optional(),
  })
  .superRefine((set, context) => {
    if (
      set.sideMode === "unilateral" &&
      (set.rightWeight === undefined || set.rightReps === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter reps and weight for both sides.",
      });
    }
  });
export type WorkoutSetInput = z.infer<typeof workoutSetSchema>;
export type { ExerciseGuidance, ExerciseMemory } from "./progression";

export async function saveWorkout(
  userId: string,
  input: {
    title: string;
    muscleGroups: string[];
    templateName?: string;
    location?: string;
    notes?: string;
    sets: WorkoutSetInput[];
  },
): Promise<void> {
  const sets = input.sets.map((set) => workoutSetSchema.parse(set));
  if (!sets.length) throw new Error("Add at least one completed set.");
  if (sets.some((set) => !input.muscleGroups.includes(set.muscleGroup))) {
    throw new Error("Choose a selected muscle group for every exercise.");
  }
  await runMutation(
    userId,
    "workout:create",
    input,
    () => {
      const numbers = new Map<string, number>();
      return {
        action: "create_workout",
        id: createId(),
        title: input.title.trim(),
        muscle_groups: input.muscleGroups,
        template_name: input.templateName ?? null,
        location: input.location?.trim() ?? "",
        notes: input.notes?.trim() ?? "",
        occurred_at: new Date().toISOString(),
        sets: sets.map((set) => {
          const n = (numbers.get(set.exerciseName) ?? 0) + 1;
          numbers.set(set.exerciseName, n);
          return {
            id: createId(),
            exercise_name: set.exerciseName,
            exercise_order: set.exerciseOrder,
            muscle_group: set.muscleGroup,
            set_number: n,
            weight: set.weight,
            weight_unit: "lb",
            reps: set.reps,
            side_mode: set.sideMode ?? "bilateral",
            right_weight: set.rightWeight ?? null,
            right_reps: set.rightReps ?? null,
          };
        }),
      };
    },
    true,
  );
}

export async function replaceWorkout(
  userId: string,
  sessionId: string,
  version: number,
  input: {
    title: string;
    muscleGroups: string[];
    location?: string;
    notes?: string;
    sets: WorkoutSetInput[];
  },
): Promise<void> {
  const sets = input.sets.map((set) => workoutSetSchema.parse(set));
  if (!sets.length) throw new Error("Add at least one completed set.");
  if (sets.some((set) => !input.muscleGroups.includes(set.muscleGroup))) {
    throw new Error("Choose a selected muscle group for every exercise.");
  }
  const setNumbers = new Map<string, number>();
  const replacementSets = sets.map((set) => {
    const setNumber = (setNumbers.get(set.exerciseName) ?? 0) + 1;
    setNumbers.set(set.exerciseName, setNumber);
    return {
      id: createId(),
      exercise_name: set.exerciseName,
      exercise_order: set.exerciseOrder,
      muscle_group: set.muscleGroup ?? null,
      set_number: setNumber,
      weight: set.weight,
      weight_unit: "lb",
      reps: set.reps,
      side_mode: set.sideMode ?? "bilateral",
      right_weight: set.rightWeight ?? null,
      right_reps: set.rightReps ?? null,
    };
  });
  await runMutation(userId, `workout:${sessionId}`, { version, input }, () => ({
    action: "replace_workout",
    id: sessionId,
    version,
    title: input.title.trim(),
    muscle_groups: input.muscleGroups,
    location: input.location?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    sets: replacementSets,
  }));
}

export async function getExerciseGuidance(
  userId: string,
  exerciseName: string,
): Promise<ExerciseGuidance | undefined> {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const { data, error } = await supabase
    .from("workout_sets")
    .select("session_id, weight, reps, weight_unit, set_number, created_at")
    .eq("user_id", userId)
    .ilike("exercise_name", exerciseName.trim())
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(serviceErrorMessage(error));
  const grouped = new Map<string, PerformanceSession>();
  for (const set of data ?? []) {
    const sessionId = String(set.session_id);
    const current = grouped.get(sessionId) ?? {
      id: sessionId,
      occurredAt: String(set.created_at),
      sets: [],
    };
    current.sets.push({ weight: Number(set.weight), reps: Number(set.reps) });
    grouped.set(sessionId, current);
  }
  return buildExerciseGuidance([...grouped.values()]);
}

export async function getExerciseSuggestions(
  userId: string,
  query: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("workout_sets")
    .select("exercise_name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) throw new Error(serviceErrorMessage(error));
  return rankSavedNames(
    (data ?? []).map((set) => set.exercise_name),
    query,
  );
}

export async function getGymLocationSuggestions(
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("location")
    .eq("user_id", userId)
    .not("location", "is", null)
    .order("completed_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(serviceErrorMessage(error));
  return suggestGymLocations(
    (data ?? []).flatMap((session) =>
      typeof session.location === "string" ? [session.location] : [],
    ),
    "",
  );
}

export type WorkoutHistorySet = {
  exerciseName: string;
  exerciseOrder: number;
  muscleGroup?: MuscleGroup;
  setNumber: number;
  weight: number;
  unit: string;
  reps: number;
  sideMode: "bilateral" | "unilateral";
  rightWeight?: number;
  rightReps?: number;
};
export type WorkoutHistorySession = {
  id: string;
  version: number;
  title: string;
  muscleGroups: string[];
  completedAt: string;
  location?: string;
  notes?: string;
  sets: WorkoutHistorySet[];
};
export async function getWorkoutHistory(
  userId: string,
): Promise<WorkoutHistorySession[]> {
  const sessions = await collectPages((after) => {
    let query = supabase
      .from("workout_sessions")
      .select(
        "id, version, title, muscle_groups, completed_at, location, notes",
      )
      .eq("user_id", userId)
      .order("id")
      .limit(200);
    if (after) query = query.gt("id", after);
    return query;
  });
  sessions.sort(
    (a, b) =>
      b.completed_at.localeCompare(a.completed_at) || b.id.localeCompare(a.id),
  );
  if (!sessions?.length) return [];
  const sets = await collectPages((after) => {
    let query = supabase
      .from("workout_sets")
      .select("*")
      .eq("user_id", userId)
      .order("id")
      .limit(200);
    if (after) query = query.gt("id", after);
    return query;
  });
  sets.sort(
    (a, b) =>
      a.exercise_order - b.exercise_order ||
      a.set_number - b.set_number ||
      a.id.localeCompare(b.id),
  );
  const bySession = new Map<string, WorkoutHistorySet[]>();
  for (const set of sets ?? []) {
    const current = bySession.get(set.session_id) ?? [];
    current.push({
      exerciseName: set.exercise_name,
      exerciseOrder: Number(set.exercise_order),
      muscleGroup: muscleGroupSchema.safeParse(set.muscle_group).success
        ? muscleGroupSchema.parse(set.muscle_group)
        : undefined,
      setNumber: Number(set.set_number),
      weight: Number(set.weight),
      unit: set.weight_unit,
      reps: Number(set.reps),
      sideMode: set.side_mode === "unilateral" ? "unilateral" : "bilateral",
      rightWeight:
        set.right_weight === null ? undefined : Number(set.right_weight),
      rightReps: set.right_reps === null ? undefined : Number(set.right_reps),
    });
    bySession.set(set.session_id, current);
  }
  return sessions.map((session) => ({
    id: session.id,
    version: Number(session.version),
    title: session.title,
    muscleGroups: Array.isArray(session.muscle_groups)
      ? session.muscle_groups
      : [],
    completedAt: session.completed_at,
    location: session.location ?? undefined,
    notes: session.notes ?? undefined,
    sets: bySession.get(session.id) ?? [],
  }));
}

export async function deleteWorkout(
  userId: string,
  sessionId: string,
  version: number,
): Promise<void> {
  const id = z.string().uuid().parse(sessionId);
  await changeRecord(userId, "workout_sessions", id, version);
}

export async function getWorkoutById(
  userId: string,
  sessionId: string,
): Promise<WorkoutHistorySession | undefined> {
  const { data: session, error: sessionError } = await supabase
    .from("workout_sessions")
    .select("id, version, title, muscle_groups, completed_at, location, notes")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) return undefined;
  const sets = await collectPages((after) => {
    let query = supabase
      .from("workout_sets")
      .select("*")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("id")
      .limit(200);
    if (after) query = query.gt("id", after);
    return query;
  });
  sets.sort(
    (a, b) =>
      a.exercise_order - b.exercise_order ||
      a.set_number - b.set_number ||
      a.id.localeCompare(b.id),
  );
  return {
    id: session.id,
    version: Number(session.version),
    title: session.title,
    muscleGroups: Array.isArray(session.muscle_groups)
      ? session.muscle_groups
      : [],
    completedAt: session.completed_at,
    location: session.location ?? undefined,
    notes: session.notes ?? undefined,
    sets: (sets ?? []).map((set) => ({
      exerciseName: set.exercise_name,
      exerciseOrder: Number(set.exercise_order),
      muscleGroup: muscleGroupSchema.safeParse(set.muscle_group).success
        ? muscleGroupSchema.parse(set.muscle_group)
        : undefined,
      setNumber: Number(set.set_number),
      weight: Number(set.weight),
      unit: set.weight_unit,
      reps: Number(set.reps),
      sideMode: set.side_mode === "unilateral" ? "unilateral" : "bilateral",
      rightWeight:
        set.right_weight === null ? undefined : Number(set.right_weight),
      rightReps: set.right_reps === null ? undefined : Number(set.right_reps),
    })),
  };
}

const cardioSchema = z.object({
  activityType: z.enum(["walk", "run", "swim", "tennis", "cycle", "other"]),
  durationMinutes: z.number().int().min(1).max(1440),
  distanceMiles: z.number().min(0).max(1000).optional(),
  notes: z.string().max(1000).optional(),
});
export type CardioInput = z.infer<typeof cardioSchema>;

export type CardioHistoryEntry = {
  id: string;
  version: number;
  activityType: CardioInput["activityType"];
  activityName?: string;
  durationMinutes: number;
  distanceMiles?: number;
  notes?: string;
  occurredAt: string;
  source: "manual" | "strava" | "healthkit";
  sourceName?: string;
};

function cardioHistoryEntry(row: Record<string, unknown>): CardioHistoryEntry {
  return {
    id: String(row.id),
    version: Number(row.version),
    activityType: cardioSchema.shape.activityType.parse(row.activity_type),
    activityName: row.activity_name ? String(row.activity_name) : undefined,
    durationMinutes: Number(row.duration_minutes),
    distanceMiles:
      row.distance_miles === null || row.distance_miles === undefined
        ? undefined
        : Number(row.distance_miles),
    notes: row.notes ? String(row.notes) : undefined,
    occurredAt: String(row.occurred_at),
    source:
      row.source === "strava"
        ? "strava"
        : row.source === "healthkit"
          ? "healthkit"
          : "manual",
    sourceName: row.source_name ? String(row.source_name) : undefined,
  };
}

export async function saveCardio(
  userId: string,
  input: CardioInput,
): Promise<void> {
  const value = cardioSchema.parse(input);
  await createRecords(
    userId,
    "cardio_entries",
    "cardio:create",
    value,
    () => [
      {
        id: createId(),
        user_id: userId,
        activity_type: value.activityType,
        activity_name: null,
        duration_minutes: value.durationMinutes,
        distance_miles: value.distanceMiles ?? null,
        notes: value.notes?.trim() || null,
        occurred_at: new Date().toISOString(),
        source: "manual",
      },
    ],
    true,
  );
}

export async function getCardioHistory(
  userId: string,
): Promise<CardioHistoryEntry[]> {
  const data = await collectPages((after) => {
    let query = supabase
      .from("cardio_entries")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("id")
      .limit(200);
    if (after) query = query.gt("id", after);
    return query;
  });
  return data
    .map(cardioHistoryEntry)
    .sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
    );
}

export async function getCardioById(
  userId: string,
  cardioId: string,
): Promise<CardioHistoryEntry | undefined> {
  const id = z.string().uuid().parse(cardioId);
  const { data, error } = await supabase
    .from("cardio_entries")
    .select(
      "id, version, activity_type, activity_name, duration_minutes, distance_miles, notes, occurred_at, source, source_name",
    )
    .eq("user_id", userId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(serviceErrorMessage(error));
  return data ? cardioHistoryEntry(data) : undefined;
}

export async function updateCardio(
  userId: string,
  cardioId: string,
  version: number,
  input: CardioInput,
): Promise<void> {
  const id = z.string().uuid().parse(cardioId);
  const value = cardioSchema.parse(input);
  await changeRecord(userId, "cardio_entries", id, version, {
    activity_type: value.activityType,
    duration_minutes: value.durationMinutes,
    distance_miles: value.distanceMiles ?? null,
    notes: value.notes?.trim() || null,
  });
}

export async function deleteCardio(
  userId: string,
  cardioId: string,
  version: number,
): Promise<void> {
  const id = z.string().uuid().parse(cardioId);
  await changeRecord(userId, "cardio_entries", id, version);
}

export type TodaySummary = {
  calories: number;
  protein: number;
};
export async function getTodaySummary(userId: string): Promise<TodaySummary> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const result: TodaySummary = { calories: 0, protein: 0 };
  const rows = await collectPages((after) => {
    let query = supabase
      .from("nutrition_entries")
      .select("id, calories, protein_grams")
      .eq("user_id", userId)
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString())
      .order("id")
      .limit(200);
    if (after) query = query.gt("id", after);
    return query;
  });
  for (const item of rows) {
    result.calories += Number(item.calories);
    result.protein += Number(item.protein_grams);
  }
  return result;
}

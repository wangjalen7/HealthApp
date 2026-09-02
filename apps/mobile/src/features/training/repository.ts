import { z } from "zod";

import { supabase } from "../../lib/supabase";
import { createId } from "../vitals/storage";
import {
  buildExerciseGuidance,
  type ExerciseGuidance,
  type PerformanceSession,
} from "./progression";
import { rankSavedNames } from "./catalog";
import { muscleGroupSchema, type MuscleGroup } from "./workout-draft";

const workoutSetSchema = z.object({
  exerciseName: z.string().trim().min(1).max(120),
  exerciseOrder: z.number().int().min(1).max(100),
  muscleGroup: muscleGroupSchema,
  weight: z.number().min(0).max(5000),
  reps: z.number().int().min(1).max(500),
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
  const sessionId = createId();
  const now = new Date().toISOString();
  const { error: sessionError } = await supabase
    .from("workout_sessions")
    .insert({
      id: sessionId,
      user_id: userId,
      title: input.title.trim(),
      muscle_groups: input.muscleGroups,
      template_name: input.templateName ?? null,
      location: input.location?.trim() || null,
      notes: input.notes?.trim() || null,
      started_at: now,
      completed_at: now,
    });
  if (sessionError) throw new Error(sessionError.message);
  const setNumbers = new Map<string, number>();
  const { error: setsError } = await supabase.from("workout_sets").insert(
    sets.map((set) => {
      const setNumber = (setNumbers.get(set.exerciseName) ?? 0) + 1;
      setNumbers.set(set.exerciseName, setNumber);
      return {
        id: createId(),
        user_id: userId,
        session_id: sessionId,
        exercise_name: set.exerciseName,
        exercise_order: set.exerciseOrder,
        muscle_group: set.muscleGroup ?? null,
        set_number: setNumber,
        weight: set.weight,
        weight_unit: "lb",
        reps: set.reps,
      };
    }),
  );
  if (setsError) throw new Error(setsError.message);
}

export async function replaceWorkout(
  userId: string,
  sessionId: string,
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
    };
  });
  const { error } = await supabase.rpc("replace_workout_session", {
    p_session_id: sessionId,
    p_title: input.title.trim(),
    p_muscle_groups: input.muscleGroups,
    p_location: input.location?.trim() ?? "",
    p_notes: input.notes?.trim() ?? "",
    p_sets: replacementSets,
  });
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
  return rankSavedNames(
    (data ?? []).map((set) => set.exercise_name),
    query,
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
};
export type WorkoutHistorySession = {
  id: string;
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
  const { data: sessions, error: sessionError } = await supabase
    .from("workout_sessions")
    .select("id, title, muscle_groups, completed_at, location, notes")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(100);
  if (sessionError) throw new Error(sessionError.message);
  if (!sessions?.length) return [];
  const ids = sessions.map((session) => session.id);
  const { data: sets, error: setError } = await supabase
    .from("workout_sets")
    .select(
      "session_id, exercise_name, exercise_order, muscle_group, set_number, weight, weight_unit, reps",
    )
    .eq("user_id", userId)
    .in("session_id", ids)
    .order("exercise_order", { ascending: true })
    .order("set_number", { ascending: true });
  if (setError) throw new Error(setError.message);
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
    });
    bySession.set(set.session_id, current);
  }
  return sessions.map((session) => ({
    id: session.id,
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
): Promise<void> {
  const id = z.string().uuid().parse(sessionId);
  const { error } = await supabase
    .from("workout_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getWorkoutById(
  userId: string,
  sessionId: string,
): Promise<WorkoutHistorySession | undefined> {
  const { data: session, error: sessionError } = await supabase
    .from("workout_sessions")
    .select("id, title, muscle_groups, completed_at, location, notes")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) return undefined;
  const { data: sets, error: setError } = await supabase
    .from("workout_sets")
    .select(
      "exercise_name, exercise_order, muscle_group, set_number, weight, weight_unit, reps",
    )
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("exercise_order", { ascending: true })
    .order("set_number", { ascending: true });
  if (setError) throw new Error(setError.message);
  return {
    id: session.id,
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
  const { error } = await supabase.from("cardio_entries").insert({
    id: createId(),
    user_id: userId,
    activity_type: value.activityType,
    activity_name: null,
    duration_minutes: value.durationMinutes,
    distance_miles: value.distanceMiles ?? null,
    notes: value.notes?.trim() || null,
    occurred_at: new Date().toISOString(),
    source: "manual",
  });
  if (error) throw new Error(error.message);
}

export async function getCardioHistory(
  userId: string,
): Promise<CardioHistoryEntry[]> {
  const { data, error } = await supabase
    .from("cardio_entries")
    .select(
      "id, activity_type, activity_name, duration_minutes, distance_miles, notes, occurred_at, source, source_name",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((entry) => cardioHistoryEntry(entry));
}

export async function getCardioById(
  userId: string,
  cardioId: string,
): Promise<CardioHistoryEntry | undefined> {
  const id = z.string().uuid().parse(cardioId);
  const { data, error } = await supabase
    .from("cardio_entries")
    .select(
      "id, activity_type, activity_name, duration_minutes, distance_miles, notes, occurred_at, source, source_name",
    )
    .eq("user_id", userId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? cardioHistoryEntry(data) : undefined;
}

export async function updateCardio(
  userId: string,
  cardioId: string,
  input: CardioInput,
): Promise<void> {
  const id = z.string().uuid().parse(cardioId);
  const value = cardioSchema.parse(input);
  const { data, error } = await supabase
    .from("cardio_entries")
    .update({
      activity_type: value.activityType,
      duration_minutes: value.durationMinutes,
      distance_miles: value.distanceMiles ?? null,
      notes: value.notes?.trim() || null,
    })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("source", "manual")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only manually logged cardio can be edited.");
}

export async function deleteCardio(
  userId: string,
  cardioId: string,
): Promise<void> {
  const id = z.string().uuid().parse(cardioId);
  const { error } = await supabase
    .from("cardio_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export type TodaySummary = {
  calories: number;
  protein: number;
};
export async function getTodaySummary(userId: string): Promise<TodaySummary> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const food = await supabase
    .from("nutrition_entries")
    .select("calories, protein_grams")
    .eq("user_id", userId)
    .gte("occurred_at", start.toISOString());
  if (food.error) throw new Error(food.error.message);
  return {
    calories: (food.data ?? []).reduce(
      (total, item) => total + Number(item.calories),
      0,
    ),
    protein: (food.data ?? []).reduce(
      (total, item) => total + Number(item.protein_grams),
      0,
    ),
  };
}

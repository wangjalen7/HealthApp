import type { CoachActionPayload } from "../../../../../supabase/functions/_shared/coach";
import { createUuid } from "../../lib/id";
import type { WorkoutDraft } from "../training/workout-draft";

export type CoachDraftMode = "append" | "replace";

export function workoutDraftFromCoach(
  action: Extract<CoachActionPayload, { kind: "next_workout" }>,
): WorkoutDraft {
  return {
    muscleGroups: [
      ...new Set([
        ...action.muscleGroups,
        ...action.exercises.map((exercise) => exercise.muscleGroup),
      ]),
    ],
    entries: action.exercises.map((exercise) => ({
      id: createUuid(),
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      setCount: exercise.setCount,
      reps: Array.from(
        { length: exercise.setCount },
        (_, index) =>
          exercise.targetReps[index] ?? exercise.targetReps.at(-1) ?? 8,
      ),
      weight: exercise.suggestedWeightLb ?? undefined,
      plan: {
        rir: exercise.targetRir ?? undefined,
        restSeconds: exercise.restSeconds ?? undefined,
        technique: exercise.technique ?? undefined,
      },
    })),
    location: "",
    notes: [
      `Coach plan: ${action.rationale}`,
      ...action.exercises.map(
        (exercise) =>
          `${exercise.name}: ${exercise.targetRir ?? "?"} RIR, ${exercise.restSeconds ?? "?"}s rest. ${exercise.technique ?? ""}`,
      ),
    ]
      .join("\n")
      .slice(0, 1000),
  };
}

export function cardioDraftFromCoach(
  action: Extract<CoachActionPayload, { kind: "next_workout" }>,
) {
  if (!action.cardio) return undefined;
  return {
    activityType: action.cardio.activityType,
    durationMinutes: action.cardio.durationMinutes,
    distanceMiles: action.cardio.distanceMiles ?? undefined,
    notes: [
      action.cardio.notes,
      `Coach plan (${action.cardio.intensity}): ${action.rationale}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function mergeWorkoutDrafts(
  existing: WorkoutDraft | undefined,
  proposed: WorkoutDraft,
  mode: CoachDraftMode,
): WorkoutDraft {
  if (!existing || mode === "replace") return proposed;
  return {
    entryDay: existing.entryDay,
    muscleGroups: [
      ...new Set([...existing.muscleGroups, ...proposed.muscleGroups]),
    ],
    entries: [...existing.entries, ...proposed.entries],
    location: existing.location,
    notes: [existing.notes, proposed.notes]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 1000),
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  cardioDraftFromCoach,
  mergeWorkoutDrafts,
  workoutDraftFromCoach,
} from "./draft-action-model";

const proposed = workoutDraftFromCoach({
  kind: "next_workout",
  title: "Push",
  rationale: "Continue recent progress.",
  recommendation: "lifting",
  muscleGroups: ["Chest", "Tri"],
  exercises: [
    {
      name: "Bench press",
      muscleGroup: "Chest",
      setCount: 3,
      targetReps: [8, 9, 10],
      suggestedWeightLb: 185,
      targetRir: 2,
      restSeconds: 150,
      technique: "Control the lowering phase.",
    },
  ],
  cardio: null,
});

test("coach workout maps to the existing editable local draft", () => {
  assert.deepEqual(proposed.entries[0].reps, [8, 9, 10]);
  assert.equal(proposed.entries[0].weight, 185);
  assert.deepEqual(proposed.entries[0].plan, {
    rir: 2,
    restSeconds: 150,
    technique: "Control the lowering phase.",
  });
  assert.match(proposed.notes, /Continue recent progress/);
});

test("coach workout fills every set target and includes exercise groups", () => {
  const draft = workoutDraftFromCoach({
    kind: "next_workout",
    title: "Upper body",
    rationale: "Use a manageable volume.",
    recommendation: "lifting",
    muscleGroups: ["Chest"],
    exercises: [
      {
        name: "Shoulder press",
        muscleGroup: "Delt",
        setCount: 3,
        targetReps: [10],
        suggestedWeightLb: 40,
      },
    ],
    cardio: null,
  });
  assert.deepEqual(draft.muscleGroups, ["Chest", "Delt"]);
  assert.deepEqual(draft.entries[0].reps, [10, 10, 10]);
});

test("append preserves an existing workout while replace discards it", () => {
  const existing = {
    muscleGroups: ["Back" as const],
    entries: [
      {
        id: "old",
        name: "Row",
        muscleGroup: "Back" as const,
        setCount: 1,
        reps: [8],
        weight: 100,
      },
    ],
    location: "Home",
    entryDay: "2026-09-21",
    notes: "Existing",
  };
  const appended = mergeWorkoutDrafts(existing, proposed, "append");
  assert.equal(appended.entries.length, 2);
  assert.equal(appended.location, "Home");
  assert.equal(appended.entryDay, "2026-09-21");
  assert.equal(
    mergeWorkoutDrafts(existing, proposed, "replace").entries.length,
    1,
  );
});

test("cardio recommendations map to an editable cardio draft", () => {
  const draft = cardioDraftFromCoach({
    kind: "next_workout",
    title: "Recovery cardio",
    rationale: "Keep activity light after recent lifting.",
    recommendation: "cardio",
    muscleGroups: [],
    exercises: [],
    cardio: {
      activityType: "walk",
      durationMinutes: 30,
      distanceMiles: null,
      intensity: "easy",
      notes: "Conversational pace",
    },
  });
  assert.equal(draft?.activityType, "walk");
  assert.equal(draft?.durationMinutes, 30);
  assert.match(draft?.notes ?? "", /easy/);
});

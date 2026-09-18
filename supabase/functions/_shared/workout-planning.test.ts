import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultWorkoutPreferences,
  workoutPreferencesSchema,
  trainingPlanningSummary,
} from "./workout-planning.ts";
test("planner validates optional focus, equipment, readiness and bounded session time", () => {
  assert.deepEqual(
    workoutPreferencesSchema.parse(defaultWorkoutPreferences).focus,
    [],
  );
  assert.equal(
    workoutPreferencesSchema.safeParse({
      ...defaultWorkoutPreferences,
      equipment: [],
    }).success,
    false,
  );
  assert.equal(
    workoutPreferencesSchema.safeParse({
      ...defaultWorkoutPreferences,
      minutes: NaN,
    }).success,
    false,
  );
  assert.equal(
    workoutPreferencesSchema.safeParse({
      ...defaultWorkoutPreferences,
      minutes: 180,
    }).success,
    false,
  );
});
test("weekly volume excludes old/future/invalid sets, counts paired rows once and preserves last dates", () => {
  const workouts = [
    { id: "recent", completed_at: "2026-09-16T12:00:00Z" },
    { id: "month", completed_at: "2026-09-01T12:00:00Z" },
    { id: "old", completed_at: "2026-07-01T12:00:00Z" },
    { id: "future", completed_at: "2026-10-01T12:00:00Z" },
  ];
  const sets = [
    { session_id: "recent", muscle_group: "Back", reps: 10, right_reps: 10 },
    { session_id: "month", muscle_group: "Back", reps: 8 },
    { session_id: "old", muscle_group: "Back", reps: 8 },
    { session_id: "future", muscle_group: "Back", reps: 8 },
    { session_id: "recent", muscle_group: "Back", reps: 0 },
  ];
  assert.deepEqual(
    trainingPlanningSummary(workouts, sets, new Date("2026-09-17T12:00:00Z"))
      .byPrimaryMuscle.Back,
    { sets7d: 1, sets28d: 2, lastAt: "2026-09-16T12:00:00Z" },
  );
});

test("beginner plans require explicit effort and recovery guidance before application", async () => {
  const { workoutPlanIssue } = await import("./workout-planning.ts");
  const action = {
    kind: "next_workout" as const,
    title: "Session",
    rationale: "Beginner",
    recommendation: "lifting" as const,
    muscleGroups: ["Legs" as const],
    exercises: [
      {
        name: "Bodyweight squat",
        muscleGroup: "Legs" as const,
        setCount: 2,
        targetReps: [8, 8],
        suggestedWeightLb: null,
        targetRir: 3,
        restSeconds: 120,
        technique: "Lower with control.",
      },
    ],
    cardio: null,
  };
  assert.equal(workoutPlanIssue(action, defaultWorkoutPreferences), undefined);
  assert.match(
    workoutPlanIssue(
      { ...action, exercises: [{ ...action.exercises[0], targetRir: 0 }] },
      defaultWorkoutPreferences,
    )!,
    /repetitions in reserve/,
  );
  assert.match(
    workoutPlanIssue(
      { ...action, exercises: [{ ...action.exercises[0], restSeconds: null }] },
      defaultWorkoutPreferences,
    )!,
    /guidance/,
  );
});

test("single-session preferences reject conflicting equipment and require custom descriptions", () => {
  assert.equal(
    workoutPreferencesSchema.safeParse({
      ...defaultWorkoutPreferences,
      equipment: ["bodyweight", "dumbbells"],
    }).success,
    false,
  );
  assert.equal(
    workoutPreferencesSchema.safeParse({
      ...defaultWorkoutPreferences,
      goals: ["other"],
    }).success,
    false,
  );
  const parsed = workoutPreferencesSchema.parse({
    ...defaultWorkoutPreferences,
    sessionType: "cardio",
    goals: ["other"],
    goalOther: "Hiking preparation",
    styles: ["other"],
    styleOther: "Easy hills",
  });
  assert.equal(parsed.daysPerWeek, undefined);
  assert.equal(parsed.goalOther, "Hiking preparation");
});

test("cardio and mixed plans must populate the requested sections within shared time", async () => {
  const { workoutPlanIssue } = await import("./workout-planning.ts");
  const action = {
    kind: "next_workout" as const,
    title: "Mixed",
    rationale: "One session",
    recommendation: "combo" as const,
    muscleGroups: ["Legs" as const],
    exercises: [
      {
        name: "Squat",
        muscleGroup: "Legs" as const,
        setCount: 3,
        targetReps: [8, 8, 8],
        suggestedWeightLb: null,
        targetRir: 3,
        restSeconds: 120,
        technique: "Controlled reps",
      },
    ],
    cardio: {
      activityType: "walk" as const,
      durationMinutes: 15,
      distanceMiles: null,
      intensity: "easy" as const,
      notes: "Conversational pace",
    },
  };
  const preferences = {
    ...defaultWorkoutPreferences,
    sessionType: "combo" as const,
    minutes: 30,
  };
  assert.equal(workoutPlanIssue(action, preferences), undefined);
  assert.match(
    workoutPlanIssue({ ...action, cardio: null }, preferences)!,
    /missing/,
  );
  assert.match(
    workoutPlanIssue(
      { ...action, cardio: { ...action.cardio, durationMinutes: 28 } },
      preferences,
    )!,
    /together exceed/,
  );
  assert.match(
    workoutPlanIssue(action, { ...preferences, sessionType: "cardio" })!,
    /match/,
  );
  const cardio = {
    ...action,
    recommendation: "cardio" as const,
    exercises: [],
    muscleGroups: [],
  };
  assert.equal(
    workoutPlanIssue(cardio, { ...preferences, sessionType: "cardio" }),
    undefined,
  );
  assert.match(
    workoutPlanIssue(
      { ...cardio, exercises: action.exercises },
      { ...preferences, sessionType: "cardio" },
    )!,
    /unexpected/,
  );
});

test("multi-select choices normalize legacy aliases and reject empty/unknown selections with field errors", async () => {
  const { workoutPreferenceErrors } = await import("./workout-planning.ts");
  const multi = workoutPreferencesSchema.parse({
    ...defaultWorkoutPreferences,
    goals: ["muscle", "strength", "conditioning", "endurance"],
    styles: ["science", "bodyweight", "calisthenics", "hiit", "intervals"],
  });
  assert.deepEqual(multi.goals, ["strength_muscle", "endurance"]);
  assert.deepEqual(multi.styles, ["science", "calisthenics", "intervals"]);
  const legacy: Record<string, unknown> = {
    ...defaultWorkoutPreferences,
    goal: "strength",
    style: "bodyweight",
  };
  delete legacy.goals;
  delete legacy.styles;
  assert.deepEqual(workoutPreferencesSchema.parse(legacy).goals, [
    "strength_muscle",
  ]);
  assert.deepEqual(workoutPreferencesSchema.parse(legacy).styles, [
    "calisthenics",
  ]);
  for (const patch of [
    { goals: [] },
    { styles: [] },
    { goals: ["obsolete"] },
    { minutes: undefined },
  ]) {
    const parsed = workoutPreferencesSchema.safeParse({
      ...defaultWorkoutPreferences,
      ...patch,
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const issue = workoutPreferenceErrors(parsed.error.issues)[0];
      assert.equal(issue.field, Object.keys(patch)[0]);
      assert.doesNotMatch(
        issue.message,
        /undefined|Invalid option|expected number/,
      );
    }
  }
});

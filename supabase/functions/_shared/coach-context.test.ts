import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachSnapshot, utcBoundsForLocalDay } from "./coach-context.ts";

const enabledProfile = {
  primary_goal: "muscle_gain",
  experience_level: "intermediate",
  training_days_per_week: 4,
  session_minutes: 60,
  equipment: ["full gym"],
  response_style: "concise",
};

test("coach snapshot calculates goals, today's intake, trends and training aggregates", () => {
  const snapshot = buildCoachSnapshot({
    profile: {
      daily_calorie_goal: 2400,
      daily_protein_goal: 180,
      weight_goal_lb: 190,
    },
    coachProfile: enabledProfile,
    localDate: "2026-09-11",
    now: new Date("2026-09-11T12:00:00Z"),
    nutrition: [
      { occurred_at: "2026-09-11T10:00:00Z", calories: 500, protein_grams: 40 },
      { occurred_at: "2026-09-10T10:00:00Z", calories: 600, protein_grams: 50 },
    ],
    hydration: [{ occurred_at: "2026-09-11T09:00:00Z", volume_ml: 750 }],
    vitals: [
      {
        kind: "weight",
        value: 180,
        unit: "lb",
        occurred_at: "2026-09-11T08:00:00Z",
      },
      {
        kind: "weight",
        value: 178,
        unit: "lb",
        occurred_at: "2026-09-05T08:00:00Z",
      },
    ],
    workouts: [
      { id: "one", completed_at: "2026-09-10T18:00:00Z" },
      { id: "previous", completed_at: "2026-09-03T18:00:00Z" },
    ],
    sets: [
      {
        session_id: "one",
        exercise_name: "Bench press",
        muscle_group: "Chest",
        weight: 185,
        weight_unit: "lb",
        reps: 8,
      },
      {
        session_id: "one",
        exercise_name: "Bench press",
        muscle_group: "Chest",
        weight: 185,
        weight_unit: "lb",
        reps: 10,
      },
      {
        session_id: "previous",
        exercise_name: "Bench press",
        muscle_group: "Chest",
        weight: 185,
        weight_unit: "lb",
        reps: 8,
      },
    ],
    cardio: [{ occurred_at: "2026-09-09T08:00:00Z", duration_minutes: 30 }],
    photos: [{ taken_at: "2026-09-11T08:00:00Z" }],
  });
  assert.deepEqual(snapshot.today, {
    calories: 500,
    proteinGrams: 40,
    hydrationMl: 750,
    foodsLogged: 1,
  });
  assert.equal(snapshot.weight.average7dLb, 179);
  assert.equal(snapshot.training28d.setsByMuscle.Chest, 3);
  assert.deepEqual(snapshot.training28d.strongestRecentSets["Bench press"], {
    weightLb: 185,
    reps: 10,
  });
  assert.equal(
    snapshot.training28d.latestVsPriorSession["Bench press"].direction,
    "progressed",
  );
});

test("disabled data categories are absent from coach context", () => {
  const snapshot = buildCoachSnapshot({
    profile: {},
    coachProfile: {
      ...enabledProfile,
      use_nutrition: false,
      use_training: false,
      use_vitals: false,
      use_hydration: false,
      use_photo_metadata: false,
    },
    localDate: "2026-09-11",
    nutrition: [{ occurred_at: "2026-09-11", calories: 1, protein_grams: 1 }],
    hydration: [{ occurred_at: "2026-09-11", volume_ml: 1 }],
    vitals: [
      { kind: "weight", value: 180, unit: "lb", occurred_at: "2026-09-11" },
    ],
    workouts: [{ id: "one", completed_at: "2026-09-11" }],
    sets: [],
    cardio: [],
    photos: [{ taken_at: "2026-09-11" }],
  });
  assert.equal(snapshot.today.calories, 0);
  assert.equal(snapshot.weight, null);
  assert.equal(snapshot.training28d, null);
  assert.deepEqual(snapshot.goals, {
    calories: null,
    proteinGrams: null,
    waterMl: null,
    weightLb: null,
  });
  assert.equal(snapshot.progressPhotoMetadata, null);
});

test("coach day totals and query bounds use the user's timezone", () => {
  const snapshot = buildCoachSnapshot({
    profile: {},
    coachProfile: enabledProfile,
    localDate: "2026-09-10",
    timezone: "America/New_York",
    nutrition: [
      { occurred_at: "2026-09-11T02:00:00Z", calories: 400, protein_grams: 30 },
    ],
    hydration: [],
    vitals: [],
    workouts: [],
    sets: [],
    cardio: [],
    photos: [],
  });
  assert.equal(snapshot.today.calories, 400);
  assert.deepEqual(utcBoundsForLocalDay("2026-11-01", "America/New_York"), {
    start: "2026-11-01T04:00:00.000Z",
    end: "2026-11-02T05:00:00.000Z",
  });
});

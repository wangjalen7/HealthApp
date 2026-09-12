import assert from "node:assert/strict";
import test from "node:test";

import { coachActionPayloadSchema } from "./coach.ts";
import {
  proposedFoodMatchesUserMessage,
  proposedFoodSupportsUnit,
  trainingActionHasValidShape,
} from "./coach-action-validation.ts";

const proposedFood = coachActionPayloadSchema.parse({
  kind: "next_meal",
  title: "Chicken and rice",
  rationale: "Uses the foods the user requested.",
  mealType: "dinner",
  items: [
    {
      profileId: null,
      name: "Grilled chicken breast",
      description: "Cooked skinless chicken",
      amount: 170,
      unit: "g",
      servingLabel: "1 breast",
      servingWeightGrams: 170,
      servingVolumeMl: null,
      householdQuantityPerServing: 1,
      householdUnit: "breast",
      nutrientsPerServing: {
        calories: 280,
        proteinGrams: 53,
        carbohydrateGrams: 0,
        fatGrams: 6,
        fiberGrams: 0,
        sugarGrams: 0,
        sodiumMg: 125,
      },
    },
  ],
});

test("proposed foods must be grounded in the latest user message", () => {
  assert.equal(
    proposedFoodMatchesUserMessage(
      "Grilled chicken breast",
      "Use chicken and rice for my meal.",
    ),
    true,
  );
  assert.equal(
    proposedFoodMatchesUserMessage("Salmon", "Use chicken and rice."),
    false,
  );
});

test("proposed labels contain the basis needed for their selected unit", () => {
  if (proposedFood.kind !== "next_meal") throw new Error("Unexpected action");
  const item = proposedFood.items[0];
  if (item.profileId !== null) throw new Error("Expected a proposed label");
  assert.equal(proposedFoodSupportsUnit(item), true);
  assert.equal(
    proposedFoodSupportsUnit({
      ...item,
      servingWeightGrams: null,
    }),
    false,
  );
});

test("training plans enforce lifting, cardio, combo, and rest payloads", () => {
  const base = {
    kind: "next_workout" as const,
    title: "Next session",
    rationale: "Matches recent frequency and recovery.",
    muscleGroups: ["Chest" as const],
    exercises: [
      {
        name: "Bench press",
        muscleGroup: "Chest" as const,
        setCount: 3,
        targetReps: [8, 8, 8],
        suggestedWeightLb: 185,
      },
    ],
    cardio: null,
  };
  assert.equal(
    trainingActionHasValidShape({ ...base, recommendation: "lifting" }),
    true,
  );
  assert.equal(
    trainingActionHasValidShape({ ...base, recommendation: "cardio" }),
    false,
  );
  assert.equal(
    trainingActionHasValidShape({
      ...base,
      recommendation: "cardio",
      muscleGroups: [],
      exercises: [],
      cardio: {
        activityType: "walk",
        durationMinutes: 30,
        distanceMiles: null,
        intensity: "easy",
        notes: "Recovery pace",
      },
    }),
    true,
  );
  assert.equal(
    trainingActionHasValidShape({
      ...base,
      recommendation: "combo",
      cardio: {
        activityType: "cycle",
        durationMinutes: 15,
        distanceMiles: null,
        intensity: "moderate",
        notes: "After lifting",
      },
    }),
    true,
  );
  assert.equal(
    trainingActionHasValidShape({
      ...base,
      recommendation: "rest",
      muscleGroups: [],
      exercises: [],
    }),
    true,
  );
});

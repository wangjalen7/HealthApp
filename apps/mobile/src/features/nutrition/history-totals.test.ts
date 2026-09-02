import assert from "node:assert/strict";
import test from "node:test";

import { dailyNutritionTotals } from "./history-totals";

test("totals complete daily nutrition and hydration", () => {
  const totals = dailyNutritionTotals(
    [
      {
        calories: 400,
        proteinGrams: 30,
        carbohydrateGrams: 35,
        fatGrams: 12,
        fiberGrams: 5,
        sugarGrams: 4,
        sodiumMg: 300,
      },
      {
        calories: 250,
        proteinGrams: 10,
        carbohydrateGrams: 20,
        fatGrams: 8,
        fiberGrams: 3,
        sugarGrams: 6,
        sodiumMg: 200,
      },
    ],
    946.35,
  );
  assert.equal(totals.calories, 650);
  assert.equal(totals.proteinGrams, 40);
  assert.equal(totals.waterMl, 946.35);
  assert.deepEqual(totals.carbohydrateGrams, {
    value: 55,
    hasAny: true,
    complete: true,
  });
  assert.equal(totals.sodiumMg.value, 500);
});

test("marks a nutrient incomplete when any food is missing it", () => {
  const totals = dailyNutritionTotals(
    [
      { calories: 100, proteinGrams: 2, fiberGrams: 4 },
      { calories: 200, proteinGrams: 8 },
    ],
    0,
  );
  assert.deepEqual(totals.fiberGrams, {
    value: 4,
    hasAny: true,
    complete: false,
  });
  assert.deepEqual(totals.sugarGrams, {
    value: 0,
    hasAny: false,
    complete: false,
  });
});

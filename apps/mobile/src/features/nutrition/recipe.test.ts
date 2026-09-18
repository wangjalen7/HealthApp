import assert from "node:assert/strict";
import test from "node:test";

import { calculateFoodAmount, mealDraftEntrySchema } from "./model";
import {
  foodRecipeSchema,
  recipeFoodBasis,
  recipeMealDraftEntry,
  recipeTotalNutrients,
} from "./recipe";

function ingredient(
  id: string,
  name: string,
  calories: number,
  proteinGrams: number,
  fatGrams?: number,
) {
  return mealDraftEntrySchema.parse({
    id,
    name,
    source: "manual",
    isUserCorrected: false,
    servingWeightGrams: 100,
    nutrientsPerServing: { calories, proteinGrams, fatGrams },
    amount: 1,
    unit: "serving",
    servingCount: 1,
    consumedWeightGrams: 100,
    totalNutrients: { calories, proteinGrams, fatGrams },
    entryMethod: "profile",
  });
}

const pasta = ingredient(
  "10000000-0000-4000-8000-000000000001",
  "Pasta",
  800,
  28,
  4,
);
const meat = ingredient(
  "10000000-0000-4000-8000-000000000002",
  "Ground beef",
  400,
  40,
  24,
);

test("divides a multi-ingredient recipe by its declared serving yield", () => {
  const basis = recipeFoodBasis({
    name: "Pasta bake",
    yieldServings: 4,
    ingredients: [pasta, meat],
  });

  assert.equal(basis.nutrientsPerServing.calories, 300);
  assert.equal(basis.nutrientsPerServing.proteinGrams, 17);
  assert.equal(basis.nutrientsPerServing.fatGrams, 7);
  assert.equal(basis.householdQuantityPerServing, 0.25);
  assert.equal(basis.householdUnit, "recipe");
  assert.equal(basis.servingsPerContainer, 4);
  assert.equal(
    calculateFoodAmount(basis, 0.25, "household").totalNutrients.calories,
    300,
  );
});

test("treats a one-yield recipe as one complete serving", () => {
  const recipe = foodRecipeSchema.parse({
    id: "20000000-0000-4000-8000-000000000001",
    name: "Turkey sandwich",
    yieldServings: 1,
    ingredients: [pasta],
    createdAt: "2026-09-17T12:00:00.000Z",
    updatedAt: "2026-09-17T12:00:00.000Z",
  });
  const entry = recipeMealDraftEntry(
    recipe,
    "30000000-0000-4000-8000-000000000001",
  );

  assert.equal(entry.recipeId, recipe.id);
  assert.equal(entry.servingCount, 1);
  assert.equal(entry.totalNutrients.calories, 800);
  assert.equal(entry.entryMethod, "recipe");
  assert.equal(entry.saveToMyFoods, false);
});

test("keeps an optional recipe nutrient unknown when any ingredient omits it", () => {
  const unknownFat = ingredient(
    "10000000-0000-4000-8000-000000000003",
    "Sauce",
    100,
    2,
  );
  const totals = recipeTotalNutrients([pasta, unknownFat]);

  assert.equal(totals.calories, 900);
  assert.equal(totals.fatGrams, undefined);
});

test("rejects a recipe nested inside another recipe", () => {
  const nested = mealDraftEntrySchema.parse({
    ...pasta,
    id: "10000000-0000-4000-8000-000000000004",
    recipeId: "20000000-0000-4000-8000-000000000004",
    entryMethod: "recipe",
    saveToMyFoods: false,
  });

  assert.throws(() =>
    recipeFoodBasis({
      name: "Nested recipe",
      yieldServings: 2,
      ingredients: [nested],
    }),
  );
});

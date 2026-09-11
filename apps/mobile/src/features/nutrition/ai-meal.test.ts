import assert from "node:assert/strict";
import test from "node:test";
import {
  appendEstimatedEntries,
  capitalizeFoodLabel,
  deduplicateAiDraftEntries,
  estimatedFoodToEntry,
} from "./ai-meal";
import { calculateFoodAmount, nutritionDraftSchema } from "./model";
import type { EstimatedFood } from "../../../../../supabase/functions/_shared/meal-estimate";

const food: EstimatedFood = {
  name: "Cooked pasta",
  description: "Plain cooked pasta",
  portionAmount: 1,
  portionUnit: "serving",
  servingLabel: "1 serving (250 g)",
  servingWeightGrams: 250,
  servingVolumeMl: null,
  householdQuantityPerServing: null,
  householdUnit: null,
  confidence: "medium",
  assumptions: "Cooked weight estimated",
  nutrientsPerServing: {
    calories: 395,
    proteinGrams: 14.5,
    carbohydrateGrams: 77.5,
    fatGrams: 2.25,
    fiberGrams: 4.5,
    sugarGrams: 1.5,
    sodiumMg: 2.5,
  },
};
const id = "11111111-1111-4111-8111-111111111111";

test("AI label names are trimmed and begin with a capital letter", () => {
  assert.equal(capitalizeFoodLabel("  pork   dumplings "), "Pork dumplings");
  assert.equal(capitalizeFoodLabel("8 pork dumplings"), "8 Pork dumplings");
  assert.equal(
    estimatedFoodToEntry({ ...food, name: "cooked pasta" }, id).name,
    "Cooked pasta",
  );
});

test("AI food stores one-serving nutrition and scales through estimated weight", () => {
  const entry = estimatedFoodToEntry(food, id);
  assert.equal(entry.totalNutrients.calories, 395);
  assert.equal(entry.totalNutrients.proteinGrams, 14.5);
  assert.equal(entry.servingWeightGrams, 250);
  assert.equal(entry.consumedWeightGrams, 250);
  assert.equal(entry.source, "ai");
  assert.equal(
    calculateFoodAmount(entry, 125, "g").totalNutrients.calories,
    198,
  );
  assert.deepEqual(
    nutritionDraftSchema.parse({ mealType: "dinner", entries: [entry] })
      .entries[0],
    entry,
  );
  assert.equal(entry.note, "AI estimate (medium confidence).");
  assert.doesNotMatch(entry.note ?? "", /Plain cooked pasta/);
});

test("counted foods use an editable item amount with nutrition for one item", () => {
  const entry = estimatedFoodToEntry(
    {
      ...food,
      name: "Pork dumplings",
      description: "Steamed pork dumplings",
      portionAmount: 8,
      portionUnit: "household",
      servingLabel: "1 dumpling (25 g)",
      servingWeightGrams: 25,
      householdQuantityPerServing: 1,
      householdUnit: "dumpling",
      nutrientsPerServing: {
        calories: 80,
        proteinGrams: 4,
        carbohydrateGrams: 8,
        fatGrams: 3.5,
        fiberGrams: 0.5,
        sugarGrams: 0.5,
        sodiumMg: 160,
      },
    },
    id,
  );
  assert.equal(entry.amount, 8);
  assert.equal(entry.unit, "household");
  assert.equal(entry.householdUnit, "dumpling");
  assert.equal(entry.servingCount, 8);
  assert.equal(entry.consumedWeightGrams, 200);
  assert.equal(entry.totalNutrients.calories, 640);
  assert.equal(
    calculateFoodAmount(entry, 6, "household").totalNutrients.calories,
    480,
  );
});

test("liquid estimates preserve volume without introducing a weight conversion", () => {
  const entry = estimatedFoodToEntry(
    {
      ...food,
      name: "Milk",
      portionUnit: "serving",
      portionAmount: 1,
      servingLabel: "1 cup (240 mL)",
      servingWeightGrams: null,
      servingVolumeMl: 240,
    },
    id,
  );
  assert.equal(entry.consumedVolumeMl, 240);
  assert.equal(entry.servingWeightGrams, undefined);
  assert.throws(() => calculateFoodAmount(entry, 1, "oz"));
});

test("invalid output cannot become food entries", () => {
  assert.throws(() => estimatedFoodToEntry({ ...food, portionAmount: 0 }, id));
  assert.throws(() =>
    estimatedFoodToEntry(
      { ...food, portionUnit: "g", servingWeightGrams: null },
      id,
    ),
  );
  assert.throws(() =>
    estimatedFoodToEntry(
      {
        ...food,
        nutrientsPerServing: {
          ...food.nutrientsPerServing,
          calories: NaN,
        },
      },
      id,
    ),
  );
});

test("adding estimates preserves existing food and removes repeated IDs or identical foods", () => {
  const entry = estimatedFoodToEntry(food, id);
  const duplicateWithNewId = {
    ...entry,
    id: "22222222-2222-4222-8222-222222222222",
  };
  const sameAiFoodWithChangedEstimate = estimatedFoodToEntry(
    {
      ...food,
      name: "Plain cooked pasta",
      description: "Pasta with another estimate",
      nutrientsPerServing: { ...food.nutrientsPerServing, calories: 410 },
    },
    "44444444-4444-4444-8444-444444444444",
  );
  const other = estimatedFoodToEntry(
    { ...food, name: "Chicken" },
    "33333333-3333-4333-8333-333333333333",
  );
  assert.deepEqual(
    appendEstimatedEntries(
      [entry],
      [entry, duplicateWithNewId, sameAiFoodWithChangedEstimate, other],
    ),
    [entry, other],
  );
  assert.deepEqual(
    deduplicateAiDraftEntries([
      entry,
      sameAiFoodWithChangedEstimate,
      {
        ...sameAiFoodWithChangedEstimate,
        id: "55555555-5555-4555-8555-555555555555",
        source: "manual",
      },
    ]).map((item) => item.source),
    ["ai", "manual"],
  );
  assert.throws(() =>
    appendEstimatedEntries(
      Array.from({ length: 100 }, (_, index) => ({
        ...entry,
        id: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
        name: `Food ${index}`,
      })),
      [other],
    ),
  );
});

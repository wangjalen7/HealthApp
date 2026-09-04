import assert from "node:assert/strict";
import test from "node:test";

import {
  availableFoodUnits,
  buildServingLabel,
  calculateFoodAmount,
  convertVolumeAmount,
  convertWeightAmount,
  foodBasisFromHistorySnapshot,
  canonicalFoodBarcode,
  foodAmountDescription,
  foodAmountUnitLabel,
  foodNameMatchesQuery,
  foodProfileContentKey,
  formatFoodMeasurementAmount,
  hasReproducibleServingBasis,
  isSpecificHouseholdUnit,
  shouldPreferSavedFoodProfile,
  normalizeHouseholdUnit,
  preferredVolumeUnitFromServingLabel,
  preferredWeightUnitFromServingLabel,
  type FoodBasis,
} from "./model";

test("reconstructs a per-serving basis for editing historical amounts", () => {
  const basis = foodBasisFromHistorySnapshot({
    name: "Protein shake",
    source: "open_food_facts",
    servingLabel: "1 bottle (414 mL)",
    householdQuantityPerServing: 1,
    householdUnit: "bottle",
    amount: 1,
    unit: "household",
    servingCount: 1,
    consumedVolumeMl: 414,
    totalNutrients: { calories: 170, proteinGrams: 26 },
  });
  const halfBottle = calculateFoodAmount(basis, 0.5, "household");
  assert.equal(halfBottle.totalNutrients.calories, 85);
  assert.equal(halfBottle.totalNutrients.proteinGrams, 13);
  assert.equal(halfBottle.consumedVolumeMl, 207);
});

test("canonicalizes equivalent UPC and EAN profile barcodes", () => {
  assert.equal(canonicalFoodBarcode("034000470693"), "00034000470693");
  assert.equal(canonicalFoodBarcode("0034000470693"), "00034000470693");
  assert.equal(canonicalFoodBarcode(" 04-252-614 "), "00000004252614");
  assert.equal(canonicalFoodBarcode(undefined), undefined);
});

test("requires an exact normalized food name before suppressing label creation", () => {
  assert.equal(foodNameMatchesQuery("Chicken  Thigh", " chicken thigh "), true);
  assert.equal(foodNameMatchesQuery("Chicken Thigh", "chicken"), false);
  assert.equal(foodNameMatchesQuery("Chicken Thigh", ""), false);
});

test("deduplicates only barcode-free labels with the same full content", () => {
  const first: FoodBasis = {
    name: "  Greek   Yogurt ",
    brand: "Example Brand",
    source: "manual",
    isUserCorrected: false,
    servingWeightGrams: 170,
    nutrientsPerServing: { calories: 100, proteinGrams: 17 },
  };
  assert.equal(
    foodProfileContentKey(first),
    foodProfileContentKey({
      ...first,
      name: "greek yogurt",
      brand: "example brand",
      isUserCorrected: true,
    }),
  );
  assert.notEqual(
    foodProfileContentKey(first),
    foodProfileContentKey({
      ...first,
      nutrientsPerServing: { calories: 120, proteinGrams: 17 },
    }),
  );
});

test("does not repeat a household amount already present in the serving label", () => {
  assert.equal(
    foodAmountDescription(1, "household", "bottle", "1 bottle (14 fl oz)"),
    "1 bottle (14 fl oz)",
  );
  assert.equal(
    foodAmountDescription(1, "household", "package", "1 package (49.6 g)"),
    "1 package (49.6 g)",
  );
  assert.equal(
    foodAmountDescription(2, "household", "bottle", "1 bottle (14 fl oz)"),
    "2 bottles · 1 bottle (14 fl oz)",
  );
});

const basis: FoodBasis = {
  name: "Test food",
  source: "manual",
  isUserCorrected: false,
  servingWeightGrams: 28.349523125,
  servingVolumeMl: 236.5882365,
  nutrientsPerServing: { calories: 100, proteinGrams: 10, sodiumMg: 200 },
};

test("converts exact weight units before scaling nutrition", () => {
  const oneOunce = calculateFoodAmount(basis, 1, "oz");
  const onePound = calculateFoodAmount(basis, 1, "lb");
  assert.equal(oneOunce.servingCount, 1);
  assert.equal(oneOunce.totalNutrients.calories, 100);
  assert.equal(onePound.servingCount, 16);
  assert.equal(onePound.totalNutrients.proteinGrams, 160);
});

test("converts and formats serving measurements when their unit changes", () => {
  assert.equal(
    formatFoodMeasurementAmount(convertWeightAmount(113.4, "g", "oz")),
    "4",
  );
  assert.equal(
    formatFoodMeasurementAmount(convertWeightAmount(4, "oz", "g")),
    "113.4",
  );
  assert.equal(
    formatFoodMeasurementAmount(convertVolumeAmount(414, "ml", "fl_oz")),
    "14",
  );
  assert.equal(
    formatFoodMeasurementAmount(convertVolumeAmount(1, "cup", "ml")),
    "236.59",
  );
});

test("builds serving display text from structured conversions", () => {
  assert.equal(
    buildServingLabel({
      householdAmount: 1,
      householdUnit: "package",
      weightAmount: 49.6,
      weightUnit: "g",
    }),
    "1 package (49.6 g)",
  );
  assert.equal(
    buildServingLabel({
      householdAmount: 12,
      householdUnit: "piece",
      weightAmount: 28,
    }),
    "12 pieces (28 g)",
  );
  assert.equal(
    buildServingLabel({
      householdAmount: 1,
      householdUnit: "bottle",
      volumeAmount: 14,
      volumeUnit: "fl_oz",
    }),
    "1 bottle (14 fl oz)",
  );
  assert.equal(
    buildServingLabel({ fallback: "2/3 cup prepared" }),
    "2/3 cup prepared",
  );
});

test("requires a reproducible serving basis", () => {
  assert.equal(hasReproducibleServingBasis({}), false);
  assert.equal(
    hasReproducibleServingBasis({
      householdAmount: 1,
      householdUnit: "serving",
    }),
    false,
  );
  assert.equal(
    hasReproducibleServingBasis({
      householdAmount: 1,
      householdUnit: "bottle",
    }),
    true,
  );
  assert.equal(hasReproducibleServingBasis({ weightAmount: 28 }), true);
  assert.equal(hasReproducibleServingBasis({ volumeAmount: 355 }), true);
  assert.equal(isSpecificHouseholdUnit("portion"), false);
  assert.equal(isSpecificHouseholdUnit("grams"), false);
  assert.equal(isSpecificHouseholdUnit("package"), true);
});

test("retains the measurement unit found in an existing serving label", () => {
  assert.equal(preferredWeightUnitFromServingLabel("1 package (4 oz)"), "oz");
  assert.equal(preferredWeightUnitFromServingLabel("1 bottle (14 fl oz)"), "g");
  assert.equal(
    preferredVolumeUnitFromServingLabel("1 bottle (14 fl oz)"),
    "fl_oz",
  );
  assert.equal(preferredVolumeUnitFromServingLabel("2/3 cup"), "cup");
});

test("converts US volume units without guessing density", () => {
  const cup = calculateFoodAmount(basis, 1, "cup");
  const tablespoons = calculateFoodAmount(basis, 16, "tbsp");
  assert.equal(cup.servingCount, 1);
  assert.equal(tablespoons.servingCount, 1);
  assert.equal(cup.totalNutrients.sodiumMg, 200);
});

test("only exposes conversions backed by serving metadata", () => {
  const servingOnly: FoodBasis = {
    name: "Serving only",
    source: "manual",
    isUserCorrected: false,
    nutrientsPerServing: { calories: 80, proteinGrams: 0 },
  };
  assert.deepEqual(availableFoodUnits(servingOnly), ["serving"]);
  assert.throws(
    () => calculateFoodAmount(servingOnly, 20, "g"),
    /weight conversion/,
  );
});

test("keeps zero protein as a valid nutrition value", () => {
  const result = calculateFoodAmount(
    {
      name: "Oil",
      source: "manual",
      isUserCorrected: false,
      nutrientsPerServing: { calories: 120, proteinGrams: 0, fatGrams: 14 },
    },
    2,
    "serving",
  );
  assert.equal(result.totalNutrients.proteinGrams, 0);
  assert.equal(result.totalNutrients.fatGrams, 28);
});

test("scales a package or piece amount through its household serving", () => {
  const crackers: FoodBasis = {
    name: "Crackers",
    source: "open_food_facts",
    isUserCorrected: false,
    householdQuantityPerServing: 12,
    householdUnit: "piece",
    servingLabel: "12 pieces",
    nutrientsPerServing: { calories: 150, proteinGrams: 3 },
  };
  assert.deepEqual(availableFoodUnits(crackers), ["serving", "household"]);
  assert.equal(calculateFoodAmount(crackers, 6, "household").servingCount, 0.5);
  assert.equal(
    calculateFoodAmount(crackers, 6, "household").totalNutrients.calories,
    75,
  );
  assert.equal(foodAmountUnitLabel("household", 1, "piece"), "piece");
  assert.equal(foodAmountUnitLabel("household", 6, "piece"), "pieces");
  assert.equal(normalizeHouseholdUnit(" Pieces "), "piece");
});

test("prefers every existing saved profile over a repeated scan result", () => {
  const providerBasis: FoodBasis = {
    name: "Provider food",
    source: "open_food_facts",
    isUserCorrected: false,
    nutrientsPerServing: { calories: 100, proteinGrams: 2 },
  };
  assert.equal(shouldPreferSavedFoodProfile(providerBasis), true);
  assert.equal(
    shouldPreferSavedFoodProfile({ ...providerBasis, isUserCorrected: true }),
    true,
  );
  assert.equal(
    shouldPreferSavedFoodProfile({ ...providerBasis, source: "manual" }),
    true,
  );
});

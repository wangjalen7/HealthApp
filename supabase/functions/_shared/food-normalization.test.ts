import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeFoodProduct,
  openFoodFactsProductResult,
  sentenceCaseFoodName,
} from "./food-normalization.ts";

test("turns an all-caps provider food name into sentence case", () => {
  assert.equal(sentenceCaseFoodName("SEA SALT POPPED CORN"), "Sea salt popped corn");
  assert.equal(sentenceCaseFoodName("PopCorners Sea Salt"), "PopCorners Sea Salt");
});

test("normalizes a package serving and v2 nutrient fields", () => {
  const product = normalizeFoodProduct({
    code: "0893594002068",
    product_name: "SEA SALT",
    brands: "PopCorners",
    serving_size: "1 package (28.3 g)",
    serving_quantity: 28.3,
    serving_quantity_unit: "g",
    nutriments: {
      "energy-kcal_serving": 120,
      proteins_serving: 2,
      "carbohydrates-total_serving": 23,
      fat_serving: 2.5,
      sodium_serving: 0.15,
    },
  }, "893594002068");

  assert.equal(product.foodName, "Sea salt");
  assert.equal(product.serving.label, "1 package (28.3 g)");
  assert.equal(product.serving.weightGrams, 28.3);
  assert.equal(product.serving.householdQuantity, 1);
  assert.equal(product.serving.householdUnit, "package");
  assert.equal(product.nutrients.calories, 120);
  assert.equal(product.nutrients.proteinGrams, 2);
  assert.equal(product.nutrients.carbohydrateGrams, 23);
  assert.equal(product.nutrients.sodiumMg, 150);
});

test("supports piece servings without inventing a 100 g conversion", () => {
  const product = normalizeFoodProduct({
    product_name: "CRACKERS",
    serving_size: "12 pieces",
    nutriments: {
      "energy-kcal_serving": 140,
      proteins_serving: 3,
    },
  }, "123456789012");

  assert.equal(product.serving.householdQuantity, 12);
  assert.equal(product.serving.householdUnit, "piece");
  assert.equal(product.serving.weightGrams, null);
  assert.equal(product.nutrients.calories, 140);
});

test("does not scale per-100g nutrition into an unweighted package", () => {
  const product = normalizeFoodProduct({
    product_name: "POPCORN",
    serving_size: "1 package",
    nutriments: {
      "energy-kcal_100g": 500,
      proteins_100g: 10,
    },
  }, "123456789012");

  assert.equal(product.serving.label, "1 package");
  assert.equal(product.serving.weightGrams, null);
  assert.equal(product.nutrients.calories, null);
  assert.equal(product.nutrients.proteinGrams, null);
});

test("uses 100 g only when the provider has no serving description", () => {
  const product = normalizeFoodProduct({
    product_name: "RICE",
    nutriments: {
      "energy-kcal_100g": 360,
      proteins_100g: 7,
    },
  }, "123456789012");

  assert.equal(product.serving.label, "100 g");
  assert.equal(product.serving.weightGrams, 100);
  assert.equal(product.nutrients.calories, 360);
});

test("parses v3 product-found and product-not-found responses explicitly", () => {
  assert.deepEqual(
    openFoodFactsProductResult({
      result: { id: "product_found" },
      status: "success",
      product: { code: "123", product_name: "Food" },
    }),
    { kind: "found", product: { code: "123", product_name: "Food" } },
  );
  assert.deepEqual(
    openFoodFactsProductResult({
      result: { id: "product_not_found" },
      status: "failure",
      errors: [{ message: { id: "product_not_found" } }],
    }),
    { kind: "not_found" },
  );
  assert.deepEqual(openFoodFactsProductResult({ status: "failure" }), {
    kind: "invalid_response",
  });
});

const nutrient = (value: number, unit = "g") => ({ value, unit });
const nutritionSet = (
  per: "serving" | "100g" | "100ml",
  perQuantity: number,
  perUnit: "g" | "ml",
  nutrients: Record<string, { value: number; unit: string }>,
) => ({
  source: "packaging",
  preparation: "as_sold",
  per,
  per_quantity: perQuantity,
  per_unit: perUnit,
  nutrients,
});

test("uses v3 serving nutrients but rejects an internally inconsistent package size", () => {
  const product = normalizeFoodProduct({
    code: "0810607023346",
    product_name: "WHITE CHEDDAR FLAVORED POPCORNERS",
    brands: "PopCorners",
    serving_size: "1 serving (100 g)",
    serving_quantity: 100,
    serving_quantity_unit: "g",
    nutrition: {
      input_sets: [
        nutritionSet("100g", 100, "g", {
          "energy-kcal": nutrient(483.870967741935, "kcal"),
          proteins: nutrient(6.0447310094701),
          carbohydrates: nutrient(66.492041104171),
          fat: nutrient(20.1491033649),
          sodium: nutrient(0.5641748942172),
        }),
        nutritionSet("serving", 100, "g", {
          "energy-kcal": nutrient(240, "kcal"),
          proteins: nutrient(4),
          carbohydrates: nutrient(33),
          fat: nutrient(11),
          fiber: nutrient(2.015),
          sugars: nutrient(6.045),
          sodium: nutrient(0.29),
        }),
      ],
    },
  }, "0810607023346");

  assert.equal(product.serving.label, null);
  assert.equal(product.serving.weightGrams, null);
  assert.equal(product.serving.volumeMl, null);
  assert.equal(product.serving.householdQuantity, null);
  assert.equal(product.serving.householdUnit, null);
  assert.equal(product.nutrients.calories, 240);
  assert.equal(product.nutrients.proteinGrams, 4);
  assert.equal(product.nutrients.carbohydrateGrams, 33);
  assert.equal(product.nutrients.fatGrams, 11);
  assert.equal(product.nutrients.fiberGrams, 2.015);
  assert.equal(product.nutrients.sugarGrams, 6.045);
  assert.equal(product.nutrients.sodiumMg, 290);
});

test("uses a v3 100ml nutrition basis as volume rather than weight", () => {
  const product = normalizeFoodProduct({
    code: "000000000001",
    product_name: "DIET COLA",
    nutrition: {
      aggregated_set: {
        per: "100ml",
        preparation: "as_sold",
        nutrients: {
          "energy-kcal": nutrient(0, "kcal"),
          proteins: nutrient(0),
          carbohydrates: nutrient(0),
          fat: nutrient(0),
          sugars: nutrient(0),
          sodium: nutrient(0.012),
        },
      },
    },
  }, "000000000001");

  assert.equal(product.serving.label, "100 mL");
  assert.equal(product.serving.weightGrams, null);
  assert.equal(product.serving.volumeMl, 100);
  assert.equal(product.nutrients.calories, 0);
  assert.equal(product.nutrients.proteinGrams, 0);
  assert.equal(product.nutrients.sodiumMg, 12);
});

test("does not expose 100 g when an aggregate basis conflicts with explicit package volume", () => {
  const product = normalizeFoodProduct({
    code: "000000000002",
    product_name: "COLA",
    quantity: "12 fl oz",
    nutrition: {
      aggregated_set: {
        per: "100g",
        preparation: "as_sold",
        nutrients: {
          "energy-kcal": nutrient(0, "kcal"),
          proteins: nutrient(0),
          sodium: nutrient(0.012),
        },
      },
    },
  }, "000000000002");

  assert.equal(product.serving.label, null);
  assert.equal(product.serving.weightGrams, null);
  assert.equal(product.serving.volumeMl, null);
  assert.equal(product.nutrients.calories, 0);
});

test("uses package volume only for a liquid container with an explicit ounce quantity", () => {
  const product = normalizeFoodProduct({
    code: "0811620021968",
    product_name: "High Protein Milkshake Vanilla",
    brands: "CORE POWER",
    quantity: "14oz",
    serving_size: "1 bottle (414 g)",
    serving_quantity: 414,
    serving_quantity_unit: "g",
    nutrition: {
      input_sets: [
        nutritionSet("100g", 100, "g", {
          "energy-kcal": nutrient(41, "kcal"),
          proteins: nutrient(6.28),
          carbohydrates: nutrient(1.45),
          fat: nutrient(1.09),
          sodium: nutrient(0.0628),
        }),
        nutritionSet("serving", 414, "g", {
          "energy-kcal": nutrient(170, "kcal"),
          proteins: nutrient(26),
          carbohydrates: nutrient(6),
          fat: nutrient(4.5),
          sodium: nutrient(0.26),
        }),
      ],
    },
  }, "0811620021968");

  assert.equal(product.serving.label, "1 bottle (14 fl oz)");
  assert.equal(product.serving.weightGrams, null);
  assert.equal(product.serving.volumeMl, 414);
  assert.equal(product.serving.householdQuantity, 1);
  assert.equal(product.serving.householdUnit, "bottle");
  assert.equal(product.nutrients.calories, 170);
  assert.equal(product.nutrients.proteinGrams, 26);
});

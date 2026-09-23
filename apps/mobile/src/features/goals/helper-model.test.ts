import assert from "node:assert/strict";
import test from "node:test";
import {
  calorieDefaults,
  calorieUnits,
  calculateCalorieResult,
  calculateFluidResult,
  fluidDefaults,
  fluidUnits,
  restoreCalorie,
  restoreFluid,
  targetWeeks,
  calorieResultSchema,
  appliedCalculation,
  type CalorieDraft,
  type FluidDraft,
} from "./helper-model";
import { poundsToKilograms } from "./calculator";

const now = new Date(2026, 8, 22, 12);
function details(patch: Partial<CalorieDraft> = {}): CalorieDraft {
  return {
    ...calorieDefaults("metric", "lose"),
    age: "30",
    sex: "male",
    heightMetric: "180",
    heightCm: 180,
    currentWeight: "80",
    weightKg: 80,
    activity: "active",
    goalWeight: "70",
    goalWeightKg: 70,
    targetDate: "2027-01-12",
    ...patch,
  };
}
test("calendar duration handles DST, leap days and years without elapsed-hour drift", () => {
  assert.equal(targetWeeks("2026-03-01", "2026-03-15"), 2);
  assert.equal(targetWeeks("2026-10-25", "2026-11-08"), 2);
  assert.equal(targetWeeks("2028-02-22", "2028-03-07"), 2);
  assert.equal(targetWeeks("2026-12-28", "2027-01-04"), 1);
  assert.equal(targetWeeks("2026-09-22", "2027-01-12"), 16);
});
test("calendar rejects invalid, past, same-day, too short and too long durations", () => {
  for (const date of [
    "",
    "bad",
    "2027-02-29",
    "2026-09-21",
    "2026-09-22",
    "2026-09-28",
    "2040-01-01",
  ])
    assert.throws(() => targetWeeks("2026-09-22", date));
  assert.equal(targetWeeks("2026-09-22", "2026-09-29"), 1);
});
test("date plan uses its exact rate and saves the calculation start, without standard-rate substitution", () => {
  const inputs = details({
    weightKg: poundsToKilograms(180),
    goalWeightKg: poundsToKilograms(163.9),
  });
  const result = calculateCalorieResult(inputs, now);
  assert.ok(Math.abs(result.rateLbPerWeek! - 1.00625) < 1e-10);
  assert.equal(
    result.target,
    Math.round(result.maintenance! - result.rateLbPerWeek! * 500),
  );
  assert.equal(result.startDate, "2026-09-22");
  assert.equal(result.assumptions.targetDate, "2027-01-12");
  const serialized = JSON.parse(JSON.stringify(result));
  assert.deepEqual(calorieResultSchema.parse(serialized), serialized);
  const restored = restoreCalorie(
    { latestCalculation: serialized },
    details({ weightKg: 60 }),
    2200,
  );
  assert.deepEqual(restored.result, serialized);
  const later = calculateCalorieResult(inputs, new Date(2026, 8, 29, 12));
  assert.equal(later.weeks, 15);
  assert.notEqual(later.target, result.target);
  assert.equal(restored.result!.startDate, "2026-09-22");
});
test("unsupported dates never fall back to another rate", () => {
  assert.throws(
    () => calculateCalorieResult(details({ targetDate: "2026-09-29" }), now),
    /later date/,
  );
  assert.throws(
    () => calculateCalorieResult(details({ goalWeightKg: 79.99 }), now),
    /closer date/,
  );
  assert.throws(
    () => calculateCalorieResult(details({ goalWeightKg: 90 }), now),
    /below current/,
  );
  assert.throws(
    () => calculateCalorieResult(details({ goalWeightKg: 50 }), now),
    /BMI/,
  );
  assert.throws(
    () =>
      calculateCalorieResult(
        details({
          age: "70",
          sex: "female",
          heightCm: 160,
          weightKg: 55,
          goalWeightKg: 50,
          activity: "sedentary",
          lossPlan: "rate",
          lossRate: 1,
        }),
        now,
      ),
    /1,000-20,000/,
  );
});
test("maintenance and gain ignore target dates and retain the existing model", () => {
  const maintain = calculateCalorieResult(
    details({ intent: "maintain", targetDate: "bad" }),
    now,
  );
  assert.equal(maintain.target, 2759);
  assert.equal(maintain.weeks, undefined);
  for (const [gain, factor] of [
    ["gain_5", 1.05],
    ["gain_10", 1.1],
  ] as const)
    assert.equal(
      calculateCalorieResult(
        details({ intent: "gain", gain, targetDate: "bad" }),
        now,
      ).target,
      Math.round(maintain.maintenance! * factor),
    );
});
test("canonical height, weight and custom fluid quantities survive repeated unit switches", () => {
  let calorie = details({ heightCm: 182.87999 });
  let fluid: FluidDraft = {
    ...fluidDefaults("ml"),
    mode: "custom" as const,
    custom: "2357.12345",
    customMl: 2357.12345,
  };
  for (let i = 0; i < 100; i++) {
    calorie = calorieUnits(calorieUnits(calorie, "us"), "metric");
    fluid = fluidUnits(fluidUnits(fluid, "fl_oz"), "ml");
  }
  assert.equal(calorie.heightCm, 182.87999);
  assert.equal(calorie.weightKg, 80);
  assert.equal(calorieUnits(calorie, "us").heightInches, "0");
  assert.equal(calculateFluidResult(fluid, now).target, 2357.12345);
  assert.equal(fluid.sex, undefined);
  assert.equal(fluid.activity, undefined);
});
test("older applied metadata is restored without recalculating or requiring newer fields", () => {
  const old = {
    method: "mifflin_st_jeor_v1",
    ageYears: 30,
    heightCm: 180,
    weightKg: 80,
    sex: "male",
    activity: "active",
    maintenance: 2759,
    intent: "lose",
    lossRateLbPerWeek: 1,
    acceptedAt: now.toISOString(),
  };
  const restored = restoreCalorie(
    old,
    calorieDefaults("us", "maintain", 199, 150),
    2259,
  );
  assert.equal(restored.result!.target, 2259);
  assert.equal(restored.inputs.weightKg, 80);
  assert.equal(restored.inputs.age, "30");
  assert.equal(restored.inputs.lossPlan, "rate");
  assert.equal(restored.result!.calculatedAt, now.toISOString());
  assert.equal(
    restoreFluid(
      { method: "beverage_activity_goal_v2", mode: "custom", customMl: 2357 },
      fluidDefaults("ml"),
      2357,
    ).result!.target,
    2357,
  );
  assert.equal(
    restoreCalorie({ latestCalculation: { bad: true } }, details()).result,
    undefined,
  );
  assert.equal(
    restoreFluid({ latestCalculation: null }, fluidDefaults("ml")).result,
    undefined,
  );
});
test("applied provenance records exactly the saved result, including unapplied input units", () => {
  const result = calculateFluidResult(
    {
      ...fluidDefaults("fl_oz"),
      mode: "custom",
      customMl: 2357,
      custom: "79.7",
    },
    now,
  );
  const metadata = appliedCalculation(result);
  assert.equal(metadata.target, 2357);
  assert.deepEqual(metadata.latestCalculation, result);
  assert.equal(metadata.calculatedAt, now.toISOString());
});

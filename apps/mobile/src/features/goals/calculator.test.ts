import assert from "node:assert/strict";
import test from "node:test";

import {
  bodyMassIndex,
  calculateMaintenance,
  calculateBmr,
  canUseCalorieTarget,
  calculateFluidGoal,
  normalizeWeightGoal,
  fluidActivities,
  calorieTargetForGoal,
  calorieTargetForLossRate,
  centimetersToFeetAndInches,
  feetAndInchesToCentimeters,
  fluidOuncesToMilliliters,
  getHydrationReference,
  kilogramsToPounds,
  lossScenarios,
  poundsToKilograms,
  roundCaloriesForDisplay,
} from "./calculator";

const activities = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
  "extra_active",
] as const;
test("matches independent Mifflin fixtures for both equations and all Calculator.net factors", () => {
  const expected = {
    male: [2136, 2447.5, 2607.7, 2759, 3070.5, 3382],
    female: [1936.8, 2219.25, 2364.51, 2501.7, 2784.15, 3066.6],
  };
  for (const sex of ["male", "female"] as const)
    activities.forEach((activity, i) => {
      assert.ok(
        Math.abs(
          calculateMaintenance({
            ageYears: 30,
            heightCm: 180,
            weightKg: 80,
            sex,
            activity,
          }) - expected[sex][i],
        ) < 1e-8,
      );
    });
});
test("matches the supplied US example and preserves the separate 1.465 moderate factor", () => {
  const input = {
    ageYears: 25,
    heightCm: feetAndInchesToCentimeters(5, 10),
    weightKg: poundsToKilograms(187),
    sex: "male" as const,
    activity: "moderate" as const,
  };
  assert.ok(Math.abs(calculateBmr(input) - 1839.4677319) < 1e-8);
  assert.equal(roundCaloriesForDisplay(calculateMaintenance(input)), 2695);
  assert.equal(
    roundCaloriesForDisplay(
      calculateMaintenance({ ...input, ageYears: 22, activity: "sedentary" }),
    ),
    2225,
  );
});

test("uses exact US customary conversions without display rounding drift", () => {
  assert.ok(Math.abs(poundsToKilograms(1) - 0.45359237) < 1e-12);
  assert.ok(
    Math.abs(kilogramsToPounds(poundsToKilograms(176.37)) - 176.37) < 1e-10,
  );
  assert.equal(feetAndInchesToCentimeters(5, 11), 180.34);
  const customaryHeight = centimetersToFeetAndInches(180.34);
  assert.equal(customaryHeight.feet, 5);
  assert.ok(Math.abs(customaryHeight.inches - 11) < 1e-10);
  assert.ok(Math.abs(fluidOuncesToMilliliters(1) - 29.5735295625) < 1e-12);
  assert.ok(Math.abs(bodyMassIndex(80, 180) - 24.691358) < 0.000001);
});

test("rejects unsupported ages and non-finite inputs", () => {
  assert.throws(() =>
    calculateMaintenance({
      ageYears: 18,
      heightCm: 180,
      weightKg: 80,
      sex: "male",
      activity: "sedentary",
    }),
  );
  assert.throws(() =>
    calculateMaintenance({
      ageYears: 30,
      heightCm: Number.NaN,
      weightKg: 80,
      sex: "male",
      activity: "sedentary",
    }),
  );
});

test("builds selectable loss targets and incorporates the requested timeframe", () => {
  assert.equal(calorieTargetForLossRate(2500, 1), 2000);
  const result = lossScenarios({
    maintenanceCalories: 2500,
    currentWeightLb: 200,
    goalWeightLb: 180,
    timeframeWeeks: 16,
  });
  assert.equal(result.timeframeRate, 1.25);
  assert.deepEqual(result.scenarios[0], {
    id: "timeframe",
    rateLbPerWeek: 1.25,
    targetCalories: 1875,
    displayCalories: 1875,
    estimatedWeeks: 16,
    fromTimeframe: true,
    available: true,
  });
  assert.deepEqual(
    result.scenarios.slice(1).map((item) => item.displayCalories),
    [2250, 2000, 1750, 1500],
  );
});

test("does not offer a timeframe target above two pounds per week", () => {
  const result = lossScenarios({
    maintenanceCalories: 2500,
    currentWeightLb: 200,
    goalWeightLb: 180,
    timeframeWeeks: 5,
  });
  assert.equal(
    result.scenarios.some((item) => item.fromTimeframe),
    false,
  );
  assert.match(result.timeframeMessage ?? "", /more than 2 lb/);
});

test("calculates maintain and gain targets before display rounding", () => {
  assert.equal(calorieTargetForGoal(2500, "maintain"), 2500);
  assert.equal(calorieTargetForGoal(2500, "gain_5"), 2625);
  assert.equal(calorieTargetForGoal(2500, "gain_10"), 2750);
  assert.equal(roundCaloriesForDisplay(2625), 2625);
});

test("keeps beverage references distinct from total water", () => {
  assert.deepEqual(getHydrationReference("male"), {
    beverageMl: 3000,
    totalWaterMl: 3700,
  });
  assert.deepEqual(getHydrationReference("female"), {
    beverageMl: 2200,
    totalWaterMl: 2700,
  });
});

test("rejects low loss targets without changing the promised rate or silently clamping", () => {
  const result = lossScenarios({
    maintenanceCalories: 1653.45,
    currentWeightLb: 121,
    goalWeightLb: 110,
  });
  assert.deepEqual(
    result.scenarios.map((x) => x.available),
    [true, true, false, false],
  );
  assert.equal(result.scenarios[3].displayCalories, 653);
  assert.equal(canUseCalorieTarget(999.99), false);
  assert.equal(canUseCalorieTarget(1000), true);
  assert.equal(canUseCalorieTarget(Number.NaN), false);
});
test("custom fluid goals bypass recommendation inputs and preserve canonical precision", () => {
  const customMl = fluidOuncesToMilliliters(83.7);
  assert.equal(
    calculateFluidGoal({ mode: "custom", customMl, activity: "high" }),
    customMl,
  );
  for (const invalid of [undefined, Number.NaN, 0, -1, 20001])
    assert.throws(() =>
      calculateFluidGoal({ mode: "custom", customMl: invalid }),
    );
  for (const sex of ["female", "male"] as const) {
    const baseline = sex === "female" ? 2200 : 3000;
    fluidActivities.forEach((activity) =>
      assert.equal(
        calculateFluidGoal({ mode: "suggested", sex, activity: activity.id }),
        baseline + activity.extraMl,
      ),
    );
  }
  assert.throws(() => calculateFluidGoal({ mode: "suggested" }));
  assert.throws(() => calculateFluidGoal({ mode: "suggested", sex: "male" }));
});
test("weight goal normalization removes conversion noise without whole-pound rounding", () => {
  assert.equal(
    normalizeWeightGoal(kilogramsToPounds(poundsToKilograms(150))),
    150,
  );
  assert.equal(normalizeWeightGoal(149.99999999999997), 150);
  assert.equal(normalizeWeightGoal(150.25), 150.25);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  hydrationAmountToMl,
  mlToFluidOunces,
  hydrationInputSchema,
  fluidContribution,
  fluidTotals,
} from "./model";

test("stores hydration amounts canonically in milliliters", () => {
  assert.equal(hydrationAmountToMl(16, "fl_oz"), 473.18);
  assert.equal(hydrationAmountToMl(2, "cup"), 473.18);
  assert.equal(hydrationAmountToMl(500, "ml"), 500);
});

test("displays canonical hydration as fluid ounces", () => {
  assert.equal(mlToFluidOunces(473.176473), 16);
});

test("distinguishes beverage credit, alcohol, unresolved drinks and legacy history", () => {
  const rows = [
    {
      volume_ml: 250,
      counting_policy: "beverage_volume_v1",
      alcohol_status: "nonalcoholic",
    },
    {
      volume_ml: 150,
      counting_policy: "beverage_volume_v1",
      alcohol_status: "alcoholic",
    },
    {
      volume_ml: 100,
      counting_policy: "beverage_volume_v1",
      alcohol_status: "unknown",
    },
    { volume_ml: 200, counting_policy: "legacy_volume_v1" },
  ];
  assert.deepEqual(rows.map(fluidContribution), [250, 0, null, 200]);
  assert.deepEqual(fluidTotals(rows), {
    consumedMl: 700,
    countedMl: 450,
    pendingMl: 100,
    alcoholMl: 150,
  });
  assert.equal(fluidContribution({ volume_ml: 200 }), 200);
  assert.equal(
    fluidContribution({ volume_ml: 200, counting_policy: "future_policy" }),
    null,
  );
});
test("validates categories, alcohol status and milliliters after conversion", () => {
  const input = {
    fluidName: "Coffee",
    amount: 12,
    unit: "fl_oz",
    categoryId: "coffee",
    alcoholStatus: "nonalcoholic",
  };
  assert.equal(hydrationInputSchema.safeParse(input).success, true);
  assert.equal(
    hydrationInputSchema.safeParse({ ...input, amount: 1000 }).success,
    false,
  );
  assert.equal(
    hydrationInputSchema.safeParse({ ...input, amount: 0.00001 }).success,
    false,
  );
  assert.equal(
    hydrationInputSchema.safeParse({ ...input, categoryId: "wine" }).success,
    false,
  );
  assert.equal(
    hydrationInputSchema.safeParse({
      ...input,
      categoryId: "other",
      alcoholStatus: "unknown",
    }).success,
    true,
  );
});

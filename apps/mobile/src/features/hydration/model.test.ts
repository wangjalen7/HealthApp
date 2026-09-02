import assert from "node:assert/strict";
import test from "node:test";

import { hydrationAmountToMl, mlToFluidOunces } from "./model";

test("stores hydration amounts canonically in milliliters", () => {
  assert.equal(hydrationAmountToMl(16, "fl_oz"), 473.18);
  assert.equal(hydrationAmountToMl(2, "cup"), 473.18);
  assert.equal(hydrationAmountToMl(500, "ml"), 500);
});

test("displays canonical hydration as fluid ounces", () => {
  assert.equal(mlToFluidOunces(473.176473), 16);
});

import assert from "node:assert/strict";
import test from "node:test";

import { classifyBloodPressure } from "./blood-pressure";

test("classifies normal and elevated blood pressure at their boundaries", () => {
  assert.equal(classifyBloodPressure(119, 79).id, "normal");
  assert.equal(classifyBloodPressure(120, 79).id, "elevated");
  assert.equal(classifyBloodPressure(129, 79).id, "elevated");
});

test("either number can raise a reading to stage 1 or stage 2", () => {
  assert.equal(classifyBloodPressure(130, 79).id, "stage_1");
  assert.equal(classifyBloodPressure(119, 80).id, "stage_1");
  assert.equal(classifyBloodPressure(140, 70).id, "stage_2");
  assert.equal(classifyBloodPressure(110, 90).id, "stage_2");
});

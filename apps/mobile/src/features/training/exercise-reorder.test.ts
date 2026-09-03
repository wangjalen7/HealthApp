import assert from "node:assert/strict";
import test from "node:test";

import { workoutDragOffset } from "./exercise-reorder";

test("turns vertical drag distance into bounded reorder offsets", () => {
  assert.equal(workoutDragOffset(51, 1, 4), 0);
  assert.equal(workoutDragOffset(52, 1, 4), 1);
  assert.equal(workoutDragOffset(104, 1, 4), 2);
  assert.equal(workoutDragOffset(-52, 1, 4), -1);
});

test("keeps drag reordering inside the exercise list", () => {
  assert.equal(workoutDragOffset(-500, 1, 4), -1);
  assert.equal(workoutDragOffset(500, 1, 4), 2);
  assert.equal(workoutDragOffset(500, 0, 1), 0);
});

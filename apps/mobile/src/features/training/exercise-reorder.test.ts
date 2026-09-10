import assert from "node:assert/strict";
import test from "node:test";
import { applyExerciseOrder } from "./exercise-reorder";

test("applies a multi-position drop while preserving current exercise fields", () => {
  const current = [
    { id: "a", reps: [8] },
    { id: "b", reps: [12] },
    { id: "c", reps: [6] },
  ];
  const result = applyExerciseOrder(current, ["c", "a", "b"]);
  assert.deepEqual(
    result.map((entry) => entry.id),
    ["c", "a", "b"],
  );
  assert.equal(result[0], current[2]);
  assert.equal(result[2], current[1]);
  assert.deepEqual(
    current.map((entry) => entry.id),
    ["a", "b", "c"],
  );
});
test("drop preserves newly added exercises and ignores removed or duplicate IDs", () => {
  const current = [{ id: "a" }, { id: "b" }, { id: "new" }];
  assert.deepEqual(applyExerciseOrder(current, ["b", "deleted", "b", "a"]), [
    current[1],
    current[0],
    current[2],
  ]);
});

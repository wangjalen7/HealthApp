import assert from "node:assert/strict";
import test from "node:test";

import { workoutSetBreakdown } from "./workout-history";

test("counts every set by its exercise muscle group", () => {
  assert.deepEqual(
    workoutSetBreakdown(
      [{ muscleGroup: "Back" }, { muscleGroup: "Back" }, { muscleGroup: "Bi" }],
      ["Back", "Bi"],
    ),
    [
      { muscleGroup: "Back", setCount: 2 },
      { muscleGroup: "Bi", setCount: 1 },
    ],
  );
});

test("backfills legacy single-group workouts without guessing multi-group sets", () => {
  assert.deepEqual(workoutSetBreakdown([{}, {}], ["Chest"]), [
    { muscleGroup: "Chest", setCount: 2 },
  ]);
  assert.deepEqual(workoutSetBreakdown([{}], ["Chest", "Tri"]), [
    { muscleGroup: "Unassigned", setCount: 1 },
  ]);
});

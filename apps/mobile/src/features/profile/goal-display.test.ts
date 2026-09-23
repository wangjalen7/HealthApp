import assert from "node:assert/strict";
import test from "node:test";
import { automaticProtein, goalDisplay } from "./goal-display";
import type { VitalSample } from "../../domain/vitals";
const weight: VitalSample = {
  id: "one",
  userId: "account",
  kind: "weight",
  value: 80,
  unit: "kg",
  source: "healthkit",
  occurredAt: "2026-09-22T12:00:00Z",
  createdAt: "2026-09-22T12:00:00Z",
};
test("unset goals are not replaced by placeholder targets; zero overrides remain explicit", () => {
  for (const kind of [
    "calories",
    "fluids",
    "weight",
    "blood-pressure",
  ] as const)
    assert.equal(goalDisplay(kind, {}, "us", "fl_oz"), "Not Set");
  assert.equal(goalDisplay("protein", {}, "us", "ml"), "Automatic");
  assert.equal(
    goalDisplay("protein", { proteinGoal: 0 }, "us", "ml", weight),
    "0 g/day",
  );
  assert.equal(
    goalDisplay("blood-pressure", { systolicGoal: 130 }, "us", "ml"),
    "130/— mmHg",
  );
});
test("automatic protein matches Summary for imported metric and manual US weights", () => {
  assert.equal(automaticProtein(weight), 123);
  assert.equal(
    automaticProtein({ ...weight, unit: "lb", value: 180, source: "manual" }),
    126,
  );
  assert.equal(
    goalDisplay("protein", {}, "metric", "ml", weight),
    "Auto · 123 g/day",
  );
  assert.equal(
    goalDisplay("protein", { proteinGoal: 150 }, "metric", "ml", weight),
    "150 g/day",
  );
});
test("display preferences convert saved canonical targets without mutating quantities", () => {
  const goals = { waterGoalMl: 2357.123456, weightGoalLb: 180.123456 };
  const original = { ...goals };
  assert.equal(goalDisplay("fluids", goals, "metric", "ml"), "2357.12 mL/day");
  assert.equal(
    goalDisplay("fluids", goals, "metric", "fl_oz"),
    "79.7 fl oz/day",
  );
  assert.equal(goalDisplay("weight", goals, "metric", "ml"), "81.7 kg");
  assert.deepEqual(goals, original);
});

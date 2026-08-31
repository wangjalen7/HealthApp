import assert from "node:assert/strict";
import test from "node:test";

import {
  cardioTypeForWorkout,
  distanceInMiles,
  durationInMinutes,
  pressureInMmHg,
} from "./mapping";

test("maps supported HealthKit cardio activities without treating strength as cardio", () => {
  assert.equal(cardioTypeForWorkout(37), "run");
  assert.equal(cardioTypeForWorkout(46), "swim");
  assert.equal(cardioTypeForWorkout(50), undefined);
});

test("normalizes HealthKit units for app storage", () => {
  assert.ok(Math.abs((distanceInMiles(5, "km") ?? 0) - 3.106855) < 0.00001);
  assert.equal(durationInMinutes(3600, "s"), 60);
  assert.ok(Math.abs(pressureInMmHg(16, "kPa") - 120.00992) < 0.00001);
});

import assert from "node:assert/strict";
import test from "node:test";
import { exerciseGuide } from "./exercise-guides";
test("exercise guides match exact normalized variants without giving the wrong demo", () => {
  assert.ok(exerciseGuide("Push-ups")?.url.endsWith("/41/push-up/"));
  assert.ok(
    exerciseGuide("Knee push up")?.url.endsWith("/13/bent-knee-push-up/"),
  );
  assert.equal(exerciseGuide("Weighted one arm push up"), undefined);
  assert.equal(exerciseGuide("Dumbbell row"), undefined);
});

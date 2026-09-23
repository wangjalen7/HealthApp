import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultRoutines,
  parseRoutinePreferences,
  overlappingCustom,
  routineIssues,
  routineOverlaps,
  routineSchema,
} from "./routine-model";
import { createReminder } from "./model";
test("routines start off and preserve independent choices", () => {
  const p = defaultRoutines("a");
  assert.ok(Object.values(p.categories).every((c) => !c.enabled));
  assert.deepEqual(p.categories.workout.days, []);
  p.categories.meals.enabled = true;
  p.categories.meals.slots[1].enabled = false;
  assert.deepEqual(routineSchema.parse(p), p);
  assert.equal(p.categories.weight.enabled, false);
});
test("legacy master-off migration stays off while retaining days, slots and history references", () => {
  const p = defaultRoutines("a");
  p.categories.weight.enabled = true;
  p.categories.weight.slots[0].time = "02:00";
  const old = {
    ...p,
    version: 1,
    enabled: false,
    configured: true,
    quiet: { enabled: true, start: "22:00", end: "07:00" },
    keepBoth: ["old"],
  };
  const off = parseRoutinePreferences(old);
  assert.equal(off.version, 2);
  assert.equal(off.categories.weight.enabled, false);
  assert.deepEqual(off.categories.weight.slots, p.categories.weight.slots);
  assert.deepEqual(off.keepBoth, ["old"]);
  const on = parseRoutinePreferences({ ...old, enabled: true });
  assert.equal(on.categories.weight.enabled, true);
  assert.deepEqual(routineIssues(on), []);
  assert.equal("quiet" in on, false);
  assert.equal("enabled" in on, false);
  assert.deepEqual(parseRoutinePreferences(on), on);
  assert.throws(() => parseRoutinePreferences({ ...old, enabled: "false" }));
});
test("structured duplicates use kind, days and time, excluding medications and disabled schedules", () => {
  const p = defaultRoutines("a");
  p.categories.weight.enabled = true;
  p.categories.weight.days = [1];
  const r = createReminder({
    userId: "a",
    kind: "weight",
    time: "08:00",
    additionalTimes: [],
    repeat: "weekly",
    weekdays: [1],
    startDate: "2026-01-01",
  });
  assert.equal(overlappingCustom(p, [r]).length, 1);
  assert.equal(
    overlappingCustom(p, [
      { ...r, kind: "medication", name: "Weight medicine" },
      { ...r, weekdays: [2] },
      { ...r, enabled: false },
    ]).length,
    0,
  );
  p.categories.blood_pressure.enabled = true;
  assert.equal(routineOverlaps(p).length, 1);
});
test("invalid times are rejected and categories cannot activate without days or slots", () => {
  const p = defaultRoutines("a");
  p.categories.workout.enabled = true;
  assert.match(routineIssues(p).join(), /Choose days/);
  p.categories.workout.days = [1];
  p.categories.workout.slots[0].enabled = false;
  assert.match(routineIssues(p).join(), /at least one/);
  p.categories.workout.slots[0].time = "25:30";
  assert.equal(routineSchema.safeParse(p).success, false);
});

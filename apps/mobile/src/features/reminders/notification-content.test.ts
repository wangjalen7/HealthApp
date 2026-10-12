import assert from "node:assert/strict";
import test from "node:test";
import { createReminder } from "./model";
import { defaultRoutines, parseRoutinePreferences } from "./routine-model";
import {
  customPlan,
  routinePlan,
  reconcileSchedule,
  type ScheduleRequest,
} from "./schedule-model";

const now = new Date(2026, 8, 28, 7);

test("all reminders use Sustain and their purpose, including settings saved with generic previews", () => {
  const prefs = defaultRoutines("owner");
  for (const category of Object.values(prefs.categories)) {
    category.enabled = true;
    category.days = [0, 1, 2, 3, 4, 5, 6];
  }
  const parsed = parseRoutinePreferences({ ...prefs, detailedPreviews: false });
  assert.deepEqual(parsed, prefs);
  assert.deepEqual(
    parseRoutinePreferences({ ...prefs, detailedPreviews: true }),
    prefs,
  );
  const routines = routinePlan(parsed, now);
  for (const [group, body] of [
    ["meals", "Time to log breakfast."],
    ["fluids", "Time to log your fluids."],
    ["blood_pressure", "Time to log your morning blood pressure."],
    ["weight", "Time to log your weight."],
    ["workout", "Time for your workout."],
  ]) {
    assert.ok(routines.some((r) => r.group === group && r.body === body));
  }
  const reminders = (
    ["medication", "supplement", "custom", "blood_pressure", "weight"] as const
  ).map((kind) =>
    createReminder({
      userId: "owner",
      kind,
      name: {
        medication: "Example medicine",
        supplement: "Creatine",
        custom: "Stretch",
        blood_pressure: "Blood pressure",
        weight: "Weight",
      }[kind],
      time: "12:00",
      additionalTimes: [],
      repeat: "daily",
      startDate: "2026-01-01",
      weekdays: [],
    }),
  );
  const custom = customPlan(reminders, [], now);
  assert.deepEqual(
    custom.map((r) => r.body),
    [
      "Time to take Example medicine.",
      "Time to take Creatine.",
      "Time for Stretch.",
      "Time to track blood pressure.",
      "Time to track weight.",
    ],
  );
  const dated = customPlan(
    [{ ...reminders[1], repeat: "once", startDate: "2026-09-29" }],
    [],
    now,
  );
  assert.equal(dated.length, 1);
  assert.equal(dated[0].body, "Time to take Creatine.");
  for (const request of [...routines, ...custom, ...dated]) {
    assert.equal(request.title, "Sustain");
    assert.equal(request.data.userId, "owner");
    assert.equal(JSON.parse(request.fingerprint).title, "Sustain");
    assert.equal(JSON.parse(request.fingerprint).body, request.body);
  }
});

test("reconciliation replaces old generic and named notifications once without changing their destinations", async () => {
  const prefs = defaultRoutines("owner");
  prefs.categories.weight.enabled = true;
  const reminder = createReminder({
    userId: "owner",
    kind: "supplement",
    name: "Creatine",
    time: "12:00",
    additionalTimes: [],
    repeat: "daily",
    startDate: "2026-01-01",
    weekdays: [],
  });
  const desired = [
    ...routinePlan(prefs, now),
    ...customPlan([reminder], [], now),
  ];
  const old = desired.map((r, i) => {
    const { fingerprint: _fingerprint, ...content } = r;
    void _fingerprint;
    const previous = {
      ...content,
      title: i === 0 ? "Sustain reminder" : "Creatine",
      body:
        i === 0 ? "Open Sustain to view your reminder." : "Time for Creatine.",
    };
    return { ...previous, fingerprint: JSON.stringify(previous) };
  });
  const pending = new Map(old.map((r) => [r.id, r]));
  const writes: ScheduleRequest[] = [];
  const adapter = {
    list: async () => [...pending.values()],
    put: async (r: ScheduleRequest) => {
      writes.push(r);
      pending.set(r.id, r);
    },
    remove: async () => {
      assert.fail("Branding updates should replace existing IDs");
    },
  };
  await reconcileSchedule(adapter, "owner", desired);
  await reconcileSchedule(adapter, "owner", desired);
  assert.equal(writes.length, desired.length);
  for (const before of old) {
    const after = pending.get(before.id)!;
    assert.equal(after.title, "Sustain");
    assert.deepEqual(after.data, before.data);
    assert.deepEqual(after.trigger, before.trigger);
  }
});

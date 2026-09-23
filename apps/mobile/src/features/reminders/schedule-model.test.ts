import assert from "node:assert/strict";
import test from "node:test";
import { createReminder, createReminderCompletion, localDay } from "./model";
import { defaultRoutines } from "./routine-model";
import {
  customPlan,
  routinePlan,
  reconcileSchedule,
  serializeSchedules,
  type PendingRequest,
  type ScheduleAdapter,
} from "./schedule-model";
const now = new Date(2026, 8, 22, 7, 0);
const custom = (id = "medicine") => ({
  ...createReminder({
    userId: "a",
    kind: "medication",
    name: "Synthetic medicine",
    time: "09:00",
    additionalTimes: [],
    repeat: "daily",
    weekdays: [],
    startDate: "2026-01-01",
  }),
  id,
});
function harness(initial: PendingRequest[] = []) {
  const pending = new Map(initial.map((p) => [p.id, p]));
  const added: string[] = [],
    removed: string[] = [];
  let failure: string | undefined;
  const adapter: ScheduleAdapter = {
    list: async () => [...pending.values()],
    put: async (r) => {
      if (failure === r.id) throw Error("OS failure");
      added.push(r.id);
      pending.set(r.id, { id: r.id, fingerprint: r.fingerprint, data: r.data });
    },
    remove: async (id) => {
      removed.push(id);
      pending.delete(id);
    },
  };
  return {
    adapter,
    pending,
    added,
    removed,
    fail: (id: string) => {
      failure = id;
    },
  };
}
test("stable schedules repeat natively, including one request per selected weekday", () => {
  const p = defaultRoutines("a");

  p.categories.meals.enabled = true;
  p.categories.fluids.enabled = true;
  p.categories.weight.enabled = true;
  p.categories.weight.days = [1, 3];
  const planned = routinePlan(p, now);
  assert.equal(planned.length, 9);
  assert.ok(planned.every((p) => p.trigger.kind === "calendar"));
  assert.deepEqual(
    planned
      .filter((p) => p.group === "weight")
      .map((p) => (p.trigger.kind === "calendar" ? p.trigger.weekday : 0)),
    [2, 4],
  );
  assert.equal(customPlan([custom()], [], now).length, 1);
});
test("individual routine toggles do not change medication schedules or completion history", () => {
  const r = custom(),
    completion = createReminderCompletion(r, new Date(2026, 8, 21, 9));
  const original = JSON.stringify(completion);
  const before = customPlan([r], [completion], now);
  const p = defaultRoutines("a");
  p.categories.fluids.enabled = true;
  assert.equal(routinePlan(p, now).length, 4);
  p.categories.fluids.enabled = false;
  assert.deepEqual(routinePlan(p, now), []);
  assert.deepEqual(customPlan([r], [completion], now), before);
  assert.equal(JSON.stringify(completion), original);
});
test("Rest Today removes only this local day's workout occurrences, never health data or future weekdays", () => {
  const p = defaultRoutines("a");

  p.categories.workout.enabled = true;
  p.categories.workout.days = [0, 1, 2, 3, 4, 5, 6];
  const before = routinePlan(p, now);
  p.restDay = localDay(now);
  const after = routinePlan(p, now);
  assert.equal(before.length, 28);
  assert.equal(after.length, 27);
  assert.deepEqual(
    after,
    before.filter((r) => r.data.occurrenceDay !== localDay(now)),
  );
  assert.ok(
    after.every(
      (r) => r.data.source === "routine" && r.data.category === "workout",
    ),
  );
  const late = new Date(2026, 8, 22, 23);
  assert.ok(
    routinePlan({ ...p, restDay: undefined }, late).every(
      (r) => r.trigger.kind === "date" && r.trigger.at > late.getTime(),
    ),
  );
});
test("custom future starts and early completions retain dated occurrence semantics", () => {
  const r = custom();
  const future = customPlan([{ ...r, startDate: "2026-10-01" }], [], now);
  assert.equal(future.length, 14);
  assert.ok(
    future.every(
      (r) =>
        r.trigger.kind === "date" &&
        r.trigger.at >= new Date(2026, 9, 1).getTime(),
    ),
  );
  const completion = createReminderCompletion(r, now);
  const suppressed = customPlan([r], [completion], now);
  assert.ok(suppressed.every((r) => r.data.occurrenceDay !== localDay(now)));
  assert.equal(suppressed.length, 14);
});
test("reconciliation is idempotent, replaces only edits and removes orphan requests", async () => {
  const a = customPlan([custom()], [], now),
    p = defaultRoutines("a");

  p.categories.weight.enabled = true;
  const r = routinePlan(p, now),
    h = harness();
  await reconcileSchedule(h.adapter, "a", [...a, ...r]);
  await reconcileSchedule(h.adapter, "a", [...a, ...r]);
  assert.equal(h.added.length, 2);
  p.categories.weight.slots[0].time = "10:00";
  const edited = routinePlan(p, now);
  await reconcileSchedule(h.adapter, "a", [...a, ...edited]);
  assert.equal(h.added.length, 3);
  assert.equal(h.removed.length, 0);
  await reconcileSchedule(h.adapter, "a", a);
  assert.deepEqual(
    h.removed,
    r.map((r) => r.id),
  );
  assert.ok(h.pending.has(a[0].id));
});
test("capacity refusal and partial failures retain working custom notifications", async () => {
  const a = customPlan([custom()], [], now),
    h = harness();
  await reconcileSchedule(h.adapter, "a", a);
  const p = defaultRoutines("a");

  p.categories.meals.enabled = true;
  const routines = routinePlan(p, now);
  await assert.rejects(
    reconcileSchedule(h.adapter, "a", [...a, ...routines], [], 3),
    /capacity/,
  );
  assert.ok(h.pending.has(a[0].id));
  assert.deepEqual(h.removed, []);
  h.fail(routines[1].id);
  await assert.rejects(
    reconcileSchedule(h.adapter, "a", [...a, ...routines]),
    /OS failure/,
  );
  assert.ok(h.pending.has(a[0].id));
  assert.deepEqual(h.removed, []);
});
test("other accounts count toward capacity and are never cancelled by reconciliation", async () => {
  const old: PendingRequest = {
    id: "healthapp.notify.v2:b:custom:old:0",
    data: { userId: "b", source: "custom" },
  };
  const h = harness([old]);
  await reconcileSchedule(h.adapter, "a", customPlan([custom()], [], now));
  assert.ok(h.pending.has(old.id));
  await reconcileSchedule(h.adapter, "a", []);
  assert.ok(h.pending.has(old.id));
});
test("a full legacy window migrates one verified custom group at a time before adding routines", async () => {
  const old = Array.from({ length: 60 }, (_, i) => ({
    id: `legacy-${i}`,
    data: { reminderId: "medicine" },
  }));
  const h = harness(old),
    p = defaultRoutines("a");

  p.categories.meals.enabled = true;
  p.categories.fluids.enabled = true;
  const desired = [...customPlan([custom()], [], now), ...routinePlan(p, now)];
  await reconcileSchedule(
    h.adapter,
    "a",
    desired,
    old.map((p) => p.id),
  );
  assert.equal(h.pending.size, 8);
  assert.ok(h.removed.includes("legacy-59"));
  assert.ok(desired.every((r) => h.pending.has(r.id)));
});
test("dated workout prompts follow local calendar days across DST and time-zone changes", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const p = defaultRoutines("a");

    p.categories.workout.enabled = true;
    p.categories.workout.days = [0, 1, 2, 3, 4, 5, 6];
    p.categories.workout.slots[0].time = "02:30";
    const spring = routinePlan(p, new Date(2026, 2, 7, 0));
    assert.ok(!spring.some((r) => r.data.occurrenceDay === "2026-03-08"));
    assert.ok(
      spring.every(
        (r) =>
          r.trigger.kind === "date" && new Date(r.trigger.at).getHours() === 2,
      ),
    );
    p.categories.workout.slots[0].time = "01:30";
    const fall = routinePlan(p, new Date(2026, 9, 31, 0));
    assert.equal(
      fall.filter((r) => r.data.occurrenceDay === "2026-11-01").length,
      1,
    );
    process.env.TZ = "America/Los_Angeles";
    const moved = routinePlan(p, new Date(2026, 9, 31, 0));
    assert.deepEqual(
      moved.map((r) => r.id),
      fall.map((r) => r.id),
    );
    assert.ok(
      moved.every(
        (r) =>
          r.trigger.kind === "date" && new Date(r.trigger.at).getHours() === 1,
      ),
    );
    assert.notDeepEqual(
      moved.map((r) => r.trigger),
      fall.map((r) => r.trigger),
    );
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test("a silent OS scheduling failure cannot be reported as successful", async () => {
  const h = harness();
  h.adapter.put = async () => {};
  await assert.rejects(
    reconcileSchedule(h.adapter, "a", customPlan([custom()], [], now)),
    /could not be confirmed/,
  );
});
test("scheduling work serializes and recovers after a failed operation", async () => {
  const run = serializeSchedules(),
    events: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const first = run(async () => {
    events.push(1);
    await gate;
    throw Error("retry");
  });
  const second = run(async () => {
    events.push(2);
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [1]);
  release();
  await assert.rejects(first);
  await second;
  assert.deepEqual(events, [1, 2]);
});
test("stable calendar times survive time-zone changes without fixed UTC offsets or catch-up dates", () => {
  const p = defaultRoutines("a");

  p.categories.weight.enabled = true;

  p.categories.weight.slots[0].time = "02:30";
  assert.deepEqual(
    routinePlan(p, new Date("2026-03-08T06:00:00Z")),
    routinePlan(p, new Date("2026-11-01T05:00:00Z")),
  );
  const trigger = routinePlan(p, now)[0].trigger;
  assert.deepEqual(trigger, { kind: "calendar", hour: 2, minute: 30 });
});

test("interval reminders use bounded dated requests and selected days retain every time", () => {
  const r = {
    ...custom(),
    repeat: "interval" as const,
    intervalDays: 3,
    startDate: "2026-09-21",
    additionalTimes: ["20:00"],
  };
  const requests = customPlan([r], [], now);
  assert.equal(requests.length, 14);
  assert.ok(requests.every((r) => r.trigger.kind === "date"));
  assert.equal(requests[0].data.occurrenceDay, "2026-09-24");
  assert.equal(requests[1].data.occurrenceTime, "20:00");
  assert.equal(new Set(requests.map((r) => r.id)).size, 14);
  const selected = customPlan(
    [{ ...r, repeat: "weekdays", weekdays: [1, 3] }],
    [],
    now,
  );
  assert.equal(selected.length, 4);
  assert.ok(selected.every((r) => r.trigger.kind === "calendar"));
});

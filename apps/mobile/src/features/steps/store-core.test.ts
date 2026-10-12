import assert from "node:assert/strict";
import test from "node:test";
import { createStepStore } from "./store-core";
import { normalizeStepStatistics, stepPeriod } from "./model";
function fixture() {
  const values = new Map<string, string>();
  let count: number | undefined = 5000,
    fail = false,
    calls = 0,
    zone = "America/New_York";
  const now = new Date(2026, 9, 11, 12);
  const storage = {
    getItem: async (k: string) => values.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      values.set(k, v);
    },
  };
  const reader = {
    authorizeSteps: async () => {},
    readStepBuckets: async (start: Date, end: Date, hourly: boolean) => {
      calls++;
      if (fail) throw Error("locked");
      return normalizeStepStatistics(
        count === undefined
          ? []
          : [{ startDate: start, sumQuantity: { quantity: count } }],
        start,
        end,
        hourly,
        now,
      );
    },
  };
  const store = createStepStore(
    storage,
    reader,
    () => zone,
    () => now,
  );
  return {
    store,
    values,
    storage,
    reader,
    now,
    setCount: (n?: number) => {
      count = n;
    },
    setFail: () => {
      fail = true;
    },
    calls: () => calls,
    setZone: (z: string) => {
      zone = z;
    },
  };
}

test("unified connection finishes Health state persistence before the queue drains and preserves cached totals", async () => {
  const f = fixture(),
    period = stepPeriod("D", "2026-10-11");
  await f.store.connectSteps("a");
  await f.store.refreshSteps("a", period.start, period.end, true);
  const before = await f.store.readStepCache("a");
  let finish!: () => void,
    entered!: () => void,
    drained = false;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const connection = f.store.connectSteps(
    "a",
    undefined,
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
        entered();
      }),
  );
  await started;
  const drain = f.store.drainSteps("a").then(() => {
    drained = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(drained, false);
  finish();
  await Promise.all([connection, drain]);
  assert.deepEqual(await f.store.readStepCache("a"), before);
});
test("optional connection, account isolation and restart persistence", async () => {
  const f = fixture(),
    p = stepPeriod("W", "2026-10-11");
  await f.store.refreshSteps("a", p.start, p.end, false);
  assert.equal(f.calls(), 0);
  await f.store.connectSteps("a");
  await f.store.refreshSteps("a", p.start, p.end, false);
  const restarted = createStepStore(
    f.storage,
    f.reader,
    () => "America/New_York",
    () => f.now,
  );
  assert.ok((await restarted.readStepCache("a")).daily.length);
  assert.equal((await restarted.readStepCache("b")).daily.length, 0);
  assert.equal((await restarted.readStepCache("b")).connected, false);
});
test("parallel refreshes replace totals and serialize storage instead of accumulating rows", async () => {
  const f = fixture(),
    p = stepPeriod("W", "2026-10-11");
  await f.store.connectSteps("a");
  await Promise.all([
    f.store.refreshSteps("a", p.start, p.end, false),
    f.store.refreshSteps("a", p.start, p.end, false),
  ]);
  const before = await f.store.readStepCache("a");
  assert.equal(f.calls(), 1);
  f.setCount(10);
  await f.store.refreshSteps("a", p.start, p.end, false, true);
  const after = await f.store.readStepCache("a");
  assert.equal(after.daily.length, before.daily.length);
  assert.equal(
    new Set(after.daily.map((b) => b.start)).size,
    after.daily.length,
  );
  assert.ok(after.daily.some((b) => b.total === 10));
  f.setCount(undefined);
  await f.store.refreshSteps("a", p.start, p.end, false, true);
  assert.ok(
    (await f.store.readStepCache("a")).daily.every((b) => b.total === null),
  );
});
test("refresh failure preserves successful cache, timezone partitions history, disconnect stops queries", async () => {
  const f = fixture(),
    p = stepPeriod("D", "2026-10-01");
  await f.store.connectSteps("a");
  await f.store.refreshSteps("a", p.start, p.end, true);
  const cached = await f.store.readStepCache("a");
  assert.ok(cached.daily.some((b) => b.start === p.start.toISOString()));
  f.setFail();
  await assert.rejects(f.store.refreshSteps("a", p.start, p.end, true, true));
  assert.deepEqual(await f.store.readStepCache("a"), cached);
  f.setZone("Europe/London");
  const traveled = await f.store.readStepCache("a");
  assert.equal(traveled.daily.length, 0);
  assert.equal(traveled.connected, true);
  await assert.rejects(
    f.store.refreshSteps("a", p.start, p.end, false, true, "America/New_York"),
    /Time zone/,
  );
  await f.store.disconnectSteps("a");
  const calls = f.calls();
  await f.store.refreshSteps("a", p.start, p.end, false, true);
  assert.equal(f.calls(), calls);
});
test("corrupt cache recovers without inventing data or losing the optional connection", async () => {
  const f = fixture();
  await f.store.connectSteps("a");
  f.values.set("healthapp:steps:v1:a:America/New_York", "{");
  assert.equal((await f.store.readStepCache("a")).connected, true);
  assert.equal((await f.store.readStepCache("a")).daily.length, 0);
});
test("account cleanup drains pending authorization before local records can be erased", async () => {
  const values = new Map<string, string>();
  let authorize!: () => void;
  const permission = new Promise<void>((r) => {
    authorize = r;
  });
  const store = createStepStore(
    {
      getItem: async (k) => values.get(k) ?? null,
      setItem: async (k, v) => {
        values.set(k, v);
      },
    },
    { authorizeSteps: () => permission, readStepBuckets: async () => [] },
  );
  const connection = store.connectSteps("a");
  let drained = false;
  const cleanup = store.drainSteps("a").then(() => {
    drained = true;
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(drained, false);
  authorize();
  await connection;
  await cleanup;
  assert.equal(drained, true);
  values.clear();
  await store.drainSteps("a");
  assert.equal(values.size, 0);
});

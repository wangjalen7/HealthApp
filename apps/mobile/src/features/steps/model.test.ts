import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketBounds,
  completedAverage,
  goalProgress,
  moveStepPeriod,
  normalizeStepStatistics,
  replaceStepBuckets,
  stepPeriod,
  stepChartRows,
  stepChartBounds,
  stepsNeedRefresh,
} from "./model";
import { dayKey } from "../summary/calendar";
import { layoutSchema, readLayout } from "../summary/layout";

test("step averages include explicit zero, exclude missing and today, and report coverage", () => {
  const start = new Date(2026, 9, 1),
    end = new Date(2026, 9, 5),
    now = new Date(2026, 9, 4, 12);
  const rows = normalizeStepStatistics(
    [
      { startDate: start, sumQuantity: { quantity: 6000 } },
      { startDate: new Date(2026, 9, 2), sumQuantity: { quantity: 0 } },
      { startDate: new Date(2026, 9, 4), sumQuantity: { quantity: 4000 } },
    ],
    start,
    end,
    false,
    now,
  );
  assert.deepEqual(completedAverage(rows, now), { value: 3000, days: 2 });
  assert.equal(rows[1]!.availability, "available");
  assert.equal(rows[2]!.total, null);
  assert.deepEqual(completedAverage([rows[2]!, rows[3]!], now), {
    value: undefined,
    days: 0,
  });
});
test("merged HealthKit cumulative results are used once, never averaged across samples or sources", () => {
  const { start, end } = stepPeriod("D", "2026-10-01");
  const rows = normalizeStepStatistics(
    [{ startDate: start, sumQuantity: { quantity: 12345.2 } }],
    start,
    end,
    false,
    new Date(2026, 9, 2),
  );
  assert.equal(rows[0]!.total, 12345);
  assert.equal(rows.length, 1);
  assert.equal(goalProgress(12345, 10000), 1);
  assert.equal(goalProgress(5000, 10000), 0.5);
  assert.equal(goalProgress(5000), undefined);
});
test("missing, malformed and future statistics do not invent zero totals", () => {
  const { start, end } = stepPeriod("D", "2026-10-01");
  const now = new Date(2026, 9, 1, 2, 30);
  const rows = normalizeStepStatistics(
    [{ startDate: start, sumQuantity: { quantity: NaN } }],
    start,
    end,
    true,
    now,
  );
  assert.equal(rows.length, 3);
  assert.ok(
    rows.every((b) => b.total === null && b.availability === "missing"),
  );
});
test("Monday weeks and month/year navigation use calendar boundaries", () => {
  assert.equal(dayKey(stepPeriod("W", "2026-10-11").start), "2026-10-05");
  assert.equal(dayKey(stepPeriod("W", "2026-10-11").end), "2026-10-12");
  assert.equal(moveStepPeriod("M", "2026-01-31", -1), "2025-12-01");
  assert.equal(moveStepPeriod("D", "2026-03-01", -1), "2026-02-28");
  assert.equal(
    bucketBounds(
      stepPeriod("M", "2024-02-29").start,
      stepPeriod("M", "2024-02-29").end,
      false,
    ).length,
    29,
  );
});
test("23/25-hour DST days retain unique elapsed-hour intervals and calendar daily totals", () => {
  const old = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    for (const [day, count] of [
      ["2026-03-08", 23],
      ["2026-11-01", 25],
    ] as const) {
      const p = stepPeriod("D", day),
        hours = bucketBounds(p.start, p.end, true);
      assert.equal(hours.length, count);
      assert.equal(
        new Set(hours.map((b) => b.start.toISOString())).size,
        count,
      );
      assert.equal(bucketBounds(p.start, p.end, false).length, 1);
    }
  } finally {
    if (old === undefined) delete process.env.TZ;
    else process.env.TZ = old;
  }
});
test("cache replacement reflects edits and deletions, deduplicates and detects uncached ranges", () => {
  const { start, end } = stepPeriod("D", "2026-10-01"),
    now = new Date(2026, 9, 2);
  const original = normalizeStepStatistics(
    [{ startDate: start, sumQuantity: { quantity: 5000 } }],
    start,
    end,
    false,
    now,
  );
  const deleted = normalizeStepStatistics([], start, end, false, now);
  const replaced = replaceStepBuckets(original, [...deleted, ...deleted]);
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0]!.total, null);
  assert.equal(stepsNeedRefresh(replaced, start, end, false, now), false);
  assert.equal(
    stepsNeedRefresh(replaced, start, new Date(2026, 9, 3), false, now),
    true,
  );
  assert.equal(
    stepsNeedRefresh(
      replaced,
      start,
      end,
      false,
      new Date(now.getTime() + 61000),
    ),
    true,
  );
});
test("Steps is an optional persisted Summary type without changing original defaults", () => {
  const raw = JSON.stringify({
    version: 1,
    widgets: [{ id: "steps-1", type: "steps", size: "small", config: {} }],
  });
  assert.equal(layoutSchema.parse(JSON.parse(raw)).widgets[0]!.type, "steps");
  assert.equal(readLayout(raw).layout.widgets[0]!.type, "steps");
});

test("six-month and year ranges cross years and navigate without end-of-month rollover", () => {
  const half = stepPeriod("6M", "2026-01-31");
  assert.equal(dayKey(half.start), "2025-08-01");
  assert.equal(dayKey(half.end), "2026-02-01");
  const weeks = stepChartBounds(half.start, half.end, "6M");
  assert.equal(dayKey(weeks[0]!.end), "2025-08-04");
  assert.equal(dayKey(weeks[1]!.start), "2025-08-04");
  assert.equal(dayKey(weeks.at(-1)!.end), "2026-02-01");
  const year = stepPeriod("Y", "2024-02-29");
  assert.equal(dayKey(year.start), "2023-03-01");
  assert.equal(dayKey(year.end), "2024-03-01");
  assert.equal(stepChartBounds(year.start, year.end, "Y").length, 12);
  assert.equal(moveStepPeriod("6M", "2026-01-31", -1), "2025-07-01");
  assert.equal(moveStepPeriod("Y", "2024-02-29", -1), "2023-02-01");
});

test("long-range bars average available completed days including zero without mutating cached daily totals", () => {
  const now = new Date(2026, 9, 4, 12),
    period = stepPeriod("Y", "2026-10-04");
  const daily = normalizeStepStatistics(
    [
      { startDate: new Date(2026, 9, 1), sumQuantity: { quantity: 6000 } },
      { startDate: new Date(2026, 9, 2), sumQuantity: { quantity: 0 } },
      { startDate: new Date(2026, 9, 4), sumQuantity: { quantity: 20000 } },
    ],
    new Date(2026, 9, 1),
    new Date(2026, 9, 5),
    false,
    now,
  );
  const before = JSON.stringify(daily);
  for (const range of ["6M", "Y"] as const) {
    const bars = stepChartRows(daily, period.start, period.end, range, now);
    assert.equal(bars.find((b) => b.total !== null)!.total, 3000);
    assert.ok(bars.some((b) => b.total === null));
  }
  assert.equal(JSON.stringify(daily), before);
});

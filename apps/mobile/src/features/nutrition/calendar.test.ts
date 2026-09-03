import assert from "node:assert/strict";
import test from "node:test";

import {
  calorieCalendarCells,
  calorieTotalsByLocalDay,
  shiftCalendarMonth,
  startOfCalendarMonth,
} from "./calendar";

test("builds a Sunday-first current-month calorie calendar", () => {
  const cells = calorieCalendarCells(new Date(2026, 8, 15));
  assert.equal(cells.length, 35);
  assert.equal(cells[2]?.dateKey, "2026-09-01");
  assert.equal(cells[31]?.dateKey, "2026-09-30");
});

test("aggregates calories and entry counts by local day", () => {
  const totals = calorieTotalsByLocalDay([
    { occurredAt: new Date(2026, 8, 2, 8).toISOString(), calories: 400 },
    { occurredAt: new Date(2026, 8, 2, 18).toISOString(), calories: 650 },
  ]);
  assert.deepEqual(totals["2026-09-02"], { calories: 1050, entryCount: 2 });
});

test("moves calendar months across year boundaries", () => {
  assert.deepEqual(
    shiftCalendarMonth(new Date(2026, 0, 15), -1),
    new Date(2025, 11, 1),
  );
  assert.deepEqual(
    shiftCalendarMonth(new Date(2026, 11, 15), 1),
    new Date(2027, 0, 1),
  );
  assert.deepEqual(
    startOfCalendarMonth(new Date(2026, 8, 30, 23, 59)),
    new Date(2026, 8, 1),
  );
});

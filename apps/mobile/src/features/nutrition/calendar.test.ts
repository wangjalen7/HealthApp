import assert from "node:assert/strict";
import test from "node:test";

import { calorieCalendarCells, calorieTotalsByLocalDay } from "./calendar";

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

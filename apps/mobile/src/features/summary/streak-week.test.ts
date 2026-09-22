import assert from "node:assert/strict";
import { test } from "node:test";
import type { Period } from "../streaks/engine";
import { streakWeek } from "./streak-week";

const period = (
  day: string,
  state: Period["state"],
  overrides: Partial<Period> = {},
): Period => ({
  day,
  state,
  count: 0,
  target: 1,
  evidence: [],
  explanation: "",
  provisional: false,
  ...overrides,
});

test("daily indicators use Monday-Sunday across year boundaries, retaining unknown/off days", () => {
  const week = streakWeek(
    "weight",
    [
      period("2026-12-27", "met"),
      period("2026-12-28", "met"),
      period("2026-12-29", "not_scheduled"),
      period("2026-12-30", "unknown"),
      period("2026-12-31", "not_met"),
      period("2027-01-01", "open"),
    ],
    new Date(2027, 0, 1, 12),
  );
  assert.deepEqual(
    week.map((d) => d.day),
    [
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ],
  );
  assert.deepEqual(
    week.map((d) => d.state),
    [
      "met",
      "not_scheduled",
      "unknown",
      "not_met",
      "open",
      "upcoming",
      "upcoming",
    ],
  );
  assert.equal(week.map((d) => d.label).join(""), "MTWTFSS");
});

test("Sunday remains in this week and Monday starts a new week, including untracked days", () => {
  const sunday = streakWeek(
    "food_logging",
    [period("2026-09-20", "met")],
    new Date(2026, 8, 20, 12),
  );
  assert.equal(sunday[0].day, "2026-09-14");
  assert.equal(sunday[0].state, "not_tracked");
  assert.equal(sunday[6].state, "met");
  const monday = streakWeek("food_logging", [], new Date(2026, 8, 21, 12));
  assert.equal(monday[0].day, "2026-09-21");
  assert.equal(monday[1].state, "upcoming");
});

test("training checks reflect distinct training dates, not the entire weekly result", () => {
  const week = streakWeek(
    "training",
    [
      period("2026-09-14", "met", {
        evidence: ["2026-09-14", "2026-09-16"],
        count: 2,
        target: 2,
      }),
    ],
    new Date(2026, 8, 18, 12),
  );
  assert.deepEqual(
    week.map((d) => d.state),
    ["met", "not_met", "met", "not_met", "open", "upcoming", "upcoming"],
  );
  const unknown = streakWeek(
    "training",
    [period("2026-09-14", "unknown")],
    new Date(2026, 8, 18, 12),
  );
  assert.equal(unknown[0].state, "unknown");
});

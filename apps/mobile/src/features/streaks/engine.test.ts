import assert from "node:assert/strict";
import test from "node:test";
import { evaluateStreak, pairedReadings, type Sources } from "./engine";
import { parseActiveRules, ruleConfigSchema, type Rule } from "./model";
import type { Habit } from "../summary/layout";
import type { VitalSample } from "../../domain/vitals";
import { createReminder } from "../reminders/model";
const now = new Date(2026, 8, 18, 12);
const at = (day: number) => new Date(2026, 8, day, 8).toISOString();
function sources(): Sources {
  return {
    food: [],
    fluids: [],
    sessions: [],
    sets: [],
    cardio: [],
    vitals: [],
    reminders: [],
    schedules: [],
    goals: [],
    coverage: Object.fromEntries(
      ["food", "fluids", "training", "vitals", "reminders", "goals"].map(
        (k) => [k, { from: "2026-09-01", complete: true }],
      ),
    ),
  };
}
const rule = (habit: Habit, patch: Partial<Rule> = {}): Rule => ({
  habit,
  effective_day: "2026-09-16",
  activation_day: "2026-09-16",
  enabled: true,
  version: 1,
  config: ruleConfigSchema.parse({}),
  ...patch,
});
const food = (day: number) => ({
  id: String(day),
  occurred_at: at(day),
  calories: 2000,
  protein_grams: 100,
  revision: 1,
});
test("unfinished day retains the prior run, met current day extends provisionally, closed missing day breaks", () => {
  const data = sources();
  data.food = [food(16), food(17)];
  let value = evaluateStreak("food_logging", [rule("food_logging")], data, now);
  assert.equal(value.current, 2);
  assert.equal(value.best, 2);
  assert.equal(value.periods.at(-1)!.state, "open");
  data.food.push(food(18));
  value = evaluateStreak("food_logging", [rule("food_logging")], data, now);
  assert.equal(value.current, 3);
  assert.equal(value.best, 2);
  data.food = data.food.filter((f) => f.id !== "17");
  assert.equal(
    evaluateStreak("food_logging", [rule("food_logging")], data, now).current,
    1,
  );
});
test("unknown query cannot establish an empty day or a verified run; activation and pauses are prospective", () => {
  const data = sources();
  data.coverage.food = { from: "2026-09-16", complete: false };
  const value = evaluateStreak(
    "food_logging",
    [rule("food_logging")],
    data,
    now,
  );
  assert.equal(value.unknown, true);
  assert.equal(value.periods[0].state, "unknown");
  const paused = evaluateStreak(
    "food_logging",
    [
      rule("food_logging"),
      rule("food_logging", { effective_day: "2026-09-18", enabled: false }),
    ],
    sources(),
    now,
  );
  assert.equal(paused.periods[0].state, "not_met");
  assert.equal(paused.periods.at(-1)!.explanation, "paused");
});
test("calorie totals qualify without confirmation and preserve historical range boundaries", () => {
  const data = sources();
  data.food = [food(18)];
  data.goals = [
    {
      effective_day: "2026-09-18",
      calorie_goal: 2000,
      protein_goal: null,
      fluid_goal_ml: null,
    },
  ];
  const r = rule("calorie_target", {
    config: ruleConfigSchema.parse({ calorieMode: "tolerance" }),
    activation_day: "2026-09-18",
    effective_day: "2026-09-18",
  });
  for (const calories of [1800, 2200]) {
    data.food[0].calories = calories;
    const result = evaluateStreak("calorie_target", [r], data, now);
    assert.equal(result.current, 1);
    assert.equal(result.periods[0].provisional, true);
  }
  data.food[0].calories = 2201;
  assert.equal(evaluateStreak("calorie_target", [r], data, now).current, 0);
  data.goals[0].calorie_goal = 0;
  assert.equal(
    evaluateStreak("calorie_target", [r], data, now).periods[0].state,
    "unknown",
  );
});
test("directional calorie totals include equality, reject empty or unavailable food, and recheck edits", () => {
  const data = sources();
  data.food = [food(18)];
  data.goals = [
    {
      effective_day: "2026-09-18",
      calorie_goal: 2000,
      protein_goal: null,
      fluid_goal_ml: null,
    },
  ];
  for (const calorieMode of ["under", "over"]) {
    const r = rule("calorie_target", {
      activation_day: "2026-09-18",
      effective_day: "2026-09-18",
      config: ruleConfigSchema.parse({ calorieMode }),
    });
    assert.equal(evaluateStreak("calorie_target", [r], data, now).current, 1);
    data.food[0].calories = calorieMode === "under" ? 2001 : 1999;
    data.food[0].revision = 2;
    assert.equal(evaluateStreak("calorie_target", [r], data, now).current, 0);
    data.food[0].calories = 2000;
  }
  const r = rule("calorie_target", {
    activation_day: "2026-09-18",
    effective_day: "2026-09-18",
  });
  data.coverage.food!.complete = false;
  assert.equal(
    evaluateStreak("calorie_target", [r], data, now).periods[0].state,
    "unknown",
  );
  data.coverage.food!.complete = true;
  data.food[0].calories = null as unknown as number;
  assert.equal(
    evaluateStreak("calorie_target", [r], data, now).periods[0].state,
    "unknown",
  );
  data.food = [];
  assert.equal(evaluateStreak("calorie_target", [r], data, now).current, 0);
  assert.equal(
    evaluateStreak("calorie_target", [r], data, new Date(2026, 8, 19, 12))
      .periods[0].state,
    "not_met",
  );
});
test("retired food-completion rules do not prevent loading active server habits", () => {
  const active = rule("protein_target");
  assert.deepEqual(
    parseActiveRules([{ ...active, habit: "food_complete" }, active]),
    [active],
  );
});
test("BP ignores legacy weekday and import preferences and counts each paired local day once", () => {
  const data = sources();
  const sample = (
    id: string,
    kind: VitalSample["kind"],
    correlationId: string,
  ): VitalSample => ({
    id,
    kind,
    correlationId,
    userId: "u",
    source: "healthkit",
    occurredAt: at(18),
    createdAt: at(18),
    unit: "mmHg",
    value: kind === "systolic_bp" ? 120 : 80,
  });
  data.vitals = [
    sample("s", "systolic_bp", "pair"),
    sample("d", "diastolic_bp", "pair"),
    sample("s2", "systolic_bp", "pair2"),
    sample("d2", "diastolic_bp", "pair2"),
  ];
  const r = rule("bp", {
    config: ruleConfigSchema.parse({ weekdays: [0], includeImports: false }),
  });
  let result = evaluateStreak("bp", [r], data, now);
  assert.equal(result.current, 1);
  assert.equal(result.periods.at(-1)?.count, 1);
  data.vitals = data.vitals.filter((s) => s.kind !== "diastolic_bp");
  result = evaluateStreak("bp", [r], data, now);
  assert.equal(result.current, 0);
});
test("canonical fluid credit uses legacy, alcohol and pending rules; pending does not block already-met target", () => {
  const data = sources();
  data.goals = [
    {
      effective_day: "2026-09-16",
      calorie_goal: 2000,
      protein_goal: 100,
      fluid_goal_ml: 1000,
    },
  ];
  data.fluids = [
    {
      id: "water",
      occurred_at: at(18),
      volume_ml: 1000,
      counting_policy: "beverage_volume_v1",
      alcohol_status: "nonalcoholic",
    },
    {
      id: "wine",
      occurred_at: at(18),
      volume_ml: 500,
      counting_policy: "beverage_volume_v1",
      alcohol_status: "alcoholic",
    },
    {
      id: "pending",
      occurred_at: at(18),
      volume_ml: 1000,
      counting_policy: "beverage_volume_v1",
      alcohol_status: "unknown",
    },
  ];
  const value = evaluateStreak(
    "fluid_target",
    [rule("fluid_target")],
    data,
    now,
  );
  assert.equal(value.periods.at(-1)!.count, 1000);
  assert.equal(value.current, 1);
  data.fluids[0].alcohol_status = "alcoholic";
  assert.equal(
    evaluateStreak("fluid_target", [rule("fluid_target")], data, now).current,
    0,
  );
  data.fluids[0].counting_policy = "legacy_volume_v1";
  assert.equal(
    evaluateStreak("fluid_target", [rule("fluid_target")], data, now).current,
    1,
  );
});
test("weekly periods use distinct days and do not break an unfinished week", () => {
  const data = sources();
  data.cardio = [7, 8, 9, 14, 14].map((day, i) => ({
    id: String(i),
    occurred_at: at(day),
    duration_minutes: 10,
  }));
  const r = rule("training", {
    activation_day: "2026-09-07",
    effective_day: "2026-09-07",
  });
  const value = evaluateStreak("training", [r], data, now);
  assert.equal(value.current, 1);
  assert.equal(value.periods.at(-1)!.count, 1);
  assert.equal(value.periods.at(-1)!.state, "open");
});
test("scheduled off-days are neutral, imports automatically included, unrelated BP readings never form a pair", () => {
  const data = sources();
  const weight: VitalSample = {
    id: "w",
    userId: "u",
    kind: "weight",
    value: 180,
    unit: "lb",
    occurredAt: at(16),
    createdAt: at(16),
    source: "healthkit",
  };
  data.vitals = [weight];
  const r = rule("weight", {
    config: ruleConfigSchema.parse({ weekdays: [3, 5], includeImports: false }),
  });
  const result = evaluateStreak("weight", [r], data, now);
  assert.equal(result.current, 1);
  assert.equal(result.periods[1].state, "not_scheduled");
  assert.equal(
    pairedReadings([
      { ...weight, kind: "systolic_bp", correlationId: "a" },
      { ...weight, id: "d", kind: "diastolic_bp", correlationId: "b" },
    ]).length,
    0,
  );
  assert.equal(
    pairedReadings([
      { ...weight, kind: "systolic_bp", correlationId: "a" },
      { ...weight, id: "d", kind: "diastolic_bp", correlationId: "a" },
    ]).length,
    1,
  );
});
test("multiple reminder occurrences each require a completion; retention gap is unknown; undo recomputes", () => {
  const data = sources(),
    reminder = createReminder({
      userId: "u",
      kind: "custom",
      name: "Routine",
      repeat: "multiple_daily",
      time: "08:00",
      additionalTimes: ["10:00"],
      startDate: "2026-09-18",
      weekdays: [],
    });
  data.schedules = [{ effective_day: "2026-09-18", reminders: [reminder] }];
  data.reminders = [
    {
      reminderId: reminder.id,
      localDay: "2026-09-18",
      scheduledTime: "08:00",
      completedAt: at(18),
    },
  ];
  const r = rule("reminder", {
    activation_day: "2026-09-18",
    effective_day: "2026-09-18",
    config: ruleConfigSchema.parse({ reminderId: reminder.id }),
  });
  assert.equal(evaluateStreak("reminder", [r], data, now).current, 0);
  data.reminders.push({ ...data.reminders[0], scheduledTime: "10:00" });
  assert.equal(evaluateStreak("reminder", [r], data, now).current, 1);
  data.reminders.pop();
  assert.equal(evaluateStreak("reminder", [r], data, now).current, 0);
  data.coverage.reminders = { from: "2026-09-19", complete: true };
  assert.equal(
    evaluateStreak("reminder", [r], data, now).periods[0].state,
    "unknown",
  );
});
test("manual daily logging excludes imports and unfinished shells; repeated entries count once", () => {
  const data = sources();
  data.food = [{ ...food(18), entry_method: "import" }];
  data.food.push({ ...food(18), id: "legacy-import", source: "import" });
  data.sessions = [{ id: "shell", completed_at: at(18) }];
  assert.equal(
    evaluateStreak("daily_logging", [rule("daily_logging")], data, now).current,
    0,
  );
  data.food = [food(18), { ...food(18), id: "second" }];
  assert.equal(
    evaluateStreak("daily_logging", [rule("daily_logging")], data, now).current,
    1,
  );
});
test("dated protein goals apply prospectively and absent historical targets are not invented", () => {
  const data = sources();
  data.food = [food(16), food(17), food(18)];
  data.goals = [
    {
      effective_day: "2026-09-16",
      calorie_goal: 2000,
      protein_goal: 100,
      fluid_goal_ml: 1000,
    },
    {
      effective_day: "2026-09-18",
      calorie_goal: 2000,
      protein_goal: 200,
      fluid_goal_ml: 1000,
    },
  ];
  const r = rule("protein_target");
  let result = evaluateStreak("protein_target", [r], data, now);
  assert.deepEqual(
    result.periods.map((p) => p.state),
    ["met", "met", "open"],
  );
  assert.equal(result.current, 2);
  data.goals.shift();
  result = evaluateStreak("protein_target", [r], data, now);
  assert.equal(result.periods[0].explanation, "goal_unavailable");
  assert.equal(result.periods[0].state, "unknown");
  data.coverage.goals = { from: "2026-09-16", complete: false };
  assert.equal(
    evaluateStreak("protein_target", [r], data, now).periods[0].state,
    "unknown",
  );
});
test("dated reminder schedule changes do not rewrite earlier occurrence requirements", () => {
  const data = sources();
  const original = createReminder({
    userId: "u",
    kind: "custom",
    repeat: "daily",
    time: "08:00",
    additionalTimes: [],
    startDate: "2026-09-17",
    weekdays: [],
  });
  data.schedules = [
    { effective_day: "2026-09-17", reminders: [original] },
    {
      effective_day: "2026-09-18",
      reminders: [
        { ...original, repeat: "multiple_daily", additionalTimes: ["10:00"] },
      ],
    },
  ];
  data.reminders = [17, 18].map((day) => ({
    reminderId: original.id,
    localDay: `2026-09-${day}`,
    scheduledTime: "08:00",
    completedAt: at(day),
  }));
  const r = rule("reminder", {
    activation_day: "2026-09-17",
    effective_day: "2026-09-17",
    config: ruleConfigSchema.parse({ reminderId: original.id }),
  });
  const result = evaluateStreak("reminder", [r], data, now);
  assert.equal(result.current, 1);
  assert.deepEqual(
    result.periods.map((p) => p.target),
    [1, 2],
  );
  data.schedules[1].reminders[0].repeat = "once";
  assert.equal(
    evaluateStreak("reminder", [r], data, now).periods.at(-1)!.state,
    "not_scheduled",
  );
});

test("legacy weight evaluation combines imported and manual days even with a saved manual-only preference", () => {
  const data = sources();
  data.vitals = [16, 17, 17].map((day, index) => ({
    id: String(index),
    userId: "u",
    kind: "weight",
    value: 180,
    unit: "lb",
    occurredAt: at(day),
    createdAt: at(day),
    source: index === 0 ? "healthkit" : "manual",
  }));
  const result = evaluateStreak(
    "weight",
    [
      rule("weight", {
        config: ruleConfigSchema.parse({ includeImports: false }),
      }),
    ],
    data,
    now,
  );
  assert.equal(result.best, 2);
  assert.equal(result.current, 2);
});

test("goal streaks combine imported and manual nutrition evidence automatically", () => {
  const data = sources();
  data.goals = [
    {
      effective_day: "2026-09-16",
      calorie_goal: 2200,
      protein_goal: 150,
      fluid_goal_ml: 2400,
    },
  ];
  data.food = [
    {
      ...food(18),
      id: "apple",
      entry_method: "import",
      source: "import",
      protein_grams: 80,
    },
    { ...food(18), id: "manual", protein_grams: 70 },
  ];
  const result = evaluateStreak(
    "protein_target",
    [rule("protein_target")],
    data,
    now,
  );
  assert.equal(result.periods.at(-1)?.count, 150);
  assert.equal(result.periods.at(-1)?.state, "met");
});

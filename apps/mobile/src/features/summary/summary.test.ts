import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultLayout,
  layoutSchema,
  moveWidget,
  packRows,
  readLayout,
  type Widget,
} from "./layout";
import { dayBounds, dayKey, monday, shiftDay } from "./calendar";
import {
  personalRecords,
  trainingSummary,
  type LoggedSet,
  type LoggedSession,
} from "./training";
import { createLayoutStore } from "./layout-store";
import { todaysMeals } from "./meals";
test("retiring food-day completion preserves other widgets and active habits", async () => {
  const mixed = { id: "mixed", type: "streaks", size: "wide", config: { habits: ["food_logging", "food_complete", "calorie_target"] } };
  const retired = { id: "retired", type: "streaks", size: "small", config: { habits: ["food_complete"] } };
  const weight = defaultLayout().widgets[0];
  const raw = JSON.stringify({ version: 1, widgets: [weight, retired, mixed] });
  const result = readLayout(raw);
  assert.equal(result.recovered, false);
  assert.equal(result.migrated, true);
  assert.deepEqual(result.layout.widgets, [weight, { ...mixed, config: { habits: ["food_logging", "calorie_target"] } }]);
  let stored = raw;
  const store = createLayoutStore({ getItem: async () => stored, setItem: async (_key, value) => { stored = value; } });
  await store.load("synthetic");
  assert.deepEqual(JSON.parse(stored), result.layout);
  const only = readLayout(JSON.stringify({ version: 1, widgets: [retired] }));
  assert.equal(only.recovered, false);
  assert.deepEqual(only.layout.widgets, []);
  const duplicate = { ...mixed, id: "active", config: { habits: ["food_logging", "calorie_target"] } };
  assert.equal(readLayout(JSON.stringify({ version: 1, widgets: [mixed, duplicate] })).layout.widgets.length, 1);
});
test("PR retirement preserves IDs, order, sizes, settings and intentional emptiness", () => {
  const custom = {
    version: 1,
    widgets: [
      { id: "pr", type: "pr", size: "small", config: {} },
      {
        id: "custom-training",
        type: "training",
        size: "small",
        config: { period: "last7" },
      },
      { id: "custom-weight", type: "weight", size: "wide", config: {} },
    ],
  };
  const result = readLayout(JSON.stringify(custom));
  assert.equal(result.recovered, false);
  assert.deepEqual(result.layout.widgets, custom.widgets.slice(1));
  assert.deepEqual(
    readLayout(JSON.stringify({ version: 1, widgets: [custom.widgets[0]] }))
      .layout.widgets,
    [],
  );
});
test("Today's Meals groups saved meal identities for the current local day without excluding non-label foods", () => {
  const now = new Date(2026, 8, 22, 12);
  const row = {
    id: "a",
    occurred_at: new Date(2026, 8, 22, 8).toISOString(),
    calories: 100,
    protein_grams: 10,
    food_name: "Eggs",
    meal_type: "breakfast",
    meal_log_id: "meal",
  };
  const meals = todaysMeals(
    [
      row,
      { ...row, id: "b", food_name: "Toast", calories: 200 },
      {
        ...row,
        id: "old",
        occurred_at: new Date(2026, 8, 21, 23).toISOString(),
      },
    ],
    now,
  );
  assert.equal(meals.length, 1);
  assert.equal(meals[0].calories, 300);
  assert.deepEqual(meals[0].names, ["Eggs", "Toast"]);
  assert.deepEqual(todaysMeals([], now), []);
});
test("layout storage serializes rapid writes, recovers after failed writes and isolates accounts", async () => {
  const records = new Map<string, string>();
  let fail = false;
  const storage = {
    async getItem(key: string) {
      return records.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (fail) {
        fail = false;
        throw new Error("Offline");
      }
      records.set(key, value);
    },
  };
  const store = createLayoutStore(storage);
  await store.load("A");
  assert.equal(records.size, 0);
  const first = store.save("A", defaultLayout()),
    second = store.save("A", { version: 1, widgets: [] });
  await Promise.all([first, second]);
  assert.equal((await store.load("A")).layout.widgets.length, 0);
  assert.equal((await store.load("B")).layout.widgets.length, 8);
  fail = true;
  await assert.rejects(store.save("A", defaultLayout()));
  await store.save("A", defaultLayout());
  assert.equal(
    (await createLayoutStore(storage).load("A")).layout.widgets.length,
    8,
  );
});
const session = (id: string, day: number): LoggedSession => ({
  id,
  completed_at: new Date(2026, 8, day, 12).toISOString(),
});
const set = (
  session_id: string,
  weight = 100,
  reps = 8,
  patch: Partial<LoggedSet> = {},
): LoggedSet => ({
  id: session_id + weight + reps,
  session_id,
  exercise_name: "Bench press",
  muscle_group: "Chest",
  weight,
  weight_unit: "lb",
  reps,
  set_number: 1,
  ...patch,
});
test("layout preserves intentional empty, rejects corrupt/older/duplicate data and packs sequentially", () => {
  assert.deepEqual(readLayout('{"version":1,"widgets":[]}').layout.widgets, []);
  for (const raw of ["garbage", '{"version":99,"widgets":[]}', "{}"])
    assert.equal(readLayout(raw).recovered, true);
  const layout = defaultLayout();
  assert.equal(layoutSchema.safeParse(layout).success, true);
  assert.equal(
    layoutSchema.safeParse({
      ...layout,
      widgets: [layout.widgets[0], { ...layout.widgets[0], id: "another" }],
    }).success,
    false,
  );
  const [small, other] = layout.widgets;
  const rows = packRows(
    [small, { ...layout.widgets[4], size: "wide" }, other],
    false,
  );
  assert.deepEqual(
    rows.map((r) => r.map((w) => w.type)),
    [["weight"], ["fluids"], ["bp"]],
  );
  assert.equal(packRows(layout.widgets, true).length, layout.widgets.length);
  assert.equal(moveWidget(layout.widgets, 0, 3)[3].type, "weight");
  assert.equal(moveWidget(layout.widgets, 0, -1), layout.widgets);
  const streak: Widget = {
    id: "streak",
    type: "streaks",
    size: "wide",
    config: { habits: ["daily_logging", "training"] },
  };
  assert.equal(
    layoutSchema.safeParse({
      ...layout,
      widgets: [
        streak,
        {
          ...streak,
          id: "second",
          config: { habits: ["training", "daily_logging"] },
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    layoutSchema.safeParse({
      ...layout,
      widgets: [{ ...streak, size: "small" }],
    }).success,
    false,
  );
});
test("calendar arithmetic crosses DST, month and year using local midnights", () => {
  const old = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const spring = dayBounds("2026-03-08"),
      fall = dayBounds("2026-11-01");
    assert.equal((+spring.end - +spring.start) / 3600000, 23);
    assert.equal((+fall.end - +fall.start) / 3600000, 25);
    assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
    assert.equal(monday("2027-01-03"), "2026-12-28");
    assert.equal(dayKey(new Date("2026-09-18T01:00:00Z")), "2026-09-17");
  } finally {
    process.env.TZ = old;
  }
});
test("training excludes shells, invalid and deleted cardio; pairs count one logical set", () => {
  const result = trainingSummary(
    [session("a", 14), session("shell", 15), session("b", 14)],
    [
      set("a"),
      set("b", 20, 8, {
        side_mode: "unilateral",
        right_weight: 20,
        right_reps: 8,
        muscle_group: null,
      }),
    ],
    [
      {
        id: "c",
        occurred_at: session("x", 14).completed_at,
        duration_minutes: 20,
      },
      {
        id: "deleted",
        occurred_at: session("x", 15).completed_at,
        duration_minutes: 100,
        deleted_at: "yes",
      },
    ],
    new Date(2026, 8, 18, 15),
    "week",
  );
  assert.deepEqual(
    [result.lifting, result.cardio, result.days, result.sets, result.minutes],
    [2, 1, 1, 2, 20],
  );
  assert.equal(result.groups.Unassigned, 1);
  assert.equal(result.start, "2026-09-14");
  assert.equal(result.end, "2026-09-20");
});
test("PR baseline, ties, same-session best, earlier-session chronology and edits/deletes", () => {
  const sessions = [session("a", 1), session("b", 2), session("c", 3)];
  assert.equal(personalRecords([sessions[0]], [set("a")]).length, 0);
  assert.equal(personalRecords(sessions, [set("a"), set("b")]).length, 0);
  const records = personalRecords(sessions, [
    set("a"),
    set("b", 110),
    set("b", 120, 7, { set_number: 2 }),
    set("c", 100, 10),
  ]);
  assert.equal(records[0].type, "reps");
  assert.equal(records[0].previous, 8);
  assert.equal(
    records.filter((r) => r.sessionId === "b" && r.type === "load").length,
    1,
  );
  assert.equal(records.find((r) => r.type === "load")!.value, 120);
  assert.equal(
    personalRecords(sessions, [set("a"), set("b", 90), set("c", 90)]).length,
    0,
  );
  assert.equal(
    personalRecords([sessions[0]], [set("a"), set("b", 120)]).length,
    0,
  );
});
test("PR normalizes compatible units, keeps variations and sides distinct, includes zero-load reps", () => {
  const sessions = [session("a", 1), session("b", 2)];
  assert.equal(
    personalRecords(sessions, [
      set("a", 100),
      set("b", 45.36, 8, { weight_unit: "kg" }),
    ]).length,
    0,
  );
  assert.equal(
    personalRecords(sessions, [
      set("a"),
      set("b", 150, 8, { exercise_name: "Dumbbell bench press" }),
    ]).length,
    0,
  );
  const body = personalRecords(sessions, [set("a", 0), set("b", 0, 10)]);
  assert.equal(body[0].type, "reps");
  const both = personalRecords(sessions, [
    set("a", 20, 8, {
      side_mode: "unilateral",
      right_weight: 30,
      right_reps: 8,
    }),
    set("b", 25, 8, {
      side_mode: "unilateral",
      right_weight: 30,
      right_reps: 10,
    }),
  ]);
  assert.deepEqual(both.map((r) => [r.side, r.type]).sort(), [
    ["left", "load"],
    ["right", "reps"],
  ]);
  assert.equal(
    personalRecords(sessions, [
      set("a"),
      set("b", 150, 8, {
        side_mode: "unilateral",
        right_weight: 150,
        right_reps: 8,
      }),
    ]).length,
    0,
  );
});
test("records beyond the old 100-session cap remain comparable; equal timestamps share a baseline", () => {
  const sessions = Array.from({ length: 120 }, (_, i) => ({
    id: String(i),
    completed_at: new Date(2025, 0, i + 1, 12).toISOString(),
  }));
  const records = personalRecords(
    sessions,
    sessions.map((s, i) => set(s.id, i === 119 ? 110 : 100)),
  );
  assert.equal(records[0].sessionId, "119");
  assert.equal(records.length, 1);
  assert.equal(
    personalRecords(
      [session("a", 1), session("b", 1)],
      [set("a"), set("b", 120)],
    ).length,
    0,
  );
});

test("default Summary contains only the original eight widgets in their original sizes", () => {
  assert.deepEqual(
    defaultLayout().widgets.map((w) => [w.type, w.size]),
    [
      ["weight", "small"],
      ["bp", "small"],
      ["calories", "small"],
      ["protein", "small"],
      ["fluids", "wide"],
      ["calendar", "wide"],
      ["weight_trend", "wide"],
      ["bp_trend", "wide"],
    ],
  );
});

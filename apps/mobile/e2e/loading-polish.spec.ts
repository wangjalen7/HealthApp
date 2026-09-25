import { expect, quickLog, signIn, test } from "./fixture";
const user = "11111111-1111-4111-8111-111111111111";
const food = (at = new Date().toISOString()) => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  user_id: user,
  food_name: "Test lunch",
  calories: 640,
  protein_grams: 32,
  occurred_at: at,
  quantity: 1,
  quantity_unit: "serving",
  serving_count: 1,
  meal_type: "lunch",
  entry_method: "basic",
  version: 1,
});
const fluid = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  user_id: user,
  fluid_name: "Test water",
  volume_ml: 240,
  occurred_at: new Date().toISOString(),
  category_id: "water",
  alcohol_status: "nonalcoholic",
  counting_policy: "beverage_volume_v1",
  version: 1,
};
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}

test("daily totals render independently of slow calendar and Health sync, with stable card skeletons", async ({
  page,
  backend,
}, info) => {
  backend.tables.nutrition_entries = [food()];
  backend.tables.hydration_entries = [fluid];
  const calendar = gate(),
    health = gate(),
    nutrition = gate();
  await page.route("**/rest/v1/rpc/read_vital_changes", async (route) => {
    await health.promise;
    await route.fallback();
  });
  await page.route("**/rest/v1/nutrition_entries?*", async (route) => {
    const select =
      new URL(route.request().url()).searchParams.get("select") ?? "";
    await (select.includes("occurred_at")
      ? calendar.promise
      : nutrition.promise);
    await route.fallback();
  });
  await signIn(page);
  await expect(page.getByTestId("sustain-entry-cover")).toHaveCount(0);
  await expect(page.getByTestId("skeleton-calories")).toBeVisible();
  await expect(page.getByTestId("skeleton-weight")).toBeVisible();
  const card = page.getByTestId("summary-widget-default-calories");
  const before = await card.boundingBox();
  await expect(
    page.getByRole("button", { name: /^Fluids: 8.1 of 81 fl oz$/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Calories: 0/ })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: info.outputPath("summary-initial-skeletons.png"),
    fullPage: true,
  });
  nutrition.release();
  await expect(
    page.getByRole("button", {
      name: "Calories: 640 of 2200 cal",
      exact: true,
    }),
  ).toBeVisible();
  expect((await card.boundingBox())?.height).toBe(before?.height);
  await expect(page.getByTestId("skeleton-calendar")).toBeVisible();
  await expect(page.getByLabel(/no food logged/)).toHaveCount(0);
  calendar.release();
  health.release();
  await expect(page.getByTestId("skeleton-calendar")).toHaveCount(0);
});

test("a failed initial source retries without hiding fluids; failed background refresh retains calories", async ({
  page,
  backend,
}) => {
  backend.tables.nutrition_entries = [food()];
  backend.tables.hydration_entries = [fluid];
  backend.failReads = {
    nutrition_entries: { code: "XX000", message: "Temporarily unavailable" },
  };
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Retry Calories", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Calories: 0/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: /^Fluids: 8.1/ }),
  ).toBeVisible();
  backend.failReads = undefined;
  await page
    .getByRole("button", { name: "Retry Calories", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Calories: 640 of 2200 cal",
      exact: true,
    }),
  ).toBeVisible();
  backend.failReads = {
    nutrition_entries: { code: "XX000", message: "Offline" },
  };
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page.getByRole("tab", { name: "Summary", exact: true }).first().click();
  await expect(
    page.getByRole("button", {
      name: "Calories: 640 of 2200 cal",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("skeleton-calories")).toHaveCount(0);
  await expect(
    page
      .getByText("Could not update. Showing saved data. Retry", { exact: true })
      .first(),
  ).toBeVisible();
});

test("late calendar results cannot replace the selected month and midnight refresh uses the new day", async ({
  page,
  backend,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-09-23T12:00:00Z") });
  backend.tables.nutrition_entries = [food("2026-09-23T11:00:00Z")];
  const old = gate();
  await page.route("**/rest/v1/nutrition_entries?*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.searchParams.get("select")?.includes("occurred_at") &&
      url.searchParams
        .getAll("occurred_at")
        .some((v) => v.startsWith("gte.2026-08-"))
    )
      await old.promise;
    await route.fallback();
  });
  await signIn(page);
  await expect(
    page.getByRole("button", {
      name: "Calories: 640 of 2200 cal",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show previous month" }).click();
  await expect(page.getByTestId("skeleton-calendar")).toBeVisible();
  await page.getByRole("button", { name: "Show previous month" }).click();
  await expect(
    page.getByRole("heading", { name: "July 2026 Calories" }),
  ).toBeVisible();
  await expect(page.getByTestId("skeleton-calendar")).toHaveCount(0);
  old.release();
  await expect(
    page.getByRole("heading", { name: "July 2026 Calories" }),
  ).toBeVisible();
  await page.clock.setSystemTime(new Date("2026-09-24T12:00:00Z"));
  await page.clock.fastForward(31000);
  await expect(
    page.getByRole("button", { name: "Calories: 0 of 2200 cal", exact: true }),
  ).toBeVisible();
});

test("History categories load independently, and original fluid actions stay usable at narrow and larger text sizes", async ({
  page,
  backend,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  backend.tables.hydration_entries = [fluid];
  backend.tables.nutrition_entries = [food()];
  const workouts = gate();
  await page.route("**/rest/v1/workout_sessions?*", async (route) => {
    await workouts.promise;
    await route.fallback();
  });
  await signIn(page);
  await page.getByRole("tab", { name: "History", exact: true }).first().click();
  await expect(page.getByTestId("history-skeleton")).toBeVisible();
  await expect(page.getByText("No workouts yet", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("tab", { name: "Food", exact: true }).click();
  await expect(page.getByText("Test lunch", { exact: true })).toBeVisible();
  await expect(page.getByTestId("history-skeleton")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("history-food-light.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Fluids", exact: true }).click();
  const classify = page.getByRole("button", { name: "Classify Test water" });
  const remove = page.getByRole("button", { name: "Delete Test water entry" });
  const checkActions = async () => {
    await expect(classify).toBeVisible();
    await expect(remove).toBeVisible();
    const text = (await classify.boundingBox())!;
    const trash = (await remove.boundingBox())!;
    expect(text.height).toBeGreaterThanOrEqual(44);
    expect(trash.height).toBeGreaterThanOrEqual(44);
    expect(trash.width).toBeGreaterThanOrEqual(44);
    for (const control of [text, trash]) {
      expect(control.x).toBeGreaterThanOrEqual(0);
      expect(control.x + control.width).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
    }
  };
  await checkActions();
  await page.setViewportSize({ width: 320, height: 740 });
  await classify.locator('[dir="auto"]').evaluateAll((nodes) =>
    nodes.forEach((node) => {
      if (node.textContent === "Change drink category")
        Object.assign((node as HTMLElement).style, {
          fontSize: "28px",
          lineHeight: "34px",
        });
    }),
  );
  await checkActions();
  await page.screenshot({
    path: info.outputPath("history-fluid-large-text-320.png"),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.screenshot({
    path: info.outputPath("history-fluid-dark-320.png"),
    fullPage: true,
  });
  workouts.release();
});

test("cardio history shortcut preserves an unfinished draft, never saves, and shows a saved entry without manual subtext", async ({
  page,
  backend,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await quickLog(page, "Workout");
  await page.getByRole("tab", { name: "Cardio", exact: true }).click();
  await page.getByRole("radio", { name: "walk", exact: true }).click();
  await page.getByLabel("Minutes", { exact: true }).fill("25");
  await page
    .getByLabel("Cardio notes (optional)", { exact: true })
    .fill("Unfinished walk");
  await page
    .getByRole("button", { name: "View workout history", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Workout", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(backend.tables.cardio_entries ?? []).toHaveLength(0);
  await page
    .getByRole("button", { name: "Back to cardio", exact: true })
    .click();
  await page.getByRole("tab", { name: "Cardio", exact: true }).click();
  await expect(page.getByLabel("Minutes", { exact: true })).toHaveValue("25");
  await expect(
    page.getByLabel("Cardio notes (optional)", { exact: true }),
  ).toHaveValue("Unfinished walk");
  await page.getByRole("button", { name: "Save cardio", exact: true }).click();
  await expect(
    page.getByText("Cardio activity saved.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View workout history", exact: true })
    .click();
  await expect(page.getByText("25 min", { exact: true })).toBeVisible();
  await expect(page.getByText("manual", { exact: true })).toHaveCount(0);
  expect(backend.tables.cardio_entries).toHaveLength(1);
  expect(backend.tables.cardio_entries[0].source).toBe("manual");
  await page.screenshot({
    path: info.outputPath("history-cardio-light.png"),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("button", { name: "Create a new health log" }).click();
  await page.screenshot({
    path: info.outputPath("quick-log-dark.png"),
    fullPage: true,
  });
});

test("cached readings appear before a fresh sync, and all five History categories retain their values and attribution", async ({
  page,
  backend,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const at = new Date().toISOString();
  backend.tables.nutrition_entries = [food()];
  backend.tables.hydration_entries = [fluid];
  backend.tables.vital_samples = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      kind: "weight",
      value: 175,
      unit: "lb",
      source: "healthkit",
      source_name: "Test scale",
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      kind: "systolic_bp",
      value: 118,
      unit: "mmHg",
      source: "manual",
      correlation_id: "20000000-0000-4000-8000-000000000001",
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      kind: "diastolic_bp",
      value: 76,
      unit: "mmHg",
      source: "manual",
      correlation_id: "20000000-0000-4000-8000-000000000001",
    },
  ].map((entry) => ({
    ...entry,
    user_id: user,
    occurred_at: at,
    created_at: at,
    version: 1,
  }));
  backend.tables.workout_sessions = [
    {
      id: "30000000-0000-4000-8000-000000000001",
      user_id: user,
      completed_at: at,
      title: "Test lifting",
      muscle_groups: ["chest"],
      version: 1,
    },
  ];
  backend.tables.workout_sets = [
    {
      id: "40000000-0000-4000-8000-000000000001",
      session_id: "30000000-0000-4000-8000-000000000001",
      user_id: user,
      exercise_name: "Bench press",
      exercise_order: 0,
      muscle_group: "chest",
      set_number: 1,
      weight: 135,
      weight_unit: "lb",
      reps: 10,
      side_mode: "bilateral",
      created_at: at,
    },
  ];
  backend.tables.cardio_entries = [
    {
      id: "50000000-0000-4000-8000-000000000001",
      user_id: user,
      occurred_at: at,
      activity_type: "walk",
      activity_name: "Outdoor walk",
      duration_minutes: 30,
      distance_miles: 1.5,
      source: "healthkit",
      source_name: "Test watch",
      version: 1,
    },
  ];
  await signIn(page);
  await expect(
    page
      .getByTestId("summary-widget-default-weight")
      .getByRole("button", { name: /^Weight.*175/ }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "History", exact: true }).first().click();
  const historyPage = page
    .getByRole("heading", { name: "History", exact: true })
    .locator("..");
  for (const mode of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: mode });
    for (const [category, value] of [
      ["Workout", "Bench press"],
      ["Food", "Test lunch"],
      ["Fluids", "Test water"],
      ["Weight", "175 lb"],
      ["Blood pressure", "118/76 mmHg"],
    ]) {
      await page.getByRole("tab", { name: category, exact: true }).click();
      await expect(historyPage.getByText(value, { exact: true })).toBeVisible();
      if (category === "Workout")
        await expect(historyPage.getByText(/Apple Health/)).toBeVisible();
      await page.screenshot({
        path: info.outputPath(
          `history-${category.replaceAll(" ", "-")}-${mode}.png`,
        ),
      });
    }
  }
  const sync = gate();
  await page.route("**/rest/v1/rpc/read_vital_changes", async (route) => {
    await sync.promise;
    await route.fallback();
  });
  await signIn(page);
  await expect(
    page
      .getByTestId("summary-widget-default-weight")
      .getByRole("button", { name: /^Weight.*175/ }),
  ).toBeVisible();
  await expect(page.getByTestId("skeleton-weight")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Blood pressure.*118\/76/ }),
  ).toBeVisible();
  sync.release();
});

import { expect, signIn, test } from "./fixture";
import { habits, habitLabels } from "../src/features/summary/layout";
const user = "11111111-1111-4111-8111-111111111111",
  key = `healthapp:summary-layout:${user}`;

test("streak widgets share the current calendar week in Small and Large sizes", async ({
  page,
  backend,
}, info) => {
  await page.clock.setFixedTime(new Date(2026, 8, 23, 12));
  backend.tables.streak_rules = habits.map((habit) => ({
    user_id: user,
    habit,
    effective_day: "2026-09-01",
    activation_day: "2026-09-01",
    enabled: true,
    version: 1,
    config: {},
  }));
  backend.tables.streak_goal_snapshots = [
    {
      user_id: user,
      effective_day: "2026-09-01",
      calorie_goal: 2200,
      protein_goal: 20,
      fluid_goal_ml: 2400,
    },
  ];
  backend.tables.nutrition_entries = [
    {
      id: "week-food",
      user_id: user,
      meal_log_id: "week-meal",
      food_name: "Test meal",
      calories: 400,
      protein_grams: 20,
      occurred_at: "2026-09-22T12:00:00Z",
    },
  ];
  await page.goto("/sign-in");
  await page.evaluate(
    ({ key }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          widgets: [
            {
              id: "week-food",
              type: "streaks",
              size: "small",
              config: { habits: ["protein_target"] },
            },
            {
              id: "week-weight",
              type: "streaks",
              size: "small",
              config: { habits: ["fluid_target"] },
            },
            {
              id: "week-training",
              type: "streaks",
              size: "wide",
              config: { habits: ["training"] },
            },
          ],
        }),
      ),
    { key },
  );
  await signIn(page);
  for (const habit of ["protein_target", "fluid_target", "training"]) {
    const week = page.getByTestId(`streak-week-${habit}`);
    await expect(week).toBeVisible();
    const days = week.locator('[aria-label^="2026-"]');
    await expect(days).toHaveCount(7);
    for (let index = 0; index < 7; index++) {
      await expect(days.nth(index)).toHaveAttribute(
        "aria-label",
        new RegExp(`^2026-09-${21 + index}:`),
      );
      await expect(days.nth(index)).toHaveText(
        new RegExp(
          `${["M", "T", "W", "T", "F", "S", "S"][index]}.*${21 + index}`,
        ),
      );
    }
    await expect(days.nth(3)).toHaveAttribute(
      "aria-label",
      "2026-09-24: Upcoming",
    );
    expect(
      await week.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  }
  await expect(
    page
      .getByTestId("streak-week-protein_target")
      .getByLabel("2026-09-22: Goal reached", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/since 2026-09-01/)).toHaveCount(0);
  await page
    .getByTestId("summary-widget-week-food")
    .screenshot({ path: info.outputPath("small-streak-week.png") });
  await page
    .getByTestId("summary-widget-week-training")
    .screenshot({ path: info.outputPath("large-streak-week.png") });
});

for (const width of [390, 320]) {
  test(`streak choices stay still while toggling at ${width}px`, async ({
    page,
    backend,
  }) => {
    expect(backend.tables).toBeDefined();
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/sign-in");
    await page.evaluate(
      ({ key }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            widgets: [
              {
                id: "stable-streaks",
                type: "streaks",
                size: "wide",
                config: {
                  habits: [
                    "calorie_target",
                    "protein_target",
                    "fluid_target",
                    "training",
                  ],
                },
              },
            ],
          }),
        ),
      { key },
    );
    await signIn(page);
    await page
      .getByRole("button", { name: "Edit Streaks widget", exact: true })
      .click();
    const scroll = page.getByTestId("settings-sheet-scroll");
    const sheet = page.getByTestId("settings-sheet");
    for (const habit of [
      "calorie_target",
      "protein_target",
      "fluid_target",
      "training",
      "training",
      "fluid_target",
      "fluid_target",
    ]) {
      const choice = page.getByRole("checkbox", {
        name: habitLabels[habit as keyof typeof habitLabels],
        exact: true,
      });
      await choice.scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
      const before = {
        row: await choice.boundingBox(),
        sheet: await sheet.boundingBox(),
        scroll: await scroll.evaluate((el) => el.scrollTop),
      };
      const checked = await choice.getAttribute("aria-checked");
      await choice.click();
      await expect(choice).toHaveAttribute(
        "aria-checked",
        checked === "true" ? "false" : "true",
      );
      await page.waitForTimeout(350);
      expect(await choice.boundingBox()).toEqual(before.row);
      expect(await sheet.boundingBox()).toEqual(before.sheet);
      expect(await scroll.evaluate((el) => el.scrollTop)).toBe(before.scroll);
    }
  });
}

test("Streaks and Quick Actions edit directly with isolated save and discard", async ({
  page,
  backend,
}, info) => {
  const layout = {
    version: 1,
    widgets: [
      {
        id: "actions",
        type: "actions",
        size: "wide",
        config: { actions: ["Workout", "Food", "Fluids", "Weight"] },
      },
      {
        id: "habits",
        type: "streaks",
        size: "wide",
        config: { habits: ["calorie_target"] },
      },
      {
        id: "other-habits",
        type: "streaks",
        size: "small",
        config: { habits: ["fluid_target"] },
      },
    ],
  };
  await page.goto("/sign-in");
  await page.evaluate(
    ({ key, layout }) => localStorage.setItem(key, JSON.stringify(layout)),
    { key, layout },
  );
  await signIn(page);
  await page
    .getByRole("button", { name: "Edit Quick Actions widget", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Edit Summary", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preview widget", exact: true })
    .click();
  await expect(page.getByText("Widget preview", { exact: true })).toBeVisible();
  const preview = page.getByTestId("widget-options-preview");
  expect(
    await preview.evaluate(
      (element) => element.scrollHeight <= element.clientHeight + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Back to options", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Blood pressure", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key),
  ).toEqual(layout);
  await page
    .getByRole("button", { name: "Edit Quick Actions widget", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Blood pressure", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByTestId("settings-sheet")).toHaveCount(0);
  await expect(
    page
      .getByTestId("summary-widget-actions")
      .getByRole("button", { name: "Blood pressure", exact: true }),
  ).toBeVisible();

  await page
    .getByTestId("summary-widget-habits")
    .getByRole("button", { name: "Edit Streaks widget", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Protein target", exact: true })
    .click();
  expect(
    backend.tables.streak_rules?.some((r) => r.habit === "protein_target") ??
      false,
  ).toBe(false);
  await page
    .getByRole("button", { name: "Dismiss Widget options", exact: true })
    .click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  expect(
    backend.tables.streak_rules?.some((r) => r.habit === "protein_target") ??
      false,
  ).toBe(false);
  await page
    .getByTestId("summary-widget-habits")
    .getByRole("button", { name: "Edit Streaks widget", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Protein target", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByTestId("settings-sheet")).toHaveCount(0);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(saved.widgets[1].config.habits).toEqual([
    "calorie_target",
    "protein_target",
  ]);
  expect(saved.widgets[2]).toEqual(layout.widgets[2]);
  expect(
    backend.tables.streak_rules?.some((r) => r.habit === "protein_target"),
  ).toBe(true);
  await page
    .getByTestId("summary-widget-habits")
    .getByRole("button", { name: "Edit Streaks widget", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dismiss Widget options", exact: true })
    .hover();
  await page.waitForTimeout(350);
  await page.screenshot({ path: info.outputPath("direct-widget-options.png") });
});

test("retired completion disappears from saved widgets, rules and configuration", async ({
  page,
  backend,
}) => {
  const day = new Date().toLocaleDateString("en-CA");
  backend.tables.streak_rules = [
    "food_complete",
    "food_logging",
    "calorie_target",
  ].map((habit) => ({
    user_id: user,
    habit,
    effective_day: day,
    activation_day: day,
    enabled: true,
    version: 1,
    config: { calorieMode: "under" },
  }));
  backend.tables.streak_goal_snapshots = [
    {
      user_id: user,
      effective_day: day,
      calorie_goal: 2200,
      protein_goal: 150,
      fluid_goal_ml: 2400,
    },
  ];
  backend.tables.nutrition_entries = [
    {
      id: "food",
      user_id: user,
      calories: 400,
      protein_grams: 20,
      occurred_at: new Date().toISOString(),
    },
  ];
  await page.goto("/sign-in");
  await page.evaluate(
    ({ key }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          widgets: [
            {
              id: "old",
              type: "streaks",
              size: "small",
              config: { habits: ["food_complete"] },
            },
            {
              id: "mixed",
              type: "streaks",
              size: "wide",
              config: {
                habits: ["food_complete", "food_logging", "calorie_target"],
              },
            },
          ],
        }),
      ),
    { key },
  );
  await signIn(page);
  await expect(page.getByTestId(/^summary-widget-/)).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Food day completed streak details" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Calorie target streak details",
      exact: true,
    }),
  ).toContainText("1 days");
  expect(backend.tables.food_day_completions ?? []).toHaveLength(0);
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page
    .getByRole("button", { name: "Customize Streaks", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Food day completed", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Food logging", exact: true }),
  ).toHaveCount(0);
});

test("original Summary and editor have stable visual captures", async ({
  page,
  backend,
}, info) => {
  void backend;
  await signIn(page);
  await expect(page.getByTestId(/^summary-widget-/)).toHaveCount(8);
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath("summary-default.png") });
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page
    .getByRole("button", { name: "Customize Calories", exact: true })
    .hover();
  await page.getByTestId("summary-editor-scroll").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: info.outputPath("summary-editor.png") });
});

test("all streak sheets remain bounded on narrow screens and expose their specific controls", async ({
  page,
  backend,
}, info) => {
  const now = new Date(),
    day = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  backend.tables.streak_rules = habits.map((habit) => ({
    user_id: user,
    habit,
    effective_day: day,
    activation_day: day,
    enabled: true,
    version: 1,
    config: { calorieMode: "under" },
  }));
  backend.tables.streak_goal_snapshots = [
    {
      user_id: user,
      effective_day: day,
      calorie_goal: 2200,
      protein_goal: 150,
      fluid_goal_ml: 2400,
    },
  ];
  await page.goto("/sign-in");
  await page.evaluate(
    ({ key, habits }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          widgets: habits.map((habit) => ({
            id: habit,
            type: "streaks",
            size: "wide",
            config: { habits: [habit] },
          })),
        }),
      ),
    { key, habits },
  );
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 740 });
  for (const habit of habits) {
    await page
      .getByRole("button", {
        name: `${habitLabels[habit]} streak details`,
        exact: true,
      })
      .click();
    const sheet = page.getByTestId("settings-sheet");
    await page
      .getByRole("button", {
        name: `Dismiss ${habitLabels[habit]}`,
        exact: true,
      })
      .hover();
    await page.waitForTimeout(350); // Finish the native-modal web fade before visual capture.
    const box = (await sheet.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(724);
    expect(box.width).toBeLessThanOrEqual(320);
    if (habit === "training")
      await expect(
        page.getByLabel("Training days per week", { exact: true }),
      ).toBeVisible();
    if (habit === "calorie_target") {
      await expect(
        page.getByRole("tab", { name: "At or under", exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Calorie tolerance percent")).toHaveCount(0);
    }
    if (habit === "protein_target")
      await page.screenshot({
        path: info.outputPath("compact-food-streak-320.png"),
      });
    await page
      .getByRole("button", {
        name: `Dismiss ${habitLabels[habit]}`,
        exact: true,
      })
      .click();
  }
});
test("retired PR preserves a custom layout; meals show saved totals and navigate", async ({
  page,
  backend,
}, info) => {
  const at = new Date().toISOString();
  backend.tables.nutrition_entries = [
    {
      id: "food-a",
      user_id: user,
      meal_log_id: "meal-a",
      food_name: "Eggs with a very long descriptive meal name",
      meal_type: "breakfast",
      calories: 300,
      protein_grams: 20,
      occurred_at: at,
    },
    {
      id: "food-b",
      user_id: user,
      meal_log_id: "meal-a",
      food_name: "Toast",
      meal_type: "breakfast",
      calories: 120,
      protein_grams: 4,
      occurred_at: at,
    },
  ];
  await page.goto("/sign-in");
  await page.evaluate(
    ({ key }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          widgets: [
            { id: "retired", type: "pr", size: "small", config: {} },
            { id: "mine", type: "meals", size: "wide", config: {} },
            { id: "weight", type: "weight", size: "wide", config: {} },
          ],
        }),
      ),
    { key },
  );
  await signIn(page);
  await expect(page.getByTestId(/^summary-widget-/)).toHaveCount(2);
  await expect(page.getByText("420 cal today", { exact: false })).toBeVisible();
  expect(
    (
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)
    ).widgets.map((w: { id: string }) => w.id),
  ).toEqual(["mine", "weight"]);
  await expect(
    page.getByText("Refreshing saved results.", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("todays-meals.png") });
  await page
    .getByRole("button", { name: "View all food", exact: true })
    .click();
  await expect(page).toHaveURL(/history/);
});
test("adding a streak activates only on Done; short detail sheets fit their contents", async ({
  page,
  backend,
}, info) => {
  backend.tables.nutrition_entries = [
    {
      id: "food",
      user_id: user,
      calories: 400,
      protein_grams: 30,
      occurred_at: new Date().toISOString(),
    },
  ];
  await signIn(page);
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Recent Personal Record" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add Streaks", exact: true }).click();
  expect(backend.tables.streak_rules ?? []).toHaveLength(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  expect(backend.tables.streak_rules ?? []).toHaveLength(0);
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await page.getByRole("button", { name: "Add Streaks", exact: true }).click();
  await page
    .getByRole("button", { name: "Customize Streaks", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Calorie target", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Protein target", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to layout", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(() =>
      backend.tables.streak_rules?.some((r) => r.habit === "protein_target"),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Protein target streak details", exact: true })
    .click();
  await expect(page.getByText("Set up this optional habit")).toHaveCount(0);
  const heading = await page
    .getByRole("heading", { name: "Protein target", exact: true })
    .boundingBox();
  expect(heading!.y).toBeGreaterThan(30);
  await page.waitForTimeout(350);
  await page.screenshot({ path: info.outputPath("food-streak-sheet.png") });
});
test("first launch shows welcome, returning entry uses login and sync lives in Profile", async ({
  page,
  backend,
}) => {
  void backend;
  await page.goto("/");
  await expect(page.getByText("Your health, in one place.")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Already have an account? Sign in",
      exact: true,
    })
    .click();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Back to welcome", { exact: true })).toHaveCount(
    0,
  );
  await signIn(page);
  await expect(page.getByRole("button", { name: "Sync now" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: /^Sync & Pending Changes,/ }).click();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(
    page.getByText("Up to Date", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
});
test("deletion requires password and deliberate confirmation, resumes after failure and clears this account only", async ({
  page,
  backend,
}) => {
  void backend;
  let prepared = false,
    failures = 1;
  await page.route("**/functions/v1/delete-account", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.userId).toBeUndefined();
    if (body.action === "status")
      return route.fulfill({ json: { ready: true } });
    if (body.action === "prepare") {
      expect(body.password).toBe("synthetic-password");
      expect(body.confirmation).toBe("DELETE");
      prepared = true;
      return route.fulfill({ json: { prepared: true } });
    }
    expect(prepared).toBe(true);
    if (failures--)
      return route.fulfill({
        status: 503,
        json: {
          message: "Deletion is not complete. Retry to safely continue.",
        },
      });
    return route.fulfill({ json: { completed: true } });
  });
  await signIn(page);
  await page.evaluate(
    ({ user }) => {
      localStorage.setItem(`healthapp:summary-layout:${user}`, "private");
      localStorage.setItem(
        "healthapp:summary-layout:other-account",
        "preserve",
      );
    },
    { user },
  );
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage Account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete Account", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Permanently delete account",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByLabel("Current password for account deletion", { exact: true })
    .fill("synthetic-password");
  await page
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete account", exact: true })
    .click();
  await expect(
    page.getByText("Deletion is not complete. Retry to safely continue.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume account deletion", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue deletion", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), key),
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("healthapp:summary-layout:other-account"),
    ),
  ).toBe("preserve");
});

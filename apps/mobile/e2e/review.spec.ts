import { test, expect, signIn, quickLog } from "./fixture";

test("authentication validation and protected Quick Log", async ({
  page,
  backend,
}) => {
  void backend;
  await page.goto("/create");
  await expect(page.getByText("Welcome back")).toBeVisible();
  await page.getByText("Forgot password?", { exact: true }).click();
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("review@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText("Reset link sent", { exact: true }),
  ).toBeVisible();
});

test("review all screens at phone and desktop widths", async ({
  page,
  backend,
}, testInfo) => {
  void backend;
  const errors: string[] = [];
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.log("Browser:", message.text());
  });
  await signIn(page);
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("tab", { name: "Summary" }).click();
    await page.screenshot({
      path: testInfo.outputPath(`summary-${width}.png`),
    });
    for (const title of [
      "Food",
      "Water",
      "Blood pressure",
      "Weight",
      "Workout",
      "Reminders",
    ]) {
      await quickLog(page, title);
      await expect(
        page.getByRole("progressbar").filter({ visible: true }),
      ).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`${title}-${width}.png`),
      });
      if (title === "Workout") {
        await page.getByRole("tab", { name: "Cardio", exact: true }).click();
        await expect(page.getByLabel("Minutes", { exact: true })).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Cardio form" }),
        ).toHaveCount(0);
        await page.screenshot({
          path: testInfo.outputPath(`Cardio-${width}.png`),
        });
        await page.getByRole("tab", { name: "Lifting", exact: true }).click();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
    }
    for (const title of ["History", "AI Coach", "Profile"]) {
      await page.getByRole("tab", { name: title, exact: true }).click();
      if (title === "History")
        await expect(
          page.getByRole("button", { name: "Add a log" }),
        ).toBeVisible();
      if (title === "Profile")
        await expect(
          page.getByRole("button", { name: "Name saved", exact: true }),
        ).toBeDisabled();
      await page.screenshot({
        path: testInfo.outputPath(`${title}-${width}.png`),
      });
    }
  }
  expect(errors).toEqual([]);
});

test("water save, failed save and retry reach food history", async ({
  page,
  backend,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  backend.tables.nutrition_entries = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      user_id: "11111111-1111-4111-8111-111111111111",
      food_name: "Review oats",
      meal_type: "breakfast",
      calories: 150,
      protein_grams: 5,
      quantity: 40,
      quantity_unit: "g",
      occurred_at: new Date().toISOString(),
    },
  ];
  await signIn(page);
  await quickLog(page, "Water");
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(
    page.getByText("Enter a fluid name and an amount greater than zero."),
  ).toBeVisible();
  await page.getByRole("button", { name: "12 fl oz", exact: true }).click();
  backend.failNextWrite = "hydration_entries";
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(
    page.getByText("Test connection unavailable. Try again."),
  ).toBeVisible();
  await expect(page.getByLabel("Fluid amount", { exact: true })).toHaveValue(
    "12",
  );
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(page.getByText("Fluid saved.", { exact: true })).toBeVisible();
  expect(backend.tables.hydration_entries).toHaveLength(1);
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page.getByRole("tab", { name: "Food", exact: true }).click();
  await expect(page.getByText(/12 fl oz/).first()).toBeVisible();
  await expect(page.getByText("Fluids", { exact: true })).toBeVisible();
  await expect(page.getByText("Review oats", { exact: true })).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath(`food-and-fluids-${width}.png`),
    });
  }
  await page.getByRole("button", { name: "Delete Water entry" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(backend.tables.hydration_entries).toHaveLength(1);
  await page.getByRole("button", { name: "Delete Water entry" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Fluids", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Review oats", { exact: true })).toBeVisible();
  await expect(page.getByText("0 fl oz water", { exact: true })).toBeVisible();
  expect(backend.tables.nutrition_entries).toHaveLength(1);
  expect(backend.tables.hydration_entries).toHaveLength(0);
  await page.getByRole("button", { name: "Delete Review oats" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No food or water saved yet")).toBeVisible();
});

test("weight and blood pressure persist and appear in history", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await quickLog(page, "Weight");
  await page.getByLabel("Weight (lb)", { exact: true }).fill("180");
  await page.getByRole("button", { name: /Save/ }).click();
  await expect(page.getByText(/Saved/).filter({ visible: true })).toBeVisible();
  expect(backend.tables.vital_samples).toHaveLength(1);
  await quickLog(page, "Blood pressure");
  await page.getByLabel("Systolic", { exact: true }).fill("120");
  await page.getByLabel("Diastolic", { exact: true }).fill("80");
  await page.getByLabel("Pulse (bpm, optional)", { exact: true }).fill("65");
  await page.getByRole("button", { name: /Save/ }).click();
  await expect(page.getByText(/Saved/).filter({ visible: true })).toBeVisible();
  expect(backend.tables.vital_samples).toHaveLength(4);
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page.getByRole("tab", { name: "Blood pressure", exact: true }).click();
  await expect(
    page.getByText("120/80 mmHg", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("Pulse 65 bpm", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit reading", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Pulse (bpm, optional)", exact: true })
    .fill("70");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Pulse 70 bpm", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Delete reading", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByText("No blood-pressure readings", { exact: true }),
  ).toBeVisible();
  expect(
    backend.tables.vital_samples.filter((row) => !row.deleted_at),
  ).toHaveLength(1);
});

test("meal label, draft restoration, amount editing, save and deletion", async ({
  page,
  backend,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await quickLog(page, "Food");
  await expect(
    page.getByRole("button", { name: "Save meal", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Choose a meal to get started", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add food", exact: true }),
  ).toBeEnabled();
  const addFoodBox = await page
    .getByRole("button", { name: "Add food", exact: true })
    .boundingBox();
  const breakfastBox = await page
    .getByRole("button", { name: "breakfast", exact: true })
    .boundingBox();
  expect(breakfastBox!.y).toBeLessThan(addFoodBox!.y);
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await page
    .getByRole("button", { name: "Create food label", exact: true })
    .click();
  await page.getByLabel("Food name", { exact: true }).fill("Review oats");
  await page.getByLabel("Weight per serving", { exact: true }).fill("40");
  await page.getByLabel("Calories", { exact: true }).fill("150");
  await page.getByLabel("Protein (g)", { exact: true }).fill("5");
  await page
    .getByRole("button", { name: "Continue to amount", exact: true })
    .click();
  await page.getByRole("button", { name: "Add to meal", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add to meal", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Review oats", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add food", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Save meal", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(
    page.getByText("Choose a meal first.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "breakfast", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("food-draft.png") });
  await expect(
    page.getByRole("button", { name: "Edit amount", exact: true }),
  ).toBeVisible();
  await expect.poll(() => backend.tables.user_food_profiles?.length).toBe(1);
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await quickLog(page, "Food");
  await page.getByRole("button", { name: "Edit amount", exact: true }).click();
  await page.getByLabel("Food amount", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Save amount", exact: true }).click();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  expect(backend.tables.nutrition_entries).toHaveLength(1);
  await page
    .getByRole("button", { name: "View food history", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Food", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "Edit Review oats", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Review oats", exact: true })
    .click();
  await page.getByLabel("Amount consumed", { exact: true }).fill("1.5");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(() => backend.tables.nutrition_entries[0].calories)
    .toBe(225);
  await expect(
    page.getByRole("tab", { name: "Food", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Delete Review oats", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No food or water saved yet")).toBeVisible();
  expect(backend.tables.nutrition_entries).toHaveLength(0);
  expect(backend.tables.user_food_profiles).toHaveLength(1);
});

test("lifting and cardio saves, history and delete", async ({
  page,
  backend,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await quickLog(page, "Workout");
  await page.getByRole("button", { name: "Chest", exact: true }).click();
  await page.getByRole("button", { name: /Add exercise/ }).click();
  await page
    .getByLabel("Exercise name", { exact: true })
    .fill("Review push-up");
  await page.getByLabel("Number of sets", { exact: true }).fill("1");
  await page.getByLabel("Set 1 reps", { exact: true }).fill("12");
  await page.getByLabel("Working weight in pounds", { exact: true }).fill("0");
  await expect(
    page.getByRole("button", { name: "Add exercise", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("lifting-draft.png") });
  backend.failNextWrite = "workout_sets";
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(
    page.getByText("Test connection unavailable. Try again."),
  ).toBeVisible();
  expect(backend.tables.workout_sessions).toHaveLength(0);
  await expect(page.getByLabel("Exercise name", { exact: true })).toHaveValue(
    "Review push-up",
  );
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page.getByText(/Workout saved/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View workout history", exact: true }),
  ).toBeVisible();
  expect(backend.tables.workout_sessions).toHaveLength(1);
  expect(backend.tables.workout_sets).toHaveLength(1);
  await page.getByRole("tab", { name: "Cardio", exact: true }).click();
  await page.getByRole("button", { name: "walk", exact: true }).click();
  await page.getByLabel("Minutes", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Save cardio", exact: true }).click();
  await expect(page.getByText("Cardio activity saved.")).toBeVisible();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(
    page.getByText("Review push-up", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit workout", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Gym location", exact: true })
    .fill("Review home gym");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page
      .getByText("Review home gym", { exact: false })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete cardio", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .poll(() => Boolean(backend.tables.cardio_entries[0].deleted_at))
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Delete cardio", exact: true }),
  ).toHaveCount(0);
});

test("exercise cards follow the pointer and preserve reordered workout data", async ({
  page,
  backend,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 1000 });
  await signIn(page);
  await quickLog(page, "Workout");
  await page.getByRole("button", { name: "Chest", exact: true }).click();
  for (const [index, name] of [
    "First lift",
    "Second lift",
    "Third lift",
  ].entries()) {
    await page
      .getByRole("button", { name: "Add exercise", exact: true })
      .click();
    const card = page.getByTestId(/^exercise-card-/).nth(index);
    await card.getByLabel("Exercise name", { exact: true }).fill(name);
    await card
      .getByLabel("Number of sets", { exact: true })
      .fill(String(index + 1));
    for (let set = 1; set <= index + 1; set++) {
      await card
        .getByLabel(`Set ${set} reps`, { exact: true })
        .fill(String(8 + index));
    }
    await card
      .getByLabel("Working weight in pounds", { exact: true })
      .fill(String(20 + index * 10));
  }
  await expect(
    page.getByText(/Select a saved exercise or finish typing/),
  ).toHaveCount(0);
  const firstId = await page
    .getByTestId(/^exercise-card-/)
    .first()
    .getAttribute("data-testid");
  const dragged = page.getByTestId(firstId!);
  await dragged.scrollIntoViewIfNeeded();
  const handle = dragged.getByLabel("Reorder exercise 1", { exact: true });
  const handleBox = (await handle.boundingBox())!;
  const before = (await dragged.boundingBox())!;
  const secondBefore = (await page
    .getByTestId(/^exercise-card-/)
    .nth(1)
    .boundingBox())!;
  const x = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(dragged).toHaveCSS("border-top-color", "rgb(0, 122, 255)");
  await page.mouse.move(x, y + 24, { steps: 6 });
  await expect
    .poll(async () => (await dragged.boundingBox())!.y - before.y)
    .toBeGreaterThan(14);
  expect((await dragged.boundingBox())!.y - before.y).toBeLessThan(38);
  await page.screenshot({ path: testInfo.outputPath("exercise-mid-drag.png") });
  await page.mouse.move(x, y + secondBefore.height * 0.8, { steps: 20 });
  await page.mouse.up();
  const names = () =>
    page
      .getByLabel("Exercise name", { exact: true })
      .filter({ visible: true })
      .evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      );
  await expect.poll(names).toEqual(["Second lift", "First lift", "Third lift"]);
  await page.getByLabel("Reorder exercise 2", { exact: true }).press("ArrowUp");
  await expect.poll(names).toEqual(["First lift", "Second lift", "Third lift"]);
  await page
    .getByLabel("Reorder exercise 1", { exact: true })
    .press("ArrowDown");
  await expect.poll(names).toEqual(["Second lift", "First lift", "Third lift"]);

  // A phone-height viewport must scroll while the held card approaches its edge.
  await page.setViewportSize({ width: 390, height: 844 });
  const edgeCard = page.getByTestId(/^exercise-card-/).first();
  const edgeHandle = edgeCard.getByLabel("Reorder exercise 1", { exact: true });
  await edgeHandle.scrollIntoViewIfNeeded();
  const edgeBox = (await edgeHandle.boundingBox())!;
  const scrollView = page.getByTestId("workout-exercise-list");
  const scrollBefore = await scrollView.evaluate(
    (element) => element.scrollTop,
  );
  await page.mouse.move(
    edgeBox.x + edgeBox.width / 2,
    edgeBox.y + edgeBox.height / 2,
  );
  await page.mouse.down();
  await expect(edgeCard).toHaveCSS("border-top-color", "rgb(0, 122, 255)");
  await page.mouse.move(edgeBox.x + edgeBox.width / 2, 758, { steps: 25 });
  await expect
    .poll(() => scrollView.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(scrollBefore + 150);
  await page.mouse.up();
  await expect.poll(names).toEqual(["First lift", "Third lift", "Second lift"]);
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await quickLog(page, "Workout");
  await expect.poll(names).toEqual(["First lift", "Third lift", "Second lift"]);
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page.getByText(/Workout saved/)).toBeVisible();
  expect(
    backend.tables.workout_sets.map((row) => [
      row.exercise_name,
      row.exercise_order,
      row.reps,
      row.weight,
    ]),
  ).toEqual([
    ["First lift", 1, 8, 20],
    ["Third lift", 2, 10, 40],
    ["Third lift", 2, 10, 40],
    ["Third lift", 2, 10, 40],
    ["Second lift", 3, 9, 30],
    ["Second lift", 3, 9, 30],
  ]);
});

test("profile name persistence and browser reminder guidance", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Name saved", exact: true }),
  ).toBeDisabled();
  await page.getByPlaceholder("First name", { exact: true }).fill("Updated");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Name saved", exact: true }),
  ).toBeDisabled();
  expect(backend.tables.profiles[0].first_name).toBe("Updated");
  await page
    .getByRole("textbox", { name: "Calories / day", exact: true })
    .fill("2300");
  await page.getByRole("button", { name: "Save goals", exact: true }).click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_calorie_goal)
    .toBe(2300);
  await expect(
    page.getByText("Export your data", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export records", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^HealthApp-data-\d{4}-\d{2}-\d{2}\.zip$/,
  );
  await expect(
    page.getByText("Export finished.", { exact: true }),
  ).toBeVisible();
  await quickLog(page, "Reminders");
  await expect(page.getByText("Set reminders on your iPhone")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save reminder" })).toHaveCount(
    0,
  );
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
});

test("populated Summary, calendar and chart ranges link to matching history", async ({
  page,
  backend,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  backend.tables.vital_samples = Array.from({ length: 5 }, (_, index) => {
    const occurredAt = new Date(Date.now() - index * 86400000).toISOString();
    return {
      id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
      user_id: "11111111-1111-4111-8111-111111111111",
      kind: "weight",
      value: 180 + index,
      unit: "lb",
      source: "manual",
      occurred_at: occurredAt,
      created_at: occurredAt,
      deleted_at: null,
    };
  });
  await signIn(page);
  await expect(page.getByText("180 lb", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("populated-summary.png") });
  await page.getByRole("button", { name: "Create a new health log" }).click();
  await page.screenshot({ path: testInfo.outputPath("quick-log.png") });
  await page.getByRole("button", { name: "Close create menu" }).click();
  await expect(
    page.getByRole("button", { name: "Show next month" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Show previous month" }).click();
  await expect(
    page.getByRole("button", { name: "Show next month" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Show next month" }).click();
  await page.getByRole("tab", { name: "M", exact: true }).click();
  await expect(
    page.getByText("Monthly average", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("weight-trend.png") });
  const point = page.getByRole("button", { name: /^Weight: / }).first();
  await point.press("Enter");
  await expect(
    page.getByText(/AVG/).filter({ visible: true }).first(),
  ).toBeVisible();
  await point.press("Enter");
  await page.getByRole("button", { name: /^Calories:/ }).click();
  await expect(
    page.getByRole("tab", { name: "Food", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(consoleErrors).toEqual([]);
});

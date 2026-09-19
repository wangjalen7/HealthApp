import { expect, signIn, test } from "./fixture";
const user = "11111111-1111-4111-8111-111111111111",
  key = `healthapp:summary-layout:${user}`;

test("editor previews the original live widgets at the same dimensions as Summary", async ({
  page,
  backend,
}, info) => {
  backend.tables.nutrition_entries = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      user_id: user,
      food_name: "Lunch",
      calories: 640,
      protein_grams: 32,
      occurred_at: new Date().toISOString(),
      quantity: 1,
      quantity_unit: "serving",
      serving_count: 1,
      entry_method: "basic",
    },
  ];
  await signIn(page);
  await expect(
    page.getByRole("button", {
      name: "Calories: 640 of 2200 cal",
      exact: true,
    }),
  ).toBeVisible();
  const types = [
    "weight",
    "bp",
    "calories",
    "protein",
    "fluids",
    "calendar",
    "weight_trend",
    "bp_trend",
  ];
  await expect(page.getByTestId(/^summary-widget-/)).toHaveCount(8);
  const before = await Promise.all(
    types.map((type) =>
      page.getByTestId(`summary-widget-default-${type}`).evaluate((e) => ({
        width: e.getBoundingClientRect().width,
        height: e.getBoundingClientRect().height,
        text: e.textContent,
      })),
    ),
  );
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await expect(page.getByTestId(/^editor-widget-/)).toHaveCount(8);
  await expect(
    page.getByRole("button", { name: /Move .* (up|down)/ }),
  ).toHaveCount(0);
  for (const [index, type] of types.entries()) {
    const card = page.getByTestId(`editor-widget-default-${type}`);
    await expect
      .poll(() =>
        card.evaluate((e) => ({
          width: e.getBoundingClientRect().width,
          height: e.getBoundingClientRect().height,
          text: e.textContent,
        })),
      )
      .toEqual(before[index]);
  }
  await page.getByRole("button", { name: "Customize Weight", exact: true }).hover();
  await page.screenshot({ path: info.outputPath("live-summary-editor.png") });
  await page
    .getByRole("button", { name: "Customize Weight", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Weight Small", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Weight Large", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to layout", exact: true })
    .click();
  const large = (await page
    .getByTestId("editor-widget-default-weight")
    .boundingBox())!;
  expect(large.width).toBeGreaterThan(before[0].width * 1.9);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const saved = (await page
    .getByTestId("summary-widget-default-weight")
    .boundingBox())!;
  expect(saved.width).toBe(large.width);
  expect(saved.height).toBe(large.height);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Customize Weight", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Customize Weight", exact: true }).hover();
  await page.screenshot({
    path: info.outputPath("live-summary-editor-320.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("whole-widget dragging moves across large cards and keeps the saved order", async ({
  page,
  backend,
}) => {
  void backend;
  await signIn(page);
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  const drag = async (source: string, destination: string) => {
    const a = page.getByRole("button", {
      name: `Customize ${source}`,
      exact: true,
    });
    await a.hover();
    const from = (await a.boundingBox())!;
    const to = (await page
      .getByRole("button", { name: `Customize ${destination}`, exact: true })
      .boundingBox())!;
    // Start in the widget body, away from its heading or any dedicated handle.
    await page.mouse.move(
      from.x + from.width * 0.75,
      from.y + from.height * 0.65,
    );
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 15,
    });
    await expect(page.getByTestId("summary-drag-status")).toContainText(
      `Moving ${source}`,
    );
    await page.mouse.up();
    await expect(page.getByTestId("summary-drag-status")).toHaveCount(0);
  };
  await drag("Weight", "Fluids");
  await drag("Fluids", "Blood pressure");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(saved.widgets.map((w: { type: string }) => w.type)).toEqual([
    "fluids",
    "bp",
    "calories",
    "protein",
    "weight",
    "calendar",
    "weight_trend",
    "bp_trend",
  ]);
});
test("touch swipes scroll normally and a held widget can be dragged vertically", async ({
  page,
  backend,
}) => {
  void backend;
  await signIn(page);
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const scroll = page.getByTestId("summary-editor-scroll");
  const card = (await page
    .getByRole("button", { name: "Customize Calories", exact: true })
    .boundingBox())!;
  const x = card.x + card.width / 2,
    y = card.y + card.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let step = 1; step <= 8; step++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - step * 12 }],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => scroll.evaluate((e) => e.scrollTop))
    .toBeGreaterThan(30);
  await expect(page.getByTestId("summary-drag-status")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  // Wait for the modal's slide transition before recording touch coordinates.
  await page
    .getByRole("button", { name: "Customize Weight", exact: true })
    .hover();
  const from = (await page
    .getByRole("button", { name: "Customize Weight", exact: true })
    .boundingBox())!;
  const to = (await page
    .getByRole("button", { name: "Customize Calories", exact: true })
    .boundingBox())!;
  const startX = from.x + from.width / 2,
    startY = from.y + from.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y: startY }],
  });
  await page.waitForTimeout(400);
  await expect(page.getByTestId("summary-drag-status")).toBeVisible();
  for (let step = 1; step <= 10; step++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: startX,
          y: startY + ((to.y + to.height / 2 - startY) * step) / 10,
        },
      ],
    });
  }
  await expect(page.getByTestId("summary-drag-status")).toContainText(
    "position 3",
  );
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await client.detach();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(saved.widgets[2].type).toBe("weight");
});

test("Summary edit supports add, move, resize, cancel, restart and empty layouts", async ({
  page,
  backend,
}) => {
  void backend;
  await signIn(page);
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page
    .getByRole("button", { name: "Customize Calories", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove Calories", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Calories widget", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page
    .getByRole("button", { name: "Customize Weight", exact: true })
    .click();
  await page.getByRole("radio", { name: "Weight Large", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to layout", exact: true })
    .click();
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Calories — Added", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Add Recent Personal Record", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(saved.widgets[0]).toMatchObject({ type: "weight", size: "wide" });
  expect(saved.widgets.at(-1).type).toBe("pr");
  await page.reload();
  await signIn(page);
  await expect(
    page.getByRole("button", {
      name: "Edit Recent Personal Record widget",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  for (const widget of saved.widgets) {
    const labels: Record<string, string> = {
      weight: "Weight",
      bp: "Blood pressure",
      calories: "Calories",
      protein: "Protein",
      fluids: "Fluids",
      training: "Training Summary",
      streaks: "Streaks",
      actions: "Quick Actions",
      calendar: "Calorie Calendar",
      weight_trend: "Weight Trend",
      bp_trend: "Blood Pressure Trend",
      pr: "Recent Personal Record",
    };
    await page
      .getByRole("button", {
        name: `Customize ${labels[widget.type]}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: `Remove ${labels[widget.type]}`,
        exact: true,
      })
      .click();
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Add widgets", exact: true }),
  ).toBeVisible();
});
test("Summary restores defaults without touching logs and recovers malformed storage", async ({
  page,
  backend,
}, info) => {
  void backend;
  await signIn(page);
  await page.evaluate((key) => localStorage.setItem(key, "broken"), key);
  await page.reload();
  await signIn(page);
  await expect(
    page.getByText(
      "Layout could not be read. Defaults are shown; save to replace it.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore default layout", exact: true })
    .click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(
    page.getByRole("button", { name: "Edit Weight widget", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("summary-320.png"),
    fullPage: true,
  });
  expect(backend.tables.workout_sessions ?? []).toHaveLength(0);
  expect(backend.tables.nutrition_entries ?? []).toHaveLength(0);
});
test("training and PR widgets use complete paginated sets and navigate to the source workout", async ({
  page,
  backend,
}) => {
  const today = new Date();
  today.setHours(8, 0, 0, 0);
  const before = new Date(today);
  before.setDate(before.getDate() - 1);
  backend.tables.workout_sessions = [
    {
      id: "aaaa0000-0000-4000-8000-000000000001",
      user_id: user,
      title: "Earlier",
      completed_at: before.toISOString(),
    },
    {
      id: "aaaa0000-0000-4000-8000-000000000002",
      user_id: user,
      title: "Latest",
      completed_at: today.toISOString(),
    },
  ];
  backend.tables.workout_sets = Array.from({ length: 502 }, (_, i) => ({
    id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000001`,
    user_id: user,
    session_id: backend.tables.workout_sessions[i === 501 ? 1 : 0].id,
    exercise_name: i === 0 || i === 501 ? "Bench press" : `Exercise ${i}`,
    muscle_group: "Chest",
    weight: i === 501 ? 120 : 100,
    weight_unit: "lb",
    reps: 8,
    set_number: 1,
    side_mode: "bilateral",
  }));
  await signIn(page);
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Recent Personal Record", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("120 lb", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Open record workout", exact: true })
    .click();
  await expect(page).toHaveURL(/history\/aaaa0000-0000-4000-8000-000000000002/);
});
test("food-day totals support explicit confirmation and undo", async ({
  page,
  backend,
}) => {
  backend.tables.nutrition_entries = [
    {
      id: "aaaa0000-0000-4000-8000-000000000001",
      user_id: user,
      food_name: "Breakfast",
      calories: 500,
      protein_grams: 30,
      occurred_at: new Date().toISOString(),
      quantity: 1,
      quantity_unit: "serving",
      serving_count: 1,
      entry_method: "basic",
    },
  ];
  await signIn(page);
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page.getByRole("tab", { name: "Food", exact: true }).click();
  await page.getByRole("button", { name: /View full totals for/ }).click();
  await page
    .getByRole("button", { name: "Confirm food day complete", exact: true })
    .click();
  await expect(
    page.getByText("Food day confirmed complete", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.food_day_completions).toHaveLength(1);
  await page
    .getByRole("button", { name: "Undo food-day completion", exact: true })
    .click();
  expect(backend.tables.food_day_completions).toHaveLength(0);
});
test("whole-widget dragging reorders adjacent small cards and editing releases chart controls", async ({
  page,
  backend,
}) => {
  void backend;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  const first = page.getByRole("button", {
      name: "Customize Weight",
      exact: true,
    }),
    second = page.getByRole("button", {
      name: "Customize Blood pressure",
      exact: true,
    });
  await first.hover();
  const a = (await first.boundingBox())!,
    b = (await second.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await expect(page.getByTestId("summary-drag-status")).toContainText(
    "position 2",
  );
  await page.mouse.up();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(saved.widgets[0].type).toBe("bp");
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("tab", { name: "M", exact: true }).first().click();
  await expect(
    page.getByRole("tab", { name: "M", exact: true }).first(),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tab", { name: "W", exact: true }).last(),
  ).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});
test("held widget edge-scrolls and dismissing the editor cancels the scroll lock", async ({
  page,
  backend,
}, info) => {
  void backend;
  await signIn(page);
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  const handle = page.getByRole("button", {
      name: "Customize Weight",
      exact: true,
    }),
    other = page.getByRole("button", {
      name: "Customize Calories",
      exact: true,
    });
  await handle.hover();
  const first = (await handle.boundingBox())!,
    before = (await other.boundingBox())!;
  const footer = (await page
    .getByRole("button", { name: "Add widget", exact: true })
    .boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.move(180, footer.y - 35, { steps: 15 });
  await expect(page.getByTestId("summary-drag-status")).toBeVisible();
  await expect
    .poll(async () => (await other.boundingBox())!.y)
    .toBeLessThan(before.y - 25);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Edit Summary", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page.screenshot({ path: info.outputPath("summary-editor.png") });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

import { test, expect, signIn, quickLog } from "./fixture";
import type { Page } from "@playwright/test";
const user = "11111111-1111-4111-8111-111111111111";
const routineKey = `healthapp:routines:v1:${user}`;
const intentKey = "healthapp:notification-intent:v2";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
async function reminders(page: Page) {
  await quickLog(page, "Reminders");
  await expect(
    page.getByRole("switch", { name: "Meals reminders", exact: true }),
  ).toBeVisible();
}
async function read(page: Page, key = routineKey) {
  return page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? "null"),
    key,
  );
}
async function seedIntent(
  page: Page,
  category: string,
  slot = category,
  owner = user,
) {
  await page.addInitScript(
    ({ intentKey, category, slot, owner }) => {
      if (!localStorage.getItem(intentKey))
        localStorage.setItem(
          intentKey,
          JSON.stringify({
            seen: [],
            pending: {
              key: "synthetic-tap",
              payload: {
                v: 2,
                userId: owner,
                source: "routine",
                category,
                slot,
                occurrenceDay: "2020-01-01",
              },
              expiresAt: Date.now() + 30 * 60 * 1000,
            },
          }),
        );
    },
    { intentKey, category, slot, owner },
  );
}
async function login(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill("review@example.com");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await button(page, "Sign in").click();
}

async function fullScreen(page: Page) {
  const box = await page.getByTestId("settings-sheet").boundingBox();
  expect(box?.y).toBe(0);
  expect(box?.height).toBe(page.viewportSize()?.height);
  expect(box?.width).toBe(page.viewportSize()?.width);
}
test("independent reminders preserve slots and weekdays without a master switch", async ({
  page,
  backend,
}, info) => {
  void backend;
  await signIn(page);
  await reminders(page);
  for (const name of [
    "Meals",
    "Fluids",
    "Blood Pressure",
    "Weight",
    "Workout",
  ]) {
    await page
      .getByRole("button", {
        name: new RegExp("^Edit " + name + " reminders,"),
      })
      .click();
    await fullScreen(page);
    await button(page, "Cancel").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  for (const text of [
    "Enable Routine Reminders",
    "Routine Reminders",
    "Routine reminders are scheduled.",
    "Quiet hours",
    "Retry scheduling",
    "Settings and schedules stay on this device.",
  ])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  await page
    .getByRole("switch", { name: "Meals reminders", exact: true })
    .check();
  await page.getByRole("button", { name: /^Edit Meals reminders,/ }).click();
  await fullScreen(page);
  await page
    .getByRole("switch", { name: "Breakfast reminder", exact: true })
    .uncheck();
  await expect(page.getByText("Routine notifications per day")).toHaveCount(0);
  const row = page.getByRole("switch", { name: "Lunch reminder", exact: true });
  const aligned = await row.evaluate((el) => {
    const card = el.parentElement!.getBoundingClientRect();
    const toggle = el.getBoundingClientRect();
    return Math.abs(card.y + card.height / 2 - toggle.y - toggle.height / 2);
  });
  expect(aligned).toBeLessThan(2);
  await button(page, "Save reminder settings").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Edit Workout reminders,/ }).click();
  await fullScreen(page);
  await page
    .getByRole("switch", { name: "Enable Workout", exact: true })
    .check();
  await page.getByRole("checkbox", { name: "Tue", exact: true }).check();
  await button(page, "Save reminder settings").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await read(page);
  expect(saved.version).toBe(2);
  expect(saved.categories.meals.slots[0].enabled).toBe(false);
  expect(saved.categories.workout.days).toEqual([2]);
  expect(saved.categories.weight.enabled).toBe(false);
  await page
    .getByRole("switch", { name: "Meals reminders", exact: true })
    .uncheck();
  await expect
    .poll(async () => (await read(page)).categories.meals.enabled)
    .toBe(false);
  expect((await read(page)).categories.workout.enabled).toBe(true);
  await page
    .getByRole("switch", { name: "Meals reminders", exact: true })
    .check();
  await expect
    .poll(async () => (await read(page)).categories.meals.enabled)
    .toBe(true);
  expect((await read(page)).categories.meals.slots).toEqual(
    saved.categories.meals.slots,
  );
  await page.screenshot({ path: info.outputPath("independent-reminders.png") });
});
test("night times are allowed and fluid slots can be added and removed", async ({
  page,
  backend,
}) => {
  void backend;
  await signIn(page);
  await reminders(page);
  await page.getByRole("button", { name: /^Edit Fluids reminders,/ }).click();
  await fullScreen(page);
  await page
    .getByRole("switch", { name: "Enable Fluids", exact: true })
    .check();
  await page.getByLabel("Drink 1 time", { exact: true }).fill("23:30");
  await button(page, "Add drink time").click();
  await expect(page.getByLabel("Drink 5 time", { exact: true })).toHaveValue(
    "12:00",
  );
  await button(page, "Remove drink time 5").click();
  await button(page, "Save reminder settings").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await read(page)).categories.fluids.slots[0].time).toBe("23:30");
  expect((await read(page)).quiet).toBeUndefined();
});
test("medication and supplements keep separate multi-time and interval schedules; custom starts with a name", async ({
  page,
  backend,
}, info) => {
  void backend;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await reminders(page);
  await page
    .getByRole("button", { name: /^Edit Medication \/ Supplements reminders,/ })
    .click();
  await fullScreen(page);
  await button(page, "Add Medication / Supplement").click();
  await fullScreen(page);
  await page
    .getByLabel("Reminder name", { exact: true })
    .fill("Synthetic medication");
  await page.getByRole("radio", { name: "Selected days", exact: true }).click();
  await button(page, "Add another time").click();
  await page.getByLabel("Additional time 1", { exact: true }).fill("20:00");
  await button(page, "Save reminder").click();
  await expect(button(page, "Add Medication / Supplement")).toBeVisible();
  await button(page, "Add Medication / Supplement").click();
  await page.getByRole("radio", { name: "Supplement", exact: true }).click();
  await page
    .getByLabel("Reminder name", { exact: true })
    .fill("Synthetic supplement");
  await page
    .getByRole("radio", { name: "Every few days", exact: true })
    .click();
  await page.getByLabel("Repeat every (days)", { exact: true }).fill("0");
  await button(page, "Save reminder").click();
  await expect(page.getByRole("alert")).toContainText("2 to 365");
  await page.getByLabel("Repeat every (days)", { exact: true }).fill("3");
  await page.getByLabel("Reminder date", { exact: true }).fill("2026-09-24");
  await button(page, "Add another time").click();
  await page.getByLabel("Additional time 1", { exact: true }).fill("21:00");
  await button(page, "Save reminder").click();
  await expect(button(page, "Add Medication / Supplement")).toBeVisible();
  const saved = await read(page, `healthapp:reminders:${user}`);
  expect(saved).toHaveLength(2);
  expect(saved[0]).toMatchObject({
    kind: "medication",
    repeat: "weekdays",
    additionalTimes: ["20:00"],
  });
  expect(saved[1]).toMatchObject({
    kind: "supplement",
    repeat: "interval",
    intervalDays: 3,
    startDate: "2026-09-24",
    additionalTimes: ["21:00"],
  });
  await page
    .getByRole("switch", { name: "Synthetic supplement enabled", exact: true })
    .uncheck();
  await expect
    .poll(
      async () => (await read(page, `healthapp:reminders:${user}`))[1].enabled,
    )
    .toBe(false);
  await page.screenshot({ path: info.outputPath("medication-schedules.png") });
  await button(page, "Dismiss Medication / Supplements").click();
  const group = page.getByRole("switch", {
    name: "Medication / Supplements reminders",
    exact: true,
  });
  await group.uncheck();
  await expect
    .poll(async () => (await read(page)).medicationEnabled)
    .toBe(false);
  expect(
    (await read(page, `healthapp:reminders:${user}`)).map(
      (r: { enabled: boolean }) => r.enabled,
    ),
  ).toEqual([true, false]);
  await group.check();
  await expect
    .poll(async () => (await read(page)).medicationEnabled)
    .toBe(true);
  expect(
    (await read(page, `healthapp:reminders:${user}`)).map(
      (r: { enabled: boolean }) => r.enabled,
    ),
  ).toEqual([true, false]);

  await button(page, "Add Custom Reminder").click();
  await fullScreen(page);
  await expect(page.getByLabel("Reminder name", { exact: true })).toHaveValue(
    "",
  );
  for (const name of [
    "Medication",
    "Supplement",
    "Blood pressure",
    "Weight",
    "Other",
  ])
    await expect(
      page.getByRole("dialog").getByRole("radio", { name, exact: true }),
    ).toHaveCount(0);
  await page.getByLabel("Reminder name", { exact: true }).fill("Stretch");
  await button(page, "Save reminder").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await signIn(page);
  await reminders(page);
  await expect(page.getByText("Stretch", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /^Edit Medication \/ Supplements reminders,/ })
    .click();
  await button(page, "Edit Synthetic supplement reminder").click();
  await expect(
    page.getByLabel("Repeat every (days)", { exact: true }),
  ).toHaveValue("3");
  await expect(
    page.getByLabel("Additional time 1", { exact: true }),
  ).toHaveValue("21:00");
});

test("existing custom BP history survives a replacement that cannot yet schedule", async ({
  page,
  backend,
}) => {
  void backend;
  await signIn(page);
  const custom = {
    id: "bp-custom",
    userId: user,
    kind: "blood_pressure",
    name: "Home BP",
    time: "08:00",
    additionalTimes: [],
    repeat: "daily",
    startDate: "2026-01-01",
    weekdays: [],
    enabled: true,
    notificationIds: [],
    createdAt: "2026-01-01T12:00:00Z",
    updatedAt: "2026-01-01T12:00:00Z",
  };
  const history = [
    {
      reminderId: custom.id,
      localDay: "2026-09-21",
      completedAt: "2026-09-21T12:00:00Z",
    },
  ];
  await page.evaluate(
    ({ custom, history, user }) => {
      localStorage.setItem(
        `healthapp:reminders:${user}`,
        JSON.stringify([custom]),
      );
      localStorage.setItem(
        `healthapp:reminder-completions:${user}`,
        JSON.stringify(history),
      );
    },
    { custom, history, user },
  );
  await reminders(page);
  await expect(page.getByText("Home BP", { exact: true })).toBeVisible();
  await page
    .getByRole("switch", { name: "Blood Pressure reminders", exact: true })
    .click();
  await expect(button(page, "Keep the custom reminder")).toBeVisible();
  await button(page, "Replace it with the routine").click();
  expect((await read(page, `healthapp:reminders:${user}`))[0].enabled).toBe(
    true,
  );
  expect(await read(page, `healthapp:reminder-completions:${user}`)).toEqual(
    history,
  );
  expect((await read(page)).replacements).toEqual([custom.id]);
});

test("a pending meal tap survives failed login, opens today's logger once and creates no meal", async ({
  page,
  backend,
}) => {
  backend.emailConfirmed = false;
  await seedIntent(page, "meals", "breakfast");
  await login(page);
  await expect(page.getByText(/Email not confirmed/)).toBeVisible();
  expect((await read(page, intentKey)).pending).toBeDefined();
  backend.emailConfirmed = true;
  await button(page, "Sign in").click();
  await expect(
    page.getByRole("radio", { name: "breakfast", exact: true }),
  ).toBeChecked();
  await expect
    .poll(async () => (await read(page, intentKey)).pending)
    .toBeUndefined();
  expect(backend.tables.nutrition_entries ?? []).toHaveLength(0);
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await expect(page.getByLabel("Entry date", { exact: true })).toHaveValue(
    today,
  );
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await expect(page.getByText("Hi Review,", { exact: true })).toBeVisible();
});

test("meal tap preserves an existing draft and wrong-account or cancelled intents do not navigate", async ({
  page,
  backend,
}) => {
  void backend;
  await seedIntent(page, "meals", "breakfast");
  await page.addInitScript(
    ({ user }) =>
      localStorage.setItem(
        `healthapp:nutrition-draft:${user}`,
        JSON.stringify({
          mealType: "dinner",
          entryDay: "2026-09-21",
          entries: [],
        }),
      ),
    { user },
  );
  await login(page);
  await expect(
    page.getByRole("radio", { name: "dinner", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Entry date", { exact: true })).toHaveValue(
    "2026-09-21",
  );
});

test("Rest Today only stores the local-day preference and creates no workout or completion", async ({
  page,
  backend,
}) => {
  await seedIntent(page, "workout");
  await login(page);
  await button(page, "Rest Today").click();
  await expect(page.getByText(/No workout was recorded/)).toBeVisible();
  expect((await read(page)).restDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(backend.tables.workout_sessions ?? []).toHaveLength(0);
  expect(backend.tables.cardio_entries ?? []).toHaveLength(0);
  expect(await read(page, `healthapp:reminder-completions:${user}`)).toBeNull();
});

test("notification intent cancellation and incompatible account sign-in clear the pending destination", async ({
  page,
  backend,
}) => {
  void backend;
  await seedIntent(page, "weight", "weight", "different-account");
  await page.goto("/sign-in");
  await expect(button(page, "Cancel reminder navigation")).toBeVisible();
  await button(page, "Cancel reminder navigation").click();
  expect((await read(page, intentKey)).pending).toBeUndefined();
  await page.evaluate(
    ({ intentKey }) =>
      localStorage.setItem(
        intentKey,
        JSON.stringify({
          seen: [],
          pending: {
            key: "different-tap",
            payload: {
              v: 2,
              userId: "different-account",
              source: "routine",
              category: "weight",
              slot: "weight",
            },
            expiresAt: Date.now() + 300000,
          },
        }),
      ),
    { intentKey },
  );
  await login(page);
  await expect(page.getByText("Hi Review,", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await read(page, intentKey)).pending)
    .toBeUndefined();
});

test("dark compact reminder settings wrap larger text and keep sheet actions reachable", async ({
  page,
  backend,
}, info) => {
  void backend;
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addInitScript(() =>
    localStorage.setItem("healthapp:appearance", "dark"),
  );
  await signIn(page);
  await reminders(page);
  await page.screenshot({ path: info.outputPath("reminders-dark-390.png") });
  await page.setViewportSize({ width: 320, height: 568 });
  await page
    .getByRole("button", { name: /^Edit Blood Pressure reminders,/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.evaluate((el) => {
    for (const leaf of el.querySelectorAll<HTMLElement>("div, span"))
      if (leaf.childElementCount === 0 && leaf.textContent?.trim()) {
        leaf.style.fontSize = "24px";
        leaf.style.lineHeight = "1.3";
      }
  });
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("reminders-editor-large-text-320.png"),
  });
  await button(page, "Save reminder settings").click();
  await expect(dialog).toHaveCount(0);
});

test("custom deletion opens a popup, cancel retains edits, and confirmation removes only that reminder", async ({
  page,
  backend,
}, info) => {
  void backend;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await reminders(page);
  const title = page.getByRole("heading", {
    name: "Custom Reminders",
    exact: true,
  });
  const add = button(page, "Add Custom Reminder");
  await add.scrollIntoViewIfNeeded();
  const titleBox = await title.boundingBox(),
    buttonBox = await add.boundingBox();
  expect(buttonBox!.y - titleBox!.y - titleBox!.height).toBeLessThan(18);
  const centers = await add.evaluate((el) => {
    const button = el.getBoundingClientRect(),
      surface = el.parentElement!.getBoundingClientRect(),
      text = el.firstElementChild!.getBoundingClientRect();
    return {
      x: Math.abs(button.x + button.width / 2 - text.x - text.width / 2),
      y: Math.abs(surface.y + surface.height / 2 - text.y - text.height / 2),
    };
  });
  expect(centers.x).toBeLessThan(1);
  expect(centers.y).toBeLessThan(1);
  await add.click();
  await page
    .getByLabel("Reminder name", { exact: true })
    .fill("Synthetic custom");
  await button(page, "Save reminder").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await button(page, "Edit Synthetic custom reminder").click();
  await page
    .getByLabel("Reminder name", { exact: true })
    .fill("Unsaved change");
  await button(page, "Delete reminder").click();
  const popup = page.getByTestId("reminder-delete-confirmation");
  await expect(popup).toBeVisible();
  expect((await popup.boundingBox())!.height).toBeLessThan(400);
  await page.screenshot({ path: info.outputPath("reminder-delete-popup.png") });
  await popup.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Reminder name", { exact: true })).toHaveValue(
    "Unsaved change",
  );
  await button(page, "Delete reminder").click();
  await popup
    .getByRole("button", { name: "Confirm delete reminder", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await read(page, `healthapp:reminders:${user}`)).toEqual([]);
});

test("medication add and edit keep the same modal open through save, cancel and delete", async ({
  page,
  backend,
}, info) => {
  void backend;
  await signIn(page);
  await reminders(page);
  await page
    .getByRole("button", { name: /^Edit Medication \/ Supplements reminders,/ })
    .click();
  const modal = page.getByRole("dialog");
  await modal.evaluate((el) => {
    el.setAttribute("data-persistent-reminder", "original");
  });
  await button(page, "Add Medication / Supplement").click();
  await expect(page.getByLabel("Reminder name", { exact: true })).toBeVisible();
  await expect(modal).toHaveAttribute("data-persistent-reminder", "original");
  await page
    .getByLabel("Reminder name", { exact: true })
    .fill("Synthetic medication");
  await button(page, "Save reminder").click();
  await expect(button(page, "Add Medication / Supplement")).toBeVisible();
  await expect(modal).toHaveAttribute("data-persistent-reminder", "original");
  await button(page, "Edit Synthetic medication reminder").click();
  await expect(page.getByLabel("Reminder name", { exact: true })).toHaveValue(
    "Synthetic medication",
  );
  await expect(modal).toHaveAttribute("data-persistent-reminder", "original");
  await button(page, "Delete reminder").click();
  const popup = page.getByTestId("reminder-delete-confirmation");
  await expect(popup).toBeVisible();
  await page.screenshot({
    path: info.outputPath("medication-delete-popup.png"),
  });
  await popup.getByRole("button", { name: "Cancel", exact: true }).click();
  await button(page, "Cancel").click();
  await expect(button(page, "Add Medication / Supplement")).toBeVisible();
  await expect(modal).toHaveAttribute("data-persistent-reminder", "original");
  await button(page, "Edit Synthetic medication reminder").click();
  await page
    .getByLabel("Reminder name", { exact: true })
    .fill("Unsaved medication edit");
  await page.keyboard.press("Escape");
  await expect(button(page, "Keep editing")).toBeVisible();
  await button(page, "Keep editing").click();
  await expect(page.getByLabel("Reminder name", { exact: true })).toHaveValue(
    "Unsaved medication edit",
  );
  await button(page, "Delete reminder").click();
  await popup
    .getByRole("button", { name: "Confirm delete reminder", exact: true })
    .click();
  await expect(button(page, "Add Medication / Supplement")).toBeVisible();
  await expect(modal).toHaveAttribute("data-persistent-reminder", "original");
  await button(page, "Dismiss Medication / Supplements").click();
  await expect(modal).toHaveCount(0);
});

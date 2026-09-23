import { expect, quickLog, signIn, test } from "./fixture";
const userId = "11111111-1111-4111-8111-111111111111";

test("a failed workout or food query does not hide cached readings and fluid history", async ({
  page,
  backend,
}) => {
  backend.tables.vital_samples = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      user_id: userId,
      kind: "weight",
      value: 170,
      unit: "lb",
      source: "manual",
      version: 1,
      change_seq: 1,
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ];
  backend.tables.hydration_entries = [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      user_id: userId,
      fluid_name: "Available fluid history",
      volume_ml: 240,
      occurred_at: new Date().toISOString(),
      category_id: "water",
      alcohol_status: "nonalcoholic",
      counting_policy: "beverage_volume_v1",
      version: 1,
    },
  ];
  backend.failReads = Object.fromEntries(
    ["workout_sessions", "nutrition_entries"].map((table) => [
      table,
      {
        code: "42703",
        message: `column ${table}.version does not exist`,
      },
    ]),
  );
  await signIn(page);
  await page.getByRole("tab", { name: "History", exact: true }).first().click();
  await expect(
    page.getByText(/Workouts: A required service update is pending/),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Weight", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit reading", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Fluids", exact: true }).click();
  await expect(
    page.getByText("Available fluid history", { exact: true }),
  ).toBeVisible();
});

test("lost fluid response survives restart and retry without a duplicate", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await quickLog(page, "Water");
  await page.getByRole("radio", { name: "Water", exact: true }).click();
  await page.getByLabel("Fluid amount", { exact: true }).fill("8");
  backend.loseNextResponse = "hydration_entries";
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect.poll(() => backend.tables.hydration_entries?.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "Save fluid", exact: true }),
  ).toBeEnabled();
  await signIn(page); // New app process, same durable device storage.
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page.getByRole("button", { name: /^Sync & Pending Changes,/ }).click();
  await page.getByRole("button", { name: "Refresh pending changes" }).click();
  await expect(
    page.getByText(/Unconfirmed hydration entries save/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check and retry this save" }).click();
  await expect(page.getByText(/Save confirmed\. Check History/)).toBeVisible();
  expect(backend.tables.hydration_entries).toHaveLength(1);
  await quickLog(page, "Water");
  await page.getByRole("radio", { name: "Water", exact: true }).click();
  await page.getByLabel("Fluid amount", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect.poll(() => backend.tables.hydration_entries.length).toBe(2);
});

test("independent goal edits merge and same-field conflicts retain the local form", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  const calories = page.getByRole("textbox", {
    name: "Calories / day",
    exact: true,
  });
  await page.getByRole("button", { name: /^Calories,/ }).click();
  await page
    .getByRole("button", { name: "Edit Manually", exact: true })
    .click();
  await expect(calories).toHaveValue("2200");
  backend.tables.profiles[0].daily_protein_goal = 180;
  await calories.fill("2300");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(page.getByText(/Goal saved\./)).toBeVisible();
  expect(backend.tables.profiles[0].daily_protein_goal).toBe(180);
  await page
    .getByRole("button", { name: "Edit Manually", exact: true })
    .click();
  backend.tables.profiles[0].daily_calorie_goal = 2500;
  await calories.fill("2400");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(
    page.getByText(/This record changed on another device/),
  ).toBeVisible();
  await expect(calories).toHaveValue("2400");
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2500);
});

test("fluid history loads beyond 500 records despite a smaller service cap", async ({
  page,
  backend,
}) => {
  backend.pageSize = 73;
  backend.tables.hydration_entries = Array.from({ length: 607 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    user_id: userId,
    fluid_name: i === 606 ? "Oldest complete-history marker" : `Water ${i}`,
    volume_ml: 100,
    occurred_at: new Date(Date.now() - i * 86400000).toISOString(),
    category_id: "water",
    alcohol_status: "nonalcoholic",
    counting_policy: "beverage_volume_v1",
    version: 1,
  }));
  await signIn(page);
  await page.getByRole("tab", { name: "History", exact: true }).first().click();
  await page.getByRole("tab", { name: "Fluids", exact: true }).click();
  await expect(
    page.getByText("Oldest complete-history marker", { exact: true }),
  ).toBeAttached();
  await expect(
    page.getByRole("button", { name: /^Delete .* entry$/ }),
  ).toHaveCount(607);
});

test("stale vital edit stays local until the deletion conflict is explicitly resolved", async ({
  page,
  backend,
}) => {
  backend.tables.vital_samples = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      user_id: userId,
      kind: "weight",
      value: 170,
      unit: "lb",
      source: "manual",
      version: 1,
      change_seq: 1,
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ];
  await signIn(page);
  await page.getByRole("tab", { name: "History", exact: true }).first().click();
  await page.getByRole("tab", { name: "Weight", exact: true }).click();
  await page.getByRole("button", { name: "Edit reading", exact: true }).click();
  await page.getByRole("textbox").first().fill("175");
  Object.assign(backend.tables.vital_samples[0], {
    version: 2,
    change_seq: 2,
    deleted_at: new Date().toISOString(),
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText(/Some readings changed on another device/),
  ).toBeVisible();
  expect(backend.tables.vital_samples[0].value).toBe(170);
  expect(backend.tables.vital_samples[0].deleted_at).toBeTruthy();
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page.getByRole("button", { name: /^Sync & Pending Changes,/ }).click();
  await page.getByRole("button", { name: "Refresh pending changes" }).click();
  await expect(
    page.getByText("On this device: 175 lb", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use the saved version", exact: true })
    .click();
  await expect(
    page.getByText("No pending health-data saves on this device.", {
      exact: true,
    }),
  ).toBeVisible();
});

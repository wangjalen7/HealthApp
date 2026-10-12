import { test, expect, signIn, quickLog } from "./fixture";

const user = "11111111-1111-4111-8111-111111111111";

test("notes offer expansion only when the preview is clipped, and respond to screen width", async ({
  page,
  backend,
}, info) => {
  const short = "Good session.";
  const twoLines = "First line.\nSecond line.";
  const long = "First section.\nSecond section.\nThird section.\nLast section.";
  const wrapping =
    "A comfortable pace with steady breathing throughout the session and no problems with any of the movements.";
  backend.tables.workout_sessions = [short, twoLines, long, wrapping].map(
    (notes, index) => ({
      id: `82000000-0000-4000-8000-00000000000${index + 1}`,
      user_id: user,
      version: 1,
      title: "Synthetic workout",
      muscle_groups: ["Chest"],
      completed_at: new Date(2026, 9, 11, 12, index).toISOString(),
      notes,
    }),
  );
  backend.tables.workout_sets = [];
  backend.tables.cardio_entries = [
    {
      id: "83000000-0000-4000-8000-000000000001",
      user_id: user,
      version: 1,
      activity_type: "walk",
      duration_minutes: 20,
      notes: "Easy walk.",
      occurred_at: new Date().toISOString(),
      source: "manual",
    },
  ];
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await page.getByRole("tab", { name: "History", exact: true }).first().click();
  const notes = page.getByTestId("workout-history-notes");
  await expect(notes).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Expand workout notes", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Expand cardio notes", exact: true }),
  ).toHaveCount(0);
  for (const text of [short, twoLines]) {
    await expect(
      notes.filter({ hasText: text }).locator("..").getByRole("button"),
    ).toHaveCount(0);
  }
  const longNote = notes.filter({ hasText: long });
  const section = longNote.locator("..");
  const collapsed = (await longNote.boundingBox())!.height;
  await section
    .getByRole("button", { name: "Expand workout notes", exact: true })
    .click();
  expect((await longNote.boundingBox())!.height).toBeGreaterThan(collapsed);
  await section
    .getByRole("button", { name: "Collapse workout notes", exact: true })
    .click();
  await expect
    .poll(async () => (await longNote.boundingBox())!.height)
    .toBe(collapsed);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(
    page.getByRole("button", { name: "Expand workout notes", exact: true }),
  ).toHaveCount(2);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("history-notes-dark-320.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByRole("button", { name: "Expand workout notes", exact: true }),
  ).toHaveCount(1);
});

test("fluid History uses aligned Edit/Delete icons and retains category editing, retry and confirmation", async ({
  page,
  backend,
}, info) => {
  const occurred = new Date().toISOString();
  backend.tables.hydration_entries = [
    {
      id: "84000000-0000-4000-8000-000000000001",
      user_id: user,
      version: 1,
      fluid_name: "Test water",
      volume_ml: 500,
      category_id: "water",
      alcohol_status: "nonalcoholic",
      counting_policy: "beverage_volume_v1",
      occurred_at: occurred,
    },
  ];
  await signIn(page);
  await page.getByRole("tab", { name: "History", exact: true }).first().click();
  await page.getByRole("tab", { name: "Fluids", exact: true }).click();
  const edit = page.getByRole("button", {
    name: "Edit Test water entry",
    exact: true,
  });
  const remove = page.getByRole("button", {
    name: "Delete Test water entry",
    exact: true,
  });
  await expect(edit).toBeVisible();
  await expect(
    page.getByText("Change drink category", { exact: true }),
  ).toHaveCount(0);
  const a = (await edit.boundingBox())!,
    b = (await remove.boundingBox())!;
  expect(a.height).toBe(44);
  expect(a.width).toBe(44);
  expect(b.height).toBe(44);
  expect(b.y).toBe(a.y);
  expect(b.x - a.x - a.width).toBe(8);
  await page.screenshot({
    path: info.outputPath("history-fluid-actions-light.png"),
  });
  await edit.click();
  await page.getByRole("radio", { name: "Coffee", exact: true }).click();
  backend.failNextWrite = "hydration_entries";
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(page.getByText(/Test connection unavailable/)).toBeVisible();
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect
    .poll(() => backend.tables.hydration_entries[0].category_id)
    .toBe("coffee");
  expect(backend.tables.hydration_entries[0]).toMatchObject({
    volume_ml: 500,
    occurred_at: occurred,
  });
  await expect(
    page.getByRole("button", { name: "Save category", exact: true }),
  ).toHaveCount(0);
  await remove.click();
  const confirmation = page.getByTestId("confirmation-actions");
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(backend.tables.hydration_entries).toHaveLength(1);
  await remove.click();
  await confirmation
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect.poll(() => backend.tables.hydration_entries.length).toBe(0);
});

test("managed food labels use plain History icons while editing and confirmed deletion still persist", async ({
  page,
  backend,
}, info) => {
  backend.tables.user_food_profiles = [
    {
      id: "85000000-0000-4000-8000-000000000001",
      user_id: user,
      version: 1,
      food_name: "Test oats",
      source: "manual_label",
      serving_label: "100 g",
      serving_weight_grams: 100,
      calories_per_serving: 150,
      protein_grams_per_serving: 5,
      archived_at: null,
      updated_at: new Date().toISOString(),
    },
  ];
  await signIn(page);
  await quickLog(page, "Food");
  await page
    .getByRole("button", { name: "Manage labels", exact: true })
    .click();
  const edit = page.getByRole("button", {
    name: "Edit Test oats food label",
    exact: true,
  });
  const remove = page.getByRole("button", {
    name: "Delete Test oats food label",
    exact: true,
  });
  await expect(edit).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(remove).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const a = (await edit.boundingBox())!,
    b = (await remove.boundingBox())!;
  expect(a.height).toBe(44);
  expect(b.height).toBe(44);
  expect(b.y).toBe(a.y);
  expect(b.x - a.x - a.width).toBe(8);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.screenshot({
    path: info.outputPath("managed-label-actions-dark-320.png"),
  });
  await edit.click();
  await page.getByLabel("Calories", { exact: true }).fill("180");
  await page.getByRole("button", { name: "Save label", exact: true }).click();
  await expect(
    page.getByText("Food label updated.", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.user_food_profiles[0].calories_per_serving).toBe(180);
  await remove.click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(backend.tables.user_food_profiles[0].archived_at).toBeNull();
  await remove.click();
  await page.getByRole("button", { name: "Delete label", exact: true }).click();
  await expect
    .poll(() => backend.tables.user_food_profiles[0].archived_at)
    .not.toBeNull();
  await expect(edit).toHaveCount(0);
  expect(backend.tables.nutrition_entries ?? []).toHaveLength(0);
});

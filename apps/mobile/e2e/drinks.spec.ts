import { expect, quickLog, signIn, test } from "./fixture";

test("counts coffee, separates wine, logs named drinks and resolves unknown drinks without AI", async ({
  page,
  backend,
}, testInfo) => {
  const aiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/functions/")) aiRequests.push(request.url());
  });
  await signIn(page);
  await quickLog(page, "Water");
  await page.getByRole("radio", { name: "Coffee", exact: true }).click();
  await page.getByLabel("Fluid name", { exact: true }).fill("Morning coffee");
  await page.getByLabel("Fluid amount", { exact: true }).fill("250");
  await page.getByRole("radio", { name: "mL", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Save to My Drinks" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(page.getByText("Fluid saved.", { exact: true })).toBeVisible();
  expect(backend.tables.hydration_entries[0]).toMatchObject({
    volume_ml: 250,
    category_id: "coffee",
    alcohol_status: "nonalcoholic",
    counting_policy: "beverage_volume_v1",
  });
  expect(backend.tables.saved_drinks ?? []).toHaveLength(0);
  await page.getByRole("button", { name: "All drink categories" }).click();
  await page.getByRole("radio", { name: "Wine", exact: true }).click();
  await page.getByLabel("Fluid amount", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect.poll(() => backend.tables.hydration_entries.length).toBe(2);
  await expect(
    page.getByText("5.1 fl oz alcohol logged separately", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Other", exact: true }).click();
  await page.getByLabel("Fluid name", { exact: true }).fill("Mystery drink");
  await page.getByLabel("Fluid amount", { exact: true }).fill("300");
  backend.failNextWrite = "hydration_entries";
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(page.getByText(/Test connection unavailable/)).toBeVisible();
  expect(backend.tables.hydration_entries).toHaveLength(2);
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(
    page.getByText("10.1 fl oz needs classification", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Classify Mystery drink", exact: true })
    .click();
  await page
    .getByRole("radio", { name: "No alcohol", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await expect(
    page.getByText("10.1 fl oz needs classification", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("18.6 fl oz", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Use recent drink Morning coffee" })
    .click();
  await expect(page.getByLabel("Fluid amount", { exact: true })).toHaveValue(
    "250",
  );
  await expect(
    page.getByRole("radio", { name: "Coffee", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "All drink categories" }).click();
  await expect(page.getByLabel("Search drink categories")).toBeVisible();
  await page.getByRole("button", { name: "Close drink categories" }).click();
  await page
    .getByText("Drink category", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("drink-categories-320.png"),
    fullPage: true,
  });
  expect(aiRequests).toEqual([]);
  await page.getByRole("tab", { name: "Summary", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: /^Fluids: 18\.6 of/ }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "History", exact: true }).first().click();
  await page.getByRole("tab", { name: "Food", exact: true }).click();
  await expect(
    page.getByText("No food saved yet", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Fluids", exact: true }).click();
  await expect(
    page.getByText("18.6 fl oz fluids", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Alcohol logged separately", { exact: true }),
  ).toBeVisible();
});

test("custom fluid goals need no sex and suggested activity goals require explicit acceptance", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page.getByRole("button", { name: /^Fluids,/ }).click();
  await page
    .getByRole("button", { name: "Find My Fluid Goal", exact: true })
    .click();
  await page.getByRole("radio", { name: "Custom", exact: true }).click();
  await page.getByRole("radio", { name: "Milliliters", exact: true }).click();
  await page
    .getByLabel("Custom beverage goal (mL)", { exact: true })
    .fill("bad");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Use This Goal", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Custom beverage goal (mL)", { exact: true })
    .fill("2357");
  await page.getByRole("radio", { name: "US fl oz", exact: true }).click();
  await page.getByRole("radio", { name: "Milliliters", exact: true }).click();
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  expect(backend.tables.profiles[0].daily_water_goal_ml).toBe(2400);
  await page
    .getByRole("button", { name: "Use This Goal", exact: true })
    .click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_water_goal_ml)
    .toBe(2357);
  await page
    .getByRole("button", { name: "Edit & Recalculate", exact: true })
    .last()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Edit & Recalculate", exact: true })
    .click();
  await page.getByRole("radio", { name: "Suggested", exact: true }).click();
  await page.getByRole("radio", { name: "Female", exact: true }).click();
  await page
    .getByRole("radio", { name: "Moderately active", exact: true })
    .click();
  await page.getByRole("button", { name: "Recalculate", exact: true }).click();
  await expect(page.getByText("2700 mL/day", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Use This Goal", exact: true })
    .click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_water_goal_ml)
    .toBe(2700);
});

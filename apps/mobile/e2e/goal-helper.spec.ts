import { expect, signIn, test } from "./fixture";

test("does not allow low-intake calorie targets or retain an earlier valid selection", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page
    .getByRole("button", { name: "Find my calories", exact: true })
    .click();
  await page.getByRole("radio", { name: "Metric", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("70");
  await page.getByLabel("Current weight (kg)", { exact: true }).fill("55");
  await page.getByLabel("Height (cm)", { exact: true }).fill("160");
  await page
    .getByRole("radio", { name: "Female equation", exact: true })
    .click();
  await page.getByLabel("Goal weight (kg)", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Calculate options", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use this target", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/No loss target is available/)).toBeVisible();
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2200);
  await page.getByLabel("Age", { exact: true }).fill("30");
  await page.getByLabel("Current weight (kg)", { exact: true }).fill("80");
  await page.getByLabel("Goal weight (kg)", { exact: true }).fill("65");
  await page
    .getByRole("button", { name: "Calculate options", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use this target", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Goal weight (kg)", { exact: true }).fill("35");
  await page
    .getByRole("button", { name: "Calculate options", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use this target", exact: true }),
  ).toBeDisabled();
});

test("calculates and explicitly applies calorie and fluid goals", async ({
  page,
  backend,
}, testInfo) => {
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();

  await page
    .getByRole("button", { name: "Find my calories", exact: true })
    .click();
  await page.getByLabel("Age", { exact: true }).fill("30");
  await page.getByLabel("Current weight (lb)", { exact: true }).fill("176.37");
  await page.getByLabel("Height (ft)", { exact: true }).fill("5");
  await page.getByLabel("Height (in)", { exact: true }).fill("10.866");
  await page.getByRole("radio", { name: "Male equation", exact: true }).click();
  await page.getByRole("radio", { name: /^Active/ }).click();
  await page
    .getByText("Usual activity", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("activity-options.png") });
  await page.getByLabel("Goal weight (lb)", { exact: true }).fill("150");
  await page.getByLabel("Time frame (weeks)", { exact: true }).fill("16");
  await page.getByRole("radio", { name: "Metric", exact: true }).click();
  await expect(page.getByLabel("Current weight (kg)")).toHaveValue("80.00");
  await expect(page.getByLabel("Height (cm)")).toHaveValue("180.0");
  await expect(page.getByLabel("Goal weight (kg)")).toHaveValue("68.04");
  await page.getByRole("radio", { name: "US customary", exact: true }).click();
  await page
    .getByRole("button", { name: "Calculate options", exact: true })
    .click();
  await expect(page.getByText("About 2,759 kcal/day")).toBeVisible();
  await expect(page.getByText("2,136 kcal/day", { exact: true })).toBeVisible();
  await expect(page.getByText("2,447 kcal/day", { exact: true })).toBeVisible();
  await expect(page.getByText("2,759 kcal/day", { exact: true })).toBeVisible();
  await expect(page.getByText("3,382 kcal/day", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /^1 lb\/week/ }).click();
  await expect(page.getByText("About 2,259 kcal/day")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("calorie-options.png") });
  await page
    .getByRole("button", { name: "Use this target", exact: true })
    .click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_calorie_goal)
    .toBe(2259);
  expect(backend.tables.profiles[0].weight_goal_lb).toBe(150);
  await expect(page.getByLabel("Weight (lb)", { exact: true })).toHaveValue(
    "150",
  );
  expect(backend.tables.profiles[0].daily_water_goal_ml).toBe(2400);
  await expect(page.getByText("Calorie target saved.")).toBeVisible();

  await page
    .getByRole("button", { name: "Find my fluid goal", exact: true })
    .click();
  await page.getByRole("radio", { name: "Women", exact: true }).click();
  await page
    .getByRole("radio", { name: "Mostly sitting", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Calculate fluid goal", exact: true })
    .click();
  await expect(page.getByText("About 74 US fl oz/day")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("fluid-goal.png") });
  await page
    .getByRole("button", { name: "Use this goal", exact: true })
    .click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_water_goal_ml)
    .toBe(2200);
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2259);
  await expect(page.getByText("Fluid goal saved.")).toBeVisible();
});

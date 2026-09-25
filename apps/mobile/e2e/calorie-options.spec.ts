import { test, expect, signIn } from "./fixture";
import { calorieDefaults } from "../src/features/goals/helper-model";

function savedCalculation(maintenance = 2500.5) {
  return {
    helperVersion: 1,
    latestCalculation: {
      kind: "calories",
      inputs: {
        ...calorieDefaults("us", "lose", 200, 180),
        age: "30",
        sex: "male",
        heightCm: 180,
        heightFeet: "5",
        heightInches: "10.87",
        activity: "active",
        lossPlan: "rate",
        lossRate: 1,
      },
      maintenance,
      target: 2001,
      calculatedAt: "2026-09-24T12:00:00Z",
      assumptions: { method: "mifflin_st_jeor_v1" },
    },
  };
}

test("calorie goals show saved comparisons without applying them and retain them after a manual edit", async ({
  page,
  backend,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = backend.tables.profiles[0];
  profile.version = 1;
  profile.calorie_goal_calculation = savedCalculation();
  const before = JSON.stringify(profile);
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page.getByRole("button", { name: /^Calories,/ }).click();
  const options = page.getByTestId("calorie-options");
  await expect(options).toBeVisible();
  for (const [rate, label, value] of [
    [0, "Maintenance", "2,501 kcal/day"],
    [0.5, "-0.5 lb/week", "2,251 kcal/day"],
    [1, "-1 lb/week", "2,001 kcal/day"],
    [1.5, "-1.5 lb/week", "1,751 kcal/day"],
    [2, "-2 lb/week", "1,501 kcal/day"],
  ] as const) {
    const row = page.getByTestId(`calorie-option-${rate}`);
    await expect(row.getByText(label, { exact: true })).toBeVisible();
    await expect(row.getByText(value, { exact: true })).toBeVisible();
  }
  await expect(options.getByText("Current goal", { exact: true })).toHaveCount(
    0,
  );
  expect(JSON.stringify(profile)).toBe(before);
  await page
    .getByRole("button", { name: "Edit Manually", exact: true })
    .click();
  await page.getByLabel("Calories / day", { exact: true }).fill("2001");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(
    page
      .getByTestId("calorie-option-1")
      .getByText("Current goal", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2001);
  await options.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("calorie-options-light.png") });
  await page
    .getByRole("button", { name: "Back to Profile", exact: true })
    .click();
  await page.getByRole("button", { name: /^Calories,/ }).click();
  await expect(
    page
      .getByTestId("calorie-option-1")
      .getByText("Current goal", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark" });
  await options.scrollIntoViewIfNeeded();
  expect(
    await options.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("calorie-options-dark-320.png"),
  });
});

test("calorie comparisons respect metric preferences and unavailable targets; manual-only goals do not invent estimates", async ({
  page,
  backend,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  backend.tables.account_setup[0].unit_system = "metric";
  backend.tables.profiles[0].calorie_goal_calculation =
    savedCalculation(1450.4);
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page.getByRole("button", { name: /^Calories,/ }).click();
  await expect(page.getByTestId("calorie-option-0")).toContainText(
    "1,450 kcal/day",
  );
  await expect(page.getByTestId("calorie-option-0.5")).toContainText(
    "-0.23 kg/week",
  );
  await expect(page.getByTestId("calorie-option-0.5")).toContainText(
    "1,200 kcal/day",
  );
  await expect(page.getByTestId("calorie-option-1")).toContainText(
    "Unavailable",
  );
  await expect(page.getByTestId("calorie-option-1.5")).toContainText(
    "-0.68 kg/week",
  );
  await expect(page.getByTestId("calorie-option-2")).toContainText(
    "Unavailable",
  );
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2200);
  await page
    .getByRole("button", { name: "Back to Profile", exact: true })
    .click();
  backend.tables.profiles[0].calorie_goal_calculation = null;
  await page.getByRole("button", { name: /^Calories,/ }).click();
  await expect(
    page.getByRole("button", { name: "Find My Calorie Goal", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("calorie-options")).toHaveCount(0);
});

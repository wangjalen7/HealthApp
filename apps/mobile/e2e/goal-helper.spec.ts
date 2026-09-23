import { expect, signIn, test } from "./fixture";
import type { Page } from "@playwright/test";
import type { CalorieResult } from "../src/features/goals/helper-model";
type CalorieMetadata = {
  latestCalculation: CalorieResult;
  acceptedAt?: string;
};

const button = (page: Page, name: string) =>
  (["Back to Profile", "Sign Out", "Edit Manually"].includes(name)
    ? page
    : page.getByRole("dialog")
  ).getByRole("button", { name, exact: true });
const radio = (page: Page, name: string) =>
  page.getByRole("radio", { name, exact: true });
async function open(page: Page, kind = "calories") {
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page
    .getByRole("button", {
      name: kind === "calories" ? /^Calories,/ : /^Fluids,/,
    })
    .click();
  await page
    .getByRole("button", {
      name: /^(Find My Calorie Goal|Find My Fluid Goal|Edit & Recalculate)$/,
    })
    .last()
    .click();
}
async function fillDetails(page: Page) {
  await radio(page, "Metric").click();
  await page.getByLabel("Age", { exact: true }).fill("30");
  await page.getByLabel("Current weight (kg)").fill("80");
  await page.getByLabel("Height (cm)").fill("180");
  await radio(page, "Male").click();
  await radio(page, "Active").click();
}

test("saves unapplied date estimates and drafts across close, tabs and login; cancels and applies explicitly", async ({
  page,
  backend,
}, info) => {
  await page.clock.setFixedTime(new Date("2026-09-22T16:00:00Z"));
  await signIn(page);
  await open(page);
  await fillDetails(page);
  await page.getByLabel("Goal weight (kg)").fill("70");
  await page.getByLabel("Target Date", { exact: true }).fill("2027-01-12");
  await expect(page.getByText(/16 weeks/)).toBeVisible();
  await button(page, "Calculate").click();
  await expect(button(page, "Use This Goal")).toBeVisible();
  const metadata = backend.tables.profiles[0]
    .calorie_goal_calculation as CalorieMetadata;
  expect(metadata.latestCalculation.inputs.targetDate).toBe("2027-01-12");
  expect(metadata.latestCalculation.startDate).toBe("2026-09-22");
  expect(metadata.latestCalculation.target).toBe(2070);
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2200);
  expect(metadata.acceptedAt).toBeUndefined();
  await expect(
    page.getByText("Not your currently applied goal", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("calorie-overview.png") });
  await button(page, "Edit & Recalculate").click();
  await page.getByLabel("Age", { exact: true }).fill("31");
  await page.getByRole("tab", { name: "Fluids", exact: true }).click();
  await radio(page, "Custom").click();
  await page.getByLabel("Custom beverage goal (US fl oz)").fill("90");
  await page.getByRole("tab", { name: "Calories", exact: true }).click();
  await expect(button(page, "Edit & Recalculate")).toBeVisible();
  await button(page, "Edit & Recalculate").click();
  await expect(page.getByLabel("Age", { exact: true })).toHaveValue("31");
  await button(page, "Close goal helper").click();
  await button(page, "Back to Profile").click();
  await button(page, "Sign Out").click();
  await page.reload();
  await signIn(page);
  await open(page);
  await expect(
    page.getByRole("dialog").getByText("2,070 kcal/day", { exact: true }),
  ).toBeVisible();
  await button(page, "Edit & Recalculate").click();
  await expect(page.getByLabel("Age", { exact: true })).toHaveValue("31");
  await button(page, "Cancel edits").click();
  await button(page, "Edit & Recalculate").click();
  await expect(page.getByLabel("Age", { exact: true })).toHaveValue("30");
  await expect(page.getByLabel("Target Date", { exact: true })).toHaveValue(
    "2027-01-12",
  );
  await page.getByLabel("Age", { exact: true }).fill("31");
  await button(page, "Recalculate").click();
  await expect(button(page, "Use This Goal")).toBeVisible();
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2200);
  await button(page, "Use This Goal").click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_calorie_goal)
    .toBe(2062);
  await open(page);
  await expect(
    page.getByText("Matches your current daily goal", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Fluids", exact: true }).click();
  await expect(page.getByLabel("Custom beverage goal (US fl oz)")).toHaveValue(
    "90",
  );
  await button(page, "Calculate").click();
  await expect(
    page.getByRole("dialog").getByText("90 US fl oz/day", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.profiles[0].daily_water_goal_ml).toBe(2400);
  await button(page, "Close goal helper").click();
  await open(page, "fluids");
  await expect(
    page.getByRole("dialog").getByText("90 US fl oz/day", { exact: true }),
  ).toBeVisible();
  await radio(page, "Milliliters").click();
  await radio(page, "US fl oz").click();
  await button(page, "Use This Goal").click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_water_goal_ml)
    .toBe(2661.617660625);
});

test("invalid dates and low intake cannot replace the prior result or applied goal", async ({
  page,
  backend,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-22T16:00:00Z"));
  await signIn(page);
  await open(page);
  await fillDetails(page);
  await radio(page, "Maintain").click();
  await expect(page.getByLabel("Target Date", { exact: true })).toHaveCount(0);
  await button(page, "Calculate").click();
  await expect(
    page.getByRole("dialog").getByText("2,759 kcal/day", { exact: true }),
  ).toBeVisible();
  await button(page, "Edit & Recalculate").click();
  await radio(page, "Lose").click();
  await page.getByLabel("Goal weight (kg)").fill("70");
  for (const date of ["2026-09-21", "2026-09-22", "2026-09-29"]) {
    await page.getByLabel("Target Date", { exact: true }).fill(date);
    await button(page, "Recalculate").click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(button(page, "Use This Goal")).toHaveCount(0);
  }
  await page.getByLabel("Age", { exact: true }).fill("70");
  await page.getByLabel("Current weight (kg)").fill("55");
  await page.getByLabel("Height (cm)").fill("160");
  await radio(page, "Female").click();
  await radio(page, "Sedentary").click();
  await page.getByLabel("Goal weight (kg)").fill("50");
  await button(page, "Compare Other Options").click();
  await radio(page, "0.45 kg/week").click();
  await button(page, "Recalculate").click();
  await expect(page.getByRole("alert")).toContainText("1,000-20,000");
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2200);
  expect(
    (backend.tables.profiles[0].calorie_goal_calculation as CalorieMetadata)
      .latestCalculation.target,
  ).toBe(2759);
  await button(page, "Cancel edits").click();
  await expect(
    page.getByRole("dialog").getByText("2,759 kcal/day", { exact: true }),
  ).toBeVisible();
});

test("restores legacy estimates, protects saved weight, and recovers failed calculation saves", async ({
  page,
  backend,
}, info) => {
  backend.tables.profiles[0].calorie_goal_calculation = {
    method: "mifflin_st_jeor_v1",
    ageYears: 30,
    heightCm: 180,
    weightKg: 80,
    sex: "male",
    activity: "active",
    maintenance: 2759,
    intent: "maintain",
    acceptedAt: "2026-09-20T16:00:00Z",
  };
  backend.tables.vital_samples = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      user_id: backend.tables.profiles[0].id,
      kind: "weight",
      value: 190,
      version: 1,
      change_seq: 1,
      created_at: "2026-09-22T12:00:00Z",
      unit: "lb",
      source: "healthkit",
      occurred_at: "2026-09-22T12:00:00Z",
      deleted_at: null,
    },
  ];
  await signIn(page);
  await expect(
    page.getByRole("button", { name: /^Weight 190 lb/ }),
  ).toBeVisible();
  await open(page);
  await expect(
    page.getByRole("dialog").getByText("2,200 kcal/day", { exact: true }),
  ).toBeVisible();
  await button(page, "Edit & Recalculate").click();
  await expect(page.getByLabel("Current weight (lb)")).toHaveValue("176.37");
  await expect(button(page, "Use Latest Weight")).toBeVisible();
  await button(page, "Use Latest Weight").click();
  await expect(page.getByLabel("Current weight (lb)")).toHaveValue("190");
  backend.failNextWrite = "profiles";
  await button(page, "Recalculate").click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2200);
  await button(page, "Recalculate").click();
  await expect(button(page, "Use This Goal")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });

  await page.screenshot({
    path: info.outputPath("calorie-overview-320.png"),
  });
  await button(page, "Edit & Recalculate").click();
  await page.getByText("Gender", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("details-320.png") });
});

test("lost calculation responses survive reopening; application retries and manual goals retain the estimate", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await open(page, "fluids");
  await radio(page, "Custom").click();
  await radio(page, "Milliliters").click();
  await page.getByLabel("Custom beverage goal (mL)").fill("2357");
  backend.loseNextResponse = "profiles";
  await button(page, "Calculate").click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(backend.tables.profiles[0].daily_water_goal_ml).toBe(2400);
  await button(page, "Close goal helper").click();
  await page.reload();
  await signIn(page);
  await open(page, "fluids");
  await expect(
    page.getByRole("dialog").getByText("2357 mL/day", { exact: true }),
  ).toBeVisible();
  await button(page, "Use This Goal").click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_water_goal_ml)
    .toBe(2357);
  await open(page, "fluids");
  await button(page, "Edit & Recalculate").click();
  await page.getByLabel("Custom beverage goal (mL)").fill("2500");
  await button(page, "Recalculate").click();
  await expect(button(page, "Use This Goal")).toBeVisible();
  backend.failNextWrite = "profiles";
  await button(page, "Use This Goal").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await button(page, "Use This Goal").click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_water_goal_ml)
    .toBe(2500);
  await button(page, "Edit Manually").click();
  await page.getByLabel("Fluids / day (fl oz)", { exact: true }).fill("100");
  await button(page, "Save goal").click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_water_goal_ml)
    .toBe(2957.35295625);
  await open(page, "fluids");
  await expect(
    page.getByRole("dialog").getByText("2500 mL/day", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Not your currently applied goal", { exact: true }),
  ).toBeVisible();
});

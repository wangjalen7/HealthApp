import type { Page } from "@playwright/test";
import { expect, test, signIn } from "./fixture";
const id = "11111111-1111-4111-8111-111111111111";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
async function emailLogin(page: Page) {
  await page.goto("/sign-in");
  await page
    .getByPlaceholder("Email", { exact: true })
    .fill("review@example.com");
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill("synthetic-password");
  await button(page, "Sign in").click();
}

test("email signup, confirmation, all-optional skip, and saved completion survive a later sign-in", async ({
  page,
  backend,
}, info) => {
  backend.tables.account_setup[0].completed_at = null;
  backend.tables.account_setup[0].dismissed_setup = false;
  for (const key of [
    "daily_calorie_goal",
    "daily_protein_goal",
    "daily_water_goal_ml",
    "weight_goal_lb",
  ])
    backend.tables.profiles[0][key] = null;
  await page.goto("/welcome");
  await expect(
    page.getByRole("heading", {
      name: "Your health, in one place.",
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath("welcome.png") });
  await expect(button(page, "Continue with phone")).toHaveCount(0);
  await button(page, "Continue with email").click();
  await expect(
    page.getByRole("heading", { name: "Create your account", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveCount(0);
  await page
    .getByPlaceholder("Email", { exact: true })
    .fill("review@example.com");
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill("synthetic-password");
  await button(page, "Create account").click();
  await expect(
    page.getByRole("heading", { name: "Confirm your account", exact: true }),
  ).toBeVisible();
  // Simulate email confirmation at the Auth service, then use the normal sign-in flow.
  backend.emailConfirmed = true;
  await emailLogin(page);
  await expect(
    page.getByText("Let’s make this yours.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Preferred name", { exact: true }).fill("Not accepted");
  await button(page, "Skip for now").click();
  await button(page, "Set up later").click();
  await button(page, "Set up later").click();
  await button(page, "Set up later").click();
  await expect(page.getByText("You’re ready.", { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath("completion-skipped.png") });
  await button(page, "Start tracking").click();
  await expect(
    page.getByText("Your daily snapshot", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.account_setup[0].preferred_name).toBeNull();
  expect(backend.tables.profiles[0].daily_calorie_goal).toBeNull();
  expect(backend.tables.workout_sessions ?? []).toHaveLength(0);
  expect(backend.tables.vital_samples ?? []).toHaveLength(0);
  await page.reload();
  await emailLogin(page);
  await expect(
    page.getByText("Your daily snapshot", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Let’s make this yours.", { exact: true }),
  ).toHaveCount(0);
});

test("personalization preserves drafts, saves existing goals through hardened writes and shows accurate summary", async ({
  page,
  backend,
}, info) => {
  backend.tables.account_setup[0].completed_at = null;
  backend.tables.account_setup[0].dismissed_setup = false;
  await emailLogin(page);
  await expect(page.getByLabel("Preferred name", { exact: true })).toBeVisible();
  await expect(page.getByTestId("sustain-entry-cover")).toHaveCount(0);
  await page.getByLabel("Preferred name", { exact: true }).fill("王 Jalen");
  await button(page, "Continue").click();
  await page.getByLabel("Daily calories (kcal)", { exact: true }).fill("2300");
  await button(page, "Back").click();
  await expect(page.getByLabel("Preferred name", { exact: true })).toHaveValue(
    "王 Jalen",
  );
  await button(page, "Continue").click();
  await expect(
    page.getByLabel("Daily calories (kcal)", { exact: true }),
  ).toHaveValue("2300");
  await button(page, "Save goals and continue").click();
  await expect(
    page.getByText("Make room for fluids.", { exact: true }),
  ).toBeVisible();
  await button(page, "Find My Fluid Goal").click();
  await page.getByRole("radio", { name: "Custom", exact: true }).click();
  await page
    .getByLabel("Custom beverage goal (US fl oz)", { exact: true })
    .fill("90");
  await button(page, "Calculate").click();
  await button(page, "Use This Goal").click();
  await expect(
    page.getByText("90.0 US fl oz/day", { exact: true }),
  ).toBeVisible();
  await button(page, "Continue").click();
  await button(page, "Set up later").click();
  await expect(
    page.getByText("You’re ready, 王 Jalen.", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath("completion-saved.png") });
  await button(page, "Start tracking").click();
  await expect(page.getByText("Hi 王 Jalen,", { exact: true })).toBeVisible();
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2300);
  expect(backend.tables.profiles[0].daily_protein_goal).toBe(150);
});

test("established email account bypasses onboarding and Settings has no phone options", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: /^Sign-in & Contact Info,/ }).click();
  await expect(page.getByText("Account email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveCount(0);
  await expect(button(page, "Add / change phone")).toHaveCount(0);
  expect(backend.tables.profiles[0].id).toBe(id);
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2200);
  expect(backend.tables.account_setup[0].completed_at).toBeTruthy();
});

test("old phone links open email sign-in and setup read failures do not masquerade as a new account", async ({
  page,
  backend,
}) => {
  await page.goto("/phone");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveCount(0);
  backend.failReads = {
    account_setup: { code: "503", message: "Unavailable" },
  };
  await page
    .getByPlaceholder("Email", { exact: true })
    .fill("review@example.com");
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill("synthetic-password");
  await button(page, "Sign in").click();
  await expect(button(page, "Try again")).toBeVisible();
  await expect(
    page.getByText("Let’s make this yours.", { exact: true }),
  ).toHaveCount(0);
  backend.failReads = {};
  await button(page, "Try again").click();
  await expect(page.getByText("Hi Review,", { exact: true })).toBeVisible();
});

test("setup write failure retries once and stale edits cannot replace changes on another device", async ({
  page,
  backend,
}) => {
  backend.tables.account_setup[0].completed_at = null;
  await emailLogin(page);
  await page.getByLabel("Preferred name", { exact: true }).fill("Retry name");
  backend.failNextWrite = "account_setup";
  await button(page, "Continue").click();
  await expect(
    page.getByText(/Could not confirm your setup save/),
  ).toBeVisible();
  await button(page, "Continue").click();
  expect(backend.tables.account_setup[0].version).toBe(2);
  await expect(
    page.getByText("Goals that fit your life.", { exact: true }),
  ).toBeVisible();
  backend.tables.account_setup[0].version = 3;
  backend.tables.account_setup[0].preferred_name = "Other device";
  await button(page, "Set up later").click();
  await expect(
    page.getByText(/Settings changed on another device/),
  ).toBeVisible();
  expect(backend.tables.account_setup[0].preferred_name).toBe("Other device");
});

test("interrupted setup resumes a local draft and small dark screens keep actions usable", async ({
  page,
  backend,
}, info) => {
  backend.tables.account_setup[0].completed_at = null;
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 640 });
  await emailLogin(page);
  await page.getByLabel("Preferred name", { exact: true }).fill("Resume me");
  await button(page, "Continue").click();
  await page.getByLabel("Daily protein (g)", { exact: true }).fill("170");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              "healthapp:onboarding-draft:11111111-1111-4111-8111-111111111111",
            ) || "{}",
          ).protein,
      ),
    )
    .toBe("170");
  await page.reload();
  await emailLogin(page);
  await expect(
    page.getByText("Goals that fit your life.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Daily protein (g)", { exact: true }),
  ).toHaveValue("170");
  await page.getByLabel("Daily calories (kcal)", { exact: true }).focus();
  await page.screenshot({ path: info.outputPath("goals-320-dark.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await button(page, "Save goals and continue").scrollIntoViewIfNeeded();
  await expect(button(page, "Save goals and continue")).toBeInViewport();
});

test("onboarding shares saved helper results without replacing unrelated goal drafts", async ({
  page,
  backend,
}) => {
  backend.tables.account_setup[0].completed_at = null;
  await emailLogin(page);
  await button(page, "Continue").click();
  await page.getByLabel("Daily protein (g)", { exact: true }).fill("175");
  await page.getByLabel("Target weight (lb)", { exact: true }).fill("160");
  await button(page, "Find My Calorie Goal").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Metric", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("30");
  await page.getByLabel("Current weight (kg)", { exact: true }).fill("80");
  await page.getByLabel("Height (cm)", { exact: true }).fill("180");
  await dialog.getByRole("radio", { name: "Male", exact: true }).click();
  await dialog.getByRole("radio", { name: "Active", exact: true }).click();
  await dialog.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Use This Goal", exact: true }),
  ).toBeVisible();
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2200);
  await button(page, "Close goal helper").click();
  await expect(
    page.getByLabel("Daily protein (g)", { exact: true }),
  ).toHaveValue("175");
  await button(page, "Edit & Recalculate").click();
  await expect(
    dialog.getByText("Not your currently applied goal", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Use This Goal", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByLabel("Daily protein (g)", { exact: true }),
  ).toHaveValue("175");
  await expect(
    page.getByLabel("Target weight (lb)", { exact: true }),
  ).toHaveValue("160");
  await button(page, "Save goals and continue").click();
  await expect(
    page.getByText("Make room for fluids.", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.profiles[0].daily_protein_goal).toBe(175);
  expect(backend.tables.profiles[0].weight_goal_lb).toBe(160);
  const calories = backend.tables.profiles[0].daily_calorie_goal;
  await button(page, "Find My Fluid Goal").click();
  await dialog.getByRole("radio", { name: "Custom", exact: true }).click();
  await page
    .getByLabel("Custom beverage goal (US fl oz)", { exact: true })
    .fill("90");
  await dialog.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Use This Goal", exact: true }),
  ).toBeVisible();
  expect(backend.tables.profiles[0].daily_water_goal_ml).toBe(2400);
  await button(page, "Close goal helper").click();
  await button(page, "Edit & Recalculate").click();
  await expect(
    dialog.getByText("90 US fl oz/day", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Use This Goal", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(backend.tables.profiles[0].daily_water_goal_ml).toBe(2661.617660625);
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(calories);
  expect(backend.tables.vital_samples ?? []).toHaveLength(0);
});

test("short onboarding viewports keep focused fields at full size and all actions scrollable", async ({
  page,
  backend,
}, info) => {
  backend.tables.account_setup[0].completed_at = null;
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 640 });
  await emailLogin(page);
  const name = page.getByLabel("Preferred name", { exact: true });
  await name.fill("Keyboard review");
  const before = await name.boundingBox();
  // Reduced available space is a layout regression, not a simulated native keyboard.
  await page.setViewportSize({ width: 320, height: 330 });
  await name.focus();
  await name.scrollIntoViewIfNeeded();
  const after = await name.boundingBox();
  expect(after!.height).toBe(before!.height);
  expect(after!.width).toBe(before!.width);
  await expect(name).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: info.outputPath("onboarding-name-short-320.png"),
  });
  await button(page, "Continue").click();
  const input = page.getByLabel("Daily protein (g)", { exact: true });
  await input.fill("180");
  await input.scrollIntoViewIfNeeded();
  await expect(input).toBeInViewport({ ratio: 1 });
  expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(50);
  await button(page, "Find My Calorie Goal").click();
  const age = page.getByLabel("Age", { exact: true });
  await age.fill("35");
  await age.scrollIntoViewIfNeeded();
  await expect(age).toBeInViewport({ ratio: 1 });
  expect((await age.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await page.screenshot({
    path: info.outputPath("onboarding-helper-short-320.png"),
  });
  await button(page, "Close goal helper").click();
  await expect(input).toHaveValue("180");
  await button(page, "Save goals and continue").click();
  await button(page, "Find My Fluid Goal").click();
  await page
    .getByRole("dialog")
    .getByRole("radio", { name: "Custom", exact: true })
    .click();
  const fluid = page.getByLabel("Custom beverage goal (US fl oz)", {
    exact: true,
  });
  await fluid.fill("85");
  await fluid.scrollIntoViewIfNeeded();
  await expect(fluid).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: info.outputPath("onboarding-fluid-short-320.png"),
  });
  await button(page, "Calculate").click();
  await button(page, "Use This Goal").click();
  await button(page, "Continue").click();
  await button(page, "Set up later").click();
  await button(page, "Start tracking").click();
  await expect(
    page.getByText("Hi Keyboard review,", { exact: true }),
  ).toBeVisible();
});

test("recovery email verification stays on the existing account", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: /^Sign-in & Contact Info,/ }).click();
  await page
    .getByLabel("Email to verify", { exact: true })
    .fill("recovery@example.invalid");
  backend.contactCollision = true;
  await button(page, "Send verification code").click();
  await expect(page.getByText(/accounts cannot be merged here/)).toBeVisible();
  backend.contactCollision = false;
  await button(page, "Send verification code").click();
  await page
    .getByLabel("Six-digit verification code", { exact: true })
    .fill("123456");
  await button(page, "Verify email").click();
  await expect(
    page.getByText(/Email verified. You can use email password recovery/),
  ).toBeVisible();
  expect(backend.tables.profiles[0].id).toBe(id);
  expect(backend.tables.profiles[0].daily_calorie_goal).toBe(2200);
});

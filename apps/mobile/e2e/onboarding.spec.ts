import type { Page } from "@playwright/test";
import { expect, test, signIn } from "./fixture";
const id = "11111111-1111-4111-8111-111111111111";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
async function emailLogin(page: Page) {
  await page.goto("/welcome");
  await button(page, "Already have an account? Sign in").click();
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
  await page.getByRole("radio", { name: "Custom goal", exact: true }).click();
  await page
    .getByLabel("Custom beverage goal (US fl oz)", { exact: true })
    .fill("90");
  await button(page, "Calculate fluid goal").click();
  await button(page, "Use this goal").click();
  await expect(
    page.getByText("Saved: 90.0 US fl oz/day", { exact: true }),
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
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
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
  await expect(button(page, "Retry account setup")).toBeVisible();
  await expect(
    page.getByText("Let’s make this yours.", { exact: true }),
  ).toHaveCount(0);
  backend.failReads = {};
  await button(page, "Retry account setup").click();
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
  await expect(button(page, "Save goals and continue")).toBeInViewport();
});

test("recovery email verification stays on the existing account", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
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

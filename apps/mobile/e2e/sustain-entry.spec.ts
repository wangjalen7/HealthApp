import { test, expect } from "./fixture";
import type { Page } from "@playwright/test";
const user = "11111111-1111-4111-8111-111111111111";
const intentKey = "healthapp:notification-intent:v2";
async function fillLogin(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill("review@example.com");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
}
test("Sustain keeps pending sign-in stable, rejects duplicates and enters without console errors", async ({
  page,
  backend,
}, info) => {
  void backend;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await fillLogin(page);
  await expect(page.getByTestId("sustain-launch-cover")).toHaveCount(0);
  const button = page.getByRole("button", { name: "Sign in", exact: true });
  const before = await button.boundingBox();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let requests = 0;
  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    requests++;
    await gate;
    await route.fallback();
  });
  await button.click();
  await expect(page.getByText("Signing in…", { exact: true })).toBeVisible();
  await expect(button).toBeDisabled();
  expect(await button.boundingBox()).toEqual(before);
  const flowing = page.locator('path[stroke-dasharray="140 1100"]');
  await expect(flowing).toHaveCount(1);
  const first = await flowing.getAttribute("stroke-dashoffset");
  await expect
    .poll(() => flowing.getAttribute("stroke-dashoffset"))
    .not.toBe(first);
  await page.screenshot({ path: info.outputPath("sustain-pending-light.png") });
  release();
  await expect(page.getByTestId("sustain-entry-cover")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Hi Review,", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  expect(errors).toEqual([]);
});

test("reminder entry never mounts Summary and waits only for critical account state", async ({
  page,
  backend,
}) => {
  void backend;
  await page.addInitScript(
    ({ intentKey, user }) => {
      localStorage.setItem(
        intentKey,
        JSON.stringify({
          seen: [],
          pending: {
            key: "entry-meal",
            expiresAt: Date.now() + 60000,
            payload: {
              v: 2,
              userId: user,
              source: "routine",
              category: "meals",
              slot: "lunch",
            },
          },
        }),
      );
      Object.assign(window, { summarySeen: false });
      new MutationObserver(() => {
        if (
          document.querySelector(
            '[data-testid="summary-widget-default-weight"]',
          )
        )
          Object.assign(window, { summarySeen: true });
      }).observe(document, { childList: true, subtree: true });
    },
    { intentKey, user },
  );
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/rest/v1/account_setup?*", async (route) => {
    await gate;
    await route.fallback();
  });
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Opening your account…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Ready for your day.", { exact: true }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("radio", { name: "lunch", exact: true }),
  ).toBeChecked();
  await expect(page.getByTestId("sustain-entry-cover")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "summarySeen"))).toBe(
    false,
  );
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).pending,
      intentKey,
    ),
  ).toBeUndefined();
  expect(backend.tables.nutrition_entries ?? []).toHaveLength(0);
});

test("critical setup failure offers retry and reduced-motion dark login stays usable on a compact screen", async ({
  page,
  backend,
}, info) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  backend.failReads = {
    account_setup: {
      code: "XX000",
      message: "Account setup is temporarily unavailable.",
    },
  };
  await fillLogin(page);
  await expect(page.locator('path[stroke-dasharray="140 1100"]')).toHaveCount(
    0,
  );
  await page.screenshot({
    path: info.outputPath("sustain-login-dark-320.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Ready for your day.", { exact: true }),
  ).toHaveCount(0);
  delete backend.failReads.account_setup;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hi Review,", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("sustain-entry-cover")).toHaveCount(0);
});

test("signup confirmation is not a successful entry", async ({
  page,
  backend,
}) => {
  void backend;
  await page.goto("/sign-up");
  await page.getByLabel("Email", { exact: true }).fill("new@example.com");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirm your account", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("sustain-entry-cover")).toHaveCount(0);
});

test("a reminder waits through required onboarding and then opens the logger directly", async ({
  page,
  backend,
}) => {
  backend.tables.account_setup[0].completed_at = null;
  backend.tables.account_setup[0].dismissed_setup = false;
  await page.addInitScript(
    ({ intentKey, user }) => {
      localStorage.setItem(
        intentKey,
        JSON.stringify({
          seen: [],
          pending: {
            key: "onboarding-fluid",
            expiresAt: Date.now() + 60000,
            payload: {
              v: 2,
              userId: user,
              source: "routine",
              category: "fluids",
              slot: "morning",
            },
          },
        }),
      );
      Object.assign(window, { summarySeen: false });
      new MutationObserver(() => {
        if (
          document.querySelector(
            '[data-testid="summary-widget-default-weight"]',
          )
        )
          Object.assign(window, { summarySeen: true });
      }).observe(document, { childList: true, subtree: true });
    },
    { intentKey, user },
  );
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByLabel("Preferred name", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => Boolean(JSON.parse(localStorage.getItem(key)!).pending),
      intentKey,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Set up later", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Start tracking", exact: true })
    .click();
  await expect(page).toHaveURL(/\/water$/);
  await expect(page.getByTestId("sustain-entry-cover")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "summarySeen"))).toBe(
    false,
  );
  expect(backend.tables.hydration_entries ?? []).toHaveLength(0);
});

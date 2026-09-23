import type { Page } from "@playwright/test";
import { test, expect, signIn } from "./fixture";
const key = "healthapp.account-deletion-pending";
const user = "11111111-1111-4111-8111-111111111111";
const token = "22222222-2222-4222-8222-222222222222".repeat(2);
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
async function openDelete(page: Page) {
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage Account", exact: true })
    .click();
  await button(page, "Delete Account").click();
  await page
    .getByLabel("Current password for account deletion", { exact: true })
    .fill("synthetic-password");
  await page
    .getByLabel("Type DELETE to confirm", { exact: true })
    .fill("DELETE");
}

test("missing deletion function leaves the dialog dismissible and creates no pending request", async ({
  page,
  backend,
}, info) => {
  void backend;
  const actions: string[] = [];
  await page.route("**/functions/v1/delete-account", (route) => {
    actions.push(route.request().postDataJSON().action);
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Requested function was not found" },
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await openDelete(page);
  // A compact visual viewport approximates the space remaining above a keyboard.
  await page.setViewportSize({ width: 390, height: 390 });
  const sheet = page.getByTestId("settings-sheet");
  const bounds = await sheet.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(391);
  await button(page, "Permanently delete account").click();
  await expect(
    page.getByText(
      "Account deletion is temporarily unavailable. Please try again later.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(actions).toEqual(["status"]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), key),
  ).toBeNull();
  await page.screenshot({
    path: info.outputPath("deletion-compact-viewport.png"),
  });
  await button(page, "Dismiss Delete account?").click();
  await expect(sheet).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await expect(page.getByText("Hi Review,", { exact: true })).toBeVisible();
});

test("an old stuck deletion can exit to sign-in and is cleared only after server cancellation", async ({
  page,
  backend,
}) => {
  void backend;
  let available = false;
  const actions: string[] = [];
  await page.route("**/functions/v1/delete-account", (route) => {
    const { action, token: received } = route.request().postDataJSON();
    expect(received).toBe(token);
    actions.push(action);
    if (!available)
      return route.fulfill({
        status: 404,
        json: {
          code: "NOT_FOUND",
          message: "Requested function was not found",
        },
      });
    return action === "cancel"
      ? route.fulfill({ json: { cancelled: true } })
      : route.fulfill({ status: 404, json: { code: "not_started" } });
  });
  await page.goto("/sign-in");
  await page.evaluate(
    ({ key, user, token }) =>
      localStorage.setItem(key, JSON.stringify({ user, token })),
    { key, user, token },
  );
  await page.reload();
  await expect(button(page, "Sign in")).toBeVisible();
  expect(actions).toEqual([]);
  await button(page, "Resume account deletion").click();
  await button(page, "Continue deletion").click();
  await expect(
    page.getByText(
      "Account deletion is temporarily unavailable. Please try again later.",
      { exact: true },
    ),
  ).toBeVisible();
  await button(page, "Back to sign in").click();
  await expect(button(page, "Sign in")).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), key),
  ).not.toBeNull();
  await page.reload();
  await expect(button(page, "Sign in")).toBeVisible();
  available = true;
  await button(page, "Resume account deletion").click();
  await button(page, "Continue deletion").click();
  await expect(button(page, "Sign in")).toBeVisible();
  expect(actions).toEqual(["run", "run", "cancel"]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), key),
  ).toBeNull();
});

test("prepared deletion cannot be cancelled but can sign out without losing recovery", async ({
  page,
  backend,
}) => {
  void backend;
  await page.route("**/functions/v1/delete-account", (route) => {
    const { action } = route.request().postDataJSON();
    if (action === "status") return route.fulfill({ json: { ready: true } });
    if (action === "prepare")
      return route.fulfill({ json: { prepared: true } });
    if (action === "cancel")
      return route.fulfill({ json: { cancelled: false, prepared: true } });
    return route.fulfill({
      status: 503,
      json: { message: "Cleanup unavailable. Retry later." },
    });
  });
  await signIn(page);
  await openDelete(page);
  await button(page, "Permanently delete account").click();
  await expect(
    page.getByText("Cleanup unavailable. Retry later.", { exact: true }),
  ).toBeVisible();
  await button(page, "Cancel deletion request").click();
  await expect(
    page.getByText(/Deletion has already started and cannot be cancelled/),
  ).toBeVisible();
  await button(page, "Sign out").click();
  await expect(button(page, "Sign in")).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), key),
  ).not.toBeNull();
  await page.reload();
  await expect(button(page, "Sign in")).toBeVisible();
  await button(page, "Resume account deletion").click();
  await expect(button(page, "Continue deletion")).toBeVisible();
  await button(page, "Back to sign in").click();
});

test("welcome is first-use only and setup cannot run before sign-in", async ({
  page,
  backend,
}) => {
  void backend;
  await page.goto("/");
  await expect(
    page.getByText("Your health, in one place.", { exact: true }),
  ).toBeVisible();
  await button(page, "Already have an account? Sign in").click();
  await expect(page.getByText("Back to welcome", { exact: true })).toHaveCount(
    0,
  );
  await page.goto("/welcome");
  await expect(button(page, "Sign in")).toBeVisible();
  await page.goto("/onboarding");
  await expect(button(page, "Sign in")).toBeVisible();
  await signIn(page);
  await page.goto("/");
  await expect(button(page, "Sign in")).toBeVisible();
  await expect(
    page.getByText("Your health, in one place.", { exact: true }),
  ).toHaveCount(0);
});

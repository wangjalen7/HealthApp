import { expect, quickLog, signIn, test } from "./fixture";
import type { Page } from "@playwright/test";

async function openMeal(page: Page) {
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Estimate meal with AI from a photo or description",
      exact: true,
    })
    .click();
}

async function enlargeText(page: Page) {
  // Browser wrapping stress check; physical iOS Dynamic Type is a separate check.
  await page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("div,input,textarea,button"),
    ).filter((element) =>
      Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      ),
    );
    const sizes = elements.map((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    );
    elements.forEach((element, index) => {
      element.style.fontSize = `${sizes[index] * 1.5}px`;
      element.style.lineHeight = "1.5";
    });
  });
}

test("meal action authorizes sharing, details never send, and reopening keeps validation", async ({
  page,
  backend,
}, info) => {
  expect(backend.tables.profiles).toHaveLength(1);
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/functions/v1/estimate-meal")) requests++;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await quickLog(page, "Food");
  const ai = page.getByRole("button", {
    name: "Estimate meal with AI from a photo or description",
    exact: true,
  });
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 700 });
    const aiBox = (await ai.boundingBox())!;
    for (const name of [
      "Find or add food",
      "Scan barcode",
      "Create food label",
    ]) {
      const box = (await page
        .getByRole("button", { name, exact: true })
        .boundingBox())!;
      expect(Math.abs(box.height - aiBox.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.width - aiBox.width)).toBeLessThanOrEqual(1);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await ai.click();
  const consent = page.getByRole("switch", {
    name: "Send meal to OpenAI",
    exact: true,
  });
  const submit = page.getByRole("button", {
    name: "Estimate foods",
    exact: true,
  });
  await expect(consent).toHaveCount(0);
  await page
    .getByLabel("Meal description", { exact: true })
    .fill("Rice and chicken");
  await expect(submit).toBeEnabled();
  await expect(
    page.getByText(/Estimate foods sends this meal description/),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("meal-light.png") });
  const details = page.getByRole("button", {
    name: "AI privacy details",
    exact: true,
  });
  await details.click();
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText(/Cancelling cannot recall a sent request/),
  ).toBeVisible();
  await expect(consent).toHaveCount(0);
  await expect(submit).toBeEnabled();
  await details.click();
  await expect(submit).toBeEnabled();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await enlargeText(page);
  await submit.scrollIntoViewIfNeeded();
  const box = await submit.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: info.outputPath("meal-dark-320-enlarged.png"),
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await openMeal(page);
  await expect(consent).toHaveCount(0);
  await expect(submit).toBeDisabled();
  await expect(
    page.getByLabel("Meal description", { exact: true }),
  ).toHaveValue("");
  expect(requests).toBe(0);
});

test("planner action sends once, keeps inline optional history and actionable errors", async ({
  page,
  backend,
}, info) => {
  expect(backend.tables.profiles).toHaveLength(1);
  let requests = 0;
  await page.route("**/functions/v1/coach-chat", async (route) => {
    requests++;
    const body = route.request().postDataJSON();
    expect(body.includeTrainingHistory).toBe(false);
    expect(body.workoutPreferences.limitations).toBe("");
    await route.fulfill({
      status: 400,
      json: {
        code: "invalid_timezone",
        message:
          "Your device time zone is invalid. Check your device's date and time settings, then try again.",
      },
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await quickLog(page, "Workout");
  await page
    .getByRole("button", { name: "Plan workout with AI", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const consent = page.getByRole("switch", {
    name: "Send preferences to OpenAI",
    exact: true,
  });
  const history = page.getByRole("switch", {
    name: "Include my workout history",
    exact: true,
  });
  await expect(consent).toHaveCount(0);
  await expect(history).not.toBeChecked();
  await expect(
    page.getByText(/Generate workout plan sends your preferences/),
  ).toHaveCount(0);
  expect(requests).toBe(0);
  await page
    .getByRole("button", { name: "AI privacy details", exact: true })
    .click();
  await expect(consent).toHaveCount(0);
  await page
    .getByRole("button", { name: "AI privacy details", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await enlargeText(page);
  await history.scrollIntoViewIfNeeded();
  const toggleBox = (await history.boundingBox())!;
  const labelBox = (await page
    .getByText("Include my workout history (optional)", { exact: true })
    .boundingBox())!;
  expect(
    Math.abs(
      toggleBox.y + toggleBox.height / 2 - labelBox.y - labelBox.height / 2,
    ),
  ).toBeLessThan(2);
  await page.screenshot({
    path: info.outputPath("planner-dark-320-enlarged.png"),
  });
  await page
    .getByRole("button", { name: "Generate workout plan", exact: true })
    .click();
  await expect(
    page.getByText(/Your device time zone is invalid/),
  ).toBeVisible();
  await expect(consent).toHaveCount(0);
  await expect(history).not.toBeChecked();
  expect(requests).toBe(1);
});

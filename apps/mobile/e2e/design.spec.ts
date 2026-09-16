import { test, expect, signIn, quickLog } from "./fixture";

test("compact forms retain focus, text, validation and reachable sheet actions", async ({
  page,
  backend,
}, testInfo) => {
  void backend;
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("sign-in-320.png") });
  await page.getByText("New here? Create an account").click();
  const firstName = page.getByLabel("First name", { exact: true });
  await firstName.fill("Alexandra");
  await expect(firstName).toBeFocused();
  await page.getByLabel("Last name", { exact: true }).fill("Review");
  await expect(firstName).toHaveValue("Alexandra");
  for (const field of [
    firstName,
    page.getByLabel("Last name", { exact: true }),
  ]) {
    const bounds = (await field.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  }
  expect(
    (await page
      .getByRole("textbox", { name: "Email", exact: true })
      .boundingBox())!.width,
  ).toBeGreaterThan(260);
  await page.screenshot({ path: testInfo.outputPath("sign-up-320.png") });

  await signIn(page);
  for (const title of ["Summary", "History", "AI Coach", "Profile"]) {
    const label = page
      .getByRole("tab", { name: title, exact: true })
      .getByText(title, { exact: true });
    const bounds = await label.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568 - 3);
  }
  await page.getByRole("button", { name: "Create a new health log" }).click();
  await page
    .getByRole("button", { name: "Open Reminders", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Open Reminders", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("quick-log-short-screen.png"),
  });
  await page.getByRole("button", { name: "Close create menu" }).click();

  await quickLog(page, "Food");
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await page
    .getByRole("button", { name: "Create food label", exact: true })
    .click();
  await page
    .getByLabel("Food name", { exact: true })
    .fill("Compact screen oats");
  await page.getByLabel("Weight per serving", { exact: true }).fill("40");
  await page.getByLabel("Calories", { exact: true }).fill("150");
  const protein = page.getByLabel("Protein (g)", { exact: true });
  await protein.fill("5.5");
  await expect(protein).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("label-editor-320.png") });
  await page
    .getByRole("button", { name: "Continue to amount", exact: true })
    .click();
  await page.getByRole("button", { name: "Add to meal", exact: true }).click();
  await expect(
    page.getByText("Compact screen oats", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(
    page.getByText("Choose a meal first.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("meal-validation-320.png"),
  });
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByText("Discard unfinished meal?")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Keep meal", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("discard-dialog-320.png"),
  });
  await page.getByRole("button", { name: "Keep meal", exact: true }).click();
  await expect(
    page.getByText("Compact screen oats", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

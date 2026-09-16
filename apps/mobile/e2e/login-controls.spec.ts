import { test, expect, signIn } from "./fixture";

test("login reveals passwords, remembers the account and centers the brand", async ({
  page,
  backend,
}, testInfo) => {
  void backend;
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/sign-in");
  await expect(page.getByText("Welcome back")).toHaveCount(0);
  await expect(page.getByText("Your health, all in one place.")).toHaveCount(0);
  const brand = await page
    .getByText("HealthApp", { exact: true })
    .boundingBox();
  expect(brand!.x + brand!.width / 2).toBeCloseTo(160, 0);
  expect(brand!.y).toBeLessThan(150);
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("synthetic-password");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveJSProperty("type", "text");
  await expect(password).toHaveValue("synthetic-password");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("synthetic-password");
  const remember = page.getByRole("switch", { name: "Remember me" });
  await expect(remember).not.toBeChecked();
  await remember.check();
  await expect(remember).toBeChecked();
  await page.getByLabel("Email", { exact: true }).fill("review@example.com");
  await page.screenshot({ path: testInfo.outputPath("login-320.png") });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Hi Review,", { exact: true })).toBeVisible();
  const signOut = async () => {
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
  };
  await signOut();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "review@example.com",
  );
  await expect(remember).toBeChecked();
  await remember.uncheck();
  await password.fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Hi Review,", { exact: true })).toBeVisible();
  await signOut();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(remember).not.toBeChecked();
});

test("Summary indicates sync in flight and clears it on failure or completion", async ({
  page,
  backend,
}) => {
  void backend;
  await signIn(page);
  const sync = page.getByRole("button", { name: "Sync now" });
  await expect(sync).toBeEnabled();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/vital_samples?**", async (route) => {
    await gate;
    await route.fulfill({
      status: 400,
      json: { message: "Synthetic sync unavailable" },
    });
  });
  try {
    await sync.click();
    await expect(page.getByLabel("Syncing summary")).toBeVisible();
    await expect(sync).toBeDisabled();
  } finally {
    release();
  }
  await expect(
    page.getByText("Sync waiting: Synthetic sync unavailable"),
  ).toBeVisible();
  await expect(sync).toBeEnabled();
  await expect(page.getByLabel("Syncing summary")).toHaveCount(0);
  await page.unroute("**/rest/v1/vital_samples?**");
  await sync.click();
  await expect(sync).toBeEnabled();
  await expect(
    page.getByText("Sync waiting: Synthetic sync unavailable"),
  ).toHaveCount(0);
});

import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { test, expect, signIn } from "./fixture";
import type { Page } from "@playwright/test";
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const row = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp("^" + name + "(?:,|$)") });
async function profile(page: Page) {
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
}

test("Profile groups saved values and opens focused destinations without landing-page forms", async ({
  page,
  backend,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await profile(page);
  await expect(
    page.getByRole("tab", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(row(page, "Calories")).toHaveAccessibleName(
    "Calories, 2,200 kcal/day",
  );
  await expect(row(page, "Blood Pressure")).toHaveAccessibleName(
    "Blood Pressure, 120/80 mmHg",
  );
  await page.screenshot({
    path: info.outputPath("profile-390.png"),
    fullPage: true,
  });
  await row(page, "Calories").click();
  await expect(
    page.getByText("Current daily goal", { exact: true }),
  ).toBeVisible();
  await button(page, "Edit Manually").click();
  await expect(page.getByLabel("Calories / day", { exact: true })).toHaveValue(
    "2200",
  );
  await page.getByLabel("Calories / day", { exact: true }).fill("2300");
  await button(page, "Cancel").click();
  await button(page, "Keep editing").click();
  await expect(page.getByLabel("Calories / day", { exact: true })).toHaveValue(
    "2300",
  );
  backend.tables.profiles[0].daily_protein_goal = 180;
  await button(page, "Save goal").click();
  await expect
    .poll(() => backend.tables.profiles[0].daily_calorie_goal)
    .toBe(2300);
  expect(backend.tables.profiles[0].daily_protein_goal).toBe(180);
  await button(page, "Back to Profile").click();
  await expect(row(page, "Calories")).toHaveAccessibleName(
    "Calories, 2,300 kcal/day",
  );
  await row(page, "Personal Details").click();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue(
    "Review",
  );
  await page.getByLabel("Preferred name", { exact: true }).fill("Jay");
  await button(page, "Back to Profile").click();
  await expect(
    page.getByText("Your unsaved edits will be discarded."),
  ).toBeVisible();
  await button(page, "Keep editing").click();
  await button(page, "Save details").click();
  await expect(row(page, "Personal Details")).toHaveAccessibleName(
    "Personal Details, Jay",
  );
  expect(backend.tables.profiles[0].first_name).toBe("Review");
  await row(page, "Appearance").click();
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await button(page, "Done").click();
  await expect(row(page, "Appearance")).toHaveAccessibleName(
    "Appearance, Dark",
  );
  await row(page, "Units").click();
  await page.getByRole("radio", { name: "kg · cm", exact: true }).click();
  await page.getByRole("radio", { name: "Milliliters", exact: true }).click();
  await button(page, "Save units").click();
  await expect(row(page, "Fluids")).toHaveAccessibleName("Fluids, 2400 mL/day");
  expect(backend.tables.profiles[0].weight_goal_lb).toBe(180);
  await expect(page.getByTestId("profile-landing")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await page.setViewportSize({ width: 320, height: 568 });
  await page.screenshot({
    path: info.outputPath("profile-320.png"),
    fullPage: true,
  });
  await row(page, "Manage Account").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("profile-health-security-320.png"),
  });
  await row(page, "Apple Health").scrollIntoViewIfNeeded();
  const before = await page
    .getByTestId("profile-landing")
    .evaluate((el) => el.scrollTop);
  await row(page, "Apple Health").click();
  await expect(button(page, "Connect Apple Health")).toBeDisabled();
  await button(page, "Back to Profile").click();
  expect(
    await page.getByTestId("profile-landing").evaluate((el) => el.scrollTop),
  ).toBe(before);
  await expect(row(page, "Reminders")).toHaveCount(0);
  await row(page, "Face ID").click();
  await expect(button(page, "Enable Face ID")).toHaveCount(0);
  await button(page, "Back to Profile").click();
  await page.reload();
  await page.getByLabel("Email", { exact: true }).fill("review@example.com");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await button(page, "Sign in").click();
  await expect(page.getByText("Hi Jay,", { exact: true })).toBeVisible();
  await profile(page);
  await expect(row(page, "Appearance")).toHaveAccessibleName(
    "Appearance, Dark",
  );
  await expect(row(page, "Fluids")).toHaveAccessibleName("Fluids, 2400 mL/day");
  await page.getByTestId("profile-landing").evaluate((el) => {
    el.scrollTop = 0;
    for (const leaf of el.querySelectorAll<HTMLElement>("div, span"))
      if (leaf.childElementCount === 0 && leaf.textContent?.trim()) {
        leaf.style.fontSize = "24px";
        leaf.style.lineHeight = "1.3";
      }
  });
  expect(
    await page
      .getByTestId("profile-landing")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("profile-large-text-320.png"),
  });
});

test("unset goals, automatic protein, validation and target edits preserve health records", async ({
  page,
  backend,
}) => {
  Object.assign(backend.tables.profiles[0], {
    daily_calorie_goal: null,
    daily_protein_goal: null,
    daily_water_goal_ml: null,
    weight_goal_lb: null,
    bp_systolic_goal: null,
    bp_diastolic_goal: null,
  });
  backend.tables.vital_samples = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      user_id: backend.tables.profiles[0].id,
      kind: "weight",
      value: 80,
      unit: "kg",
      source: "healthkit",
      version: 1,
      change_seq: 1,
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      deleted_at: null,
    },
  ];
  await signIn(page);
  await expect(page.getByRole("button", { name: /^Weight / })).toBeVisible();
  await profile(page);
  for (const label of ["Calories", "Fluids", "Weight", "Blood Pressure"])
    await expect(row(page, label)).toHaveAccessibleName(label + ", Not Set");
  await expect(row(page, "Protein")).toHaveAccessibleName(
    "Protein, Auto · 123 g/day",
  );
  await row(page, "Protein").click();
  await button(page, "Edit protein goal").click();
  await page.getByRole("radio", { name: "Custom", exact: true }).click();
  await page.getByLabel("Protein / day (g)", { exact: true }).fill("140");
  await button(page, "Save goal").click();
  await button(page, "Back to Profile").click();
  await expect(row(page, "Protein")).toHaveAccessibleName("Protein, 140 g/day");
  await row(page, "Blood Pressure").click();
  await button(page, "Edit blood pressure goal").click();
  await page.getByLabel("Systolic (mmHg)", { exact: true }).fill("301");
  await button(page, "Save goal").click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(backend.tables.profiles[0].bp_systolic_goal).toBeNull();
  await page.getByLabel("Systolic (mmHg)", { exact: true }).fill("125");
  await page.getByLabel("Diastolic (mmHg)", { exact: true }).fill("82");
  await button(page, "Save goal").click();
  await button(page, "Back to Profile").click();
  await expect(row(page, "Blood Pressure")).toHaveAccessibleName(
    "Blood Pressure, 125/82 mmHg",
  );
  await row(page, "Weight").click();
  await expect(
    page.getByText("Latest recorded weight", { exact: true }),
  ).toBeVisible();
  await button(page, "Edit target weight").click();
  await page.getByLabel("Target weight (lb)", { exact: true }).fill("170");
  await button(page, "Save goal").click();
  await expect.poll(() => backend.tables.profiles[0].weight_goal_lb).toBe(170);
  expect(backend.tables.vital_samples).toHaveLength(1);
  expect(backend.tables.profiles[0].daily_protein_goal).toBe(140);
  expect(backend.tables.profiles[0].daily_calorie_goal).toBeNull();
});

test("profile read failures can retry and personal save failures retain the edit", async ({
  page,
  backend,
}) => {
  await signIn(page);
  backend.failReads = { profiles: { code: "offline", message: "Offline" } };
  await profile(page);
  await expect(
    page.getByText("Goals could not be loaded. Retry when connected."),
  ).toBeVisible();
  await row(page, "Personal Details").click();
  await expect(button(page, "Retry personal details")).toBeVisible();
  expect(await page.getByRole("textbox").count()).toBe(0);
  backend.failReads = {};
  await button(page, "Retry personal details").click();
  await page.getByLabel("First name", { exact: true }).fill("Retry");
  backend.failNextWrite = "profiles";
  await button(page, "Save details").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue(
    "Retry",
  );
  await button(page, "Save details").click();
  await expect(row(page, "Personal Details")).toHaveAccessibleName(
    "Personal Details, Retry Tester",
  );
});

test("Export uses one action and includes photo files only when selected", async ({
  page,
  backend,
}) => {
  const bytes = Buffer.from("synthetic-photo");
  backend.tables.progress_photos = [
    {
      id: "photo-one",
      user_id: backend.tables.profiles[0].id,
      object_path: "synthetic/photo.jpg",
      local_day: "2026-09-22",
      byte_size: bytes.length,
    },
  ];
  let downloads = 0;
  await page.route("**/storage/v1/**", async (route) => {
    downloads++;
    await route.fulfill({ contentType: "image/jpeg", body: bytes });
  });
  await signIn(page);
  await profile(page);
  await row(page, "Export Data").click();
  await expect(page.getByText(/1 progress photo/)).toBeVisible();
  for (const photos of [false, true]) {
    if (photos)
      await page
        .getByRole("switch", { name: "Include Progress Photos", exact: true })
        .check();
    const downloading = page.waitForEvent("download");
    await button(page, "Export").click();
    const download = await downloading;
    const files = unzipSync(await readFile((await download.path())!));
    expect(files["full-data.json"]).toBeDefined();
    expect(files["csv/profiles.csv"]).toBeDefined();
    const data = JSON.parse(strFromU8(files["full-data.json"]));
    expect(data.datasets.progress_photos).toHaveLength(1);
    expect(
      Object.keys(files).filter((k) => k.startsWith("progress-photos/")),
    ).toHaveLength(photos ? 1 : 0);
    await expect(
      page.getByText("Export finished.", { exact: true }),
    ).toBeVisible();
  }
  expect(downloads).toBe(1);
});

test("enrolled devices identify this device and require confirmation for global sign out", async ({
  page,
  backend,
}) => {
  expect(backend.tables.profiles).toHaveLength(1);
  const actions: string[] = [];
  let devices = [
    {
      id: "enrolled-one",
      device_id: "synthetic-device",
      device_name: "Test iPhone",
      created_at: "2026-09-01T12:00:00Z",
      last_used_at: "2026-09-22T12:00:00Z",
      expires_at: "2027-09-01T12:00:00Z",
    },
  ];
  await page.route("**/functions/v1/biometric-auth", async (route) => {
    const body = route.request().postDataJSON();
    actions.push(body.action);
    if (body.action === "revoke") devices = [];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        body.action === "list" ? { devices } : { success: true },
      ),
    });
  });
  await signIn(page);
  await page.evaluate(() =>
    localStorage.setItem("healthapp.biometric-device-id", "synthetic-device"),
  );
  await profile(page);
  await row(page, "Enrolled Devices").click();
  await expect(
    page.getByText("Test iPhone · This device", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Expires/)).toBeVisible();
  await button(page, "Sign out all devices").click();
  expect(actions).not.toContain("revokeAll");
  await button(page, "Cancel").click();
  await button(page, "Revoke Face ID login").click();
  await expect(
    page.getByText("No devices are enrolled.", { exact: true }),
  ).toBeVisible();
  expect(actions).toContain("revoke");
  await button(page, "Sign out all devices").click();
  await button(page, "Confirm sign out all devices").click();
  await expect(button(page, "Sign in")).toBeVisible();
  expect(actions).toContain("revokeAll");
});

test("Profile has no Reminders row and centers the wrapped sync label beside its status", async ({
  page,
  backend,
}, info) => {
  void backend;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await profile(page);
  await expect(row(page, "Reminders")).toHaveCount(0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const sync = row(page, "Sync & Pending Changes");
    await sync.scrollIntoViewIfNeeded();
    await expect(sync.getByText("Up to Date", { exact: true })).toBeVisible();
    const geometry = await sync
      .getByText("Sync & Pending Changes", { exact: true })
      .evaluate((label) => {
        const a = label.getBoundingClientRect();
        const b =
          label.parentElement!.lastElementChild!.getBoundingClientRect();
        return {
          centerDifference: Math.abs(a.y + a.height / 2 - b.y - b.height / 2),
          horizontalGap: b.x - a.x - a.width,
        };
      });
    expect(geometry.centerDifference).toBeLessThan(2);
    expect(geometry.horizontalGap).toBeGreaterThanOrEqual(0);
    await page.screenshot({
      path: info.outputPath("sync-centered-" + width + ".png"),
    });
  }
});

import { test, expect, signIn, quickLog } from "./fixture";
const user = "11111111-1111-4111-8111-111111111111";
const layoutKey = `healthapp:summary-layout:${user}`;

test("Steps is discoverable before connection, persists in Summary and opens from Workout while hidden", async ({
  page,
  backend,
}) => {
  expect(backend.tables.profiles).toHaveLength(1);
  await signIn(page);
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await page.getByRole("button", { name: "Add Steps", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: /Steps.*Available on iPhone/ })
    .click();
  await expect(
    page.getByText("Apple Health steps are available in the iPhone app.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next steps period", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await signIn(page);
  expect(
    await page.evaluate(
      (k) =>
        JSON.parse(localStorage.getItem(k)!).widgets.some(
          (w: { type: string }) => w.type === "steps",
        ),
      layoutKey,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: /Steps.*Available on iPhone/ })
    .click();
  await page
    .getByRole("button", { name: "Back from Steps", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page
    .getByRole("button", { name: "Customize Steps", exact: true })
    .click();
  await page.getByRole("radio", { name: "Steps Large", exact: true }).click();
  await page.getByRole("button", { name: "Move earlier", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to layout", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await signIn(page);
  const configured = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).widgets,
    layoutKey,
  );
  expect(configured[configured.length - 2].type).toBe("steps");
  expect(configured[configured.length - 2].size).toBe("wide");
  await page.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await page
    .getByRole("button", { name: "Customize Steps", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove Steps", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await signIn(page);
  expect(
    await page.evaluate(
      (k) =>
        JSON.parse(localStorage.getItem(k)!).widgets.some(
          (w: { type: string }) => w.type === "steps",
        ),
      layoutKey,
    ),
  ).toBe(false);
  await quickLog(page, "Workout");
  await page.getByRole("button", { name: "Steps", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Steps", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back from Steps", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Workout", exact: true }),
  ).toBeVisible();
});

test("cached steps show true counts, completed-day averages, chart popovers and historical navigation", async ({
  page,
  backend,
}, info) => {
  await page.clock.setFixedTime(new Date("2026-10-11T16:00:00Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  backend.tables.profiles[0]!.daily_step_goal = 8000;
  await page.goto("/sign-in");
  await page.evaluate(
    ({ user, layoutKey }) => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const daily = [6000, 0, null, 9000, 12000, 3000, 15000].map(
        (total, i) => ({
          start: new Date(2026, 9, 5 + i).toISOString(),
          end: new Date(2026, 9, 6 + i).toISOString(),
          total,
          availability: total === null ? "missing" : "available",
          refreshedAt: new Date().toISOString(),
        }),
      );
      const hourly = Array.from({ length: 12 }, (_, hour) => ({
        start: new Date(2026, 9, 11, hour).toISOString(),
        end: new Date(2026, 9, 11, hour + 1).toISOString(),
        total: hour === 1 ? null : hour * 100,
        availability: hour === 1 ? "missing" : "available",
        refreshedAt: new Date().toISOString(),
      }));
      localStorage.setItem(
        `healthapp:steps:v1:${user}:${zone}`,
        JSON.stringify({ version: 1, zone, connected: true, daily, hourly }),
      );
      localStorage.setItem(
        layoutKey,
        JSON.stringify({
          version: 1,
          widgets: [{ id: "steps", type: "steps", size: "wide", config: {} }],
        }),
      );
    },
    { user, layoutKey },
  );
  await signIn(page);
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await page.getByRole("button", { name: /Steps.*15,000/ }).click();
  await expect(
    page.getByText("15,000", { exact: false }).first(),
  ).toBeVisible();
  const chart = page.getByTestId("steps-chart");
  const before = (await chart.boundingBox())!;
  await chart.click({
    position: { x: (before.width * 3.5) / 24, y: before.height - 10 },
  });
  const popup = page.getByTestId("steps-chart-popover");
  await expect(popup).toContainText("300 steps");
  await chart.focus();
  await chart.press("ArrowLeft");
  await expect(popup).toContainText("200 steps");
  await chart.press("ArrowLeft");
  await expect(popup).toContainText("No step data");
  const popupBox = (await popup.boundingBox())!;
  expect(popupBox.y).toBeGreaterThanOrEqual(before.y);
  expect(popupBox.y + popupBox.height).toBeLessThan(before.y + before.height);
  await expect(
    page.getByRole("button", { name: "Select next step bar", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select previous step bar", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Review Apple Health access",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Tap the chart to explore", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Missing days are excluded/)).toHaveCount(0);
  for (const range of ["W", "M", "6M", "Y", "D"]) {
    await page.getByRole("tab", { name: range, exact: true }).click();
    await expect
      .poll(async () => Math.abs((await chart.boundingBox())!.y - before.y))
      .toBeLessThanOrEqual(1);
    await expect(popup).toHaveCount(0);
    const box = (await chart.boundingBox())!;
    await chart.click({ position: { x: box.width * 0.9, y: box.height - 10 } });
    expect(
      Math.abs((await chart.boundingBox())!.y - before.y),
    ).toBeLessThanOrEqual(1);
  }
  await page.getByRole("tab", { name: "W", exact: true }).click();
  await expect(page.getByText("6,000 steps", { exact: true })).toBeVisible();
  await expect(
    page.getByText("5 completed days", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("slider")).toHaveAttribute(
    "aria-label",
    /0 steps/,
  );
  await page
    .getByRole("button", { name: "Previous steps period", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Next steps period", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /Return to current period/ }).click();
  await page.getByRole("tab", { name: "M", exact: true }).click();
  await expect(
    page.getByText("5 completed days", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("sustain-entry-cover")).toHaveCount(0);
  await chart.click({
    position: { x: ((await chart.boundingBox())!.width * 5.5) / 31, y: 200 },
  });
  await expect(popup).toContainText("0 steps");
  await page.screenshot({
    path: info.outputPath("steps-month-light.png"),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({
    path: info.outputPath("steps-month-dark-320.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>("div,button"),
    )) {
      if (
        Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        )
      ) {
        element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * 1.5}px`;
        element.style.lineHeight = "1.4";
      }
    }
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("steps-dark-320-enlarged.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Steps Goal", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to Steps", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Steps", exact: true }).last(),
  ).toBeVisible();
});

test("optional step goal adds, validates, edits and removes through existing synced goals", async ({
  page,
  backend,
}) => {
  const before = { ...backend.tables.profiles[0] };
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page.getByRole("button", { name: /^Steps,/ }).click();
  await expect(page.getByText("Not Set", { exact: true }).last()).toBeVisible();
  await page
    .getByRole("button", { name: "Edit step goal", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Steps / day", exact: true })
    .fill("0");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(
    page.getByText(
      "Enter a positive whole number of steps, or leave blank to remove the goal.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Steps / day", exact: true })
    .fill("8000");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(
    page.getByText("8,000 steps/day", { exact: true }).last(),
  ).toBeVisible();
  await page.reload();
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page.getByRole("button", { name: /^Steps,/ }).click();
  await expect(
    page.getByText("8,000 steps/day", { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit step goal", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Steps / day", exact: true })
    .fill("9000");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(
    page.getByText("9,000 steps/day", { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit step goal", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Steps / day", exact: true })
    .fill("");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(page.getByText("Not Set", { exact: true }).last()).toBeVisible();
  expect(backend.tables.profiles[0]!.daily_step_goal).toBeNull();
  for (const [key, value] of Object.entries(before))
    expect(backend.tables.profiles[0]![key]).toEqual(value);
});

test("Apple Health settings consolidates step access without a separate Steps button", async ({
  page,
  backend,
}) => {
  expect(backend.tables.profiles).toHaveLength(1);
  await signIn(page);
  await page.getByRole("tab", { name: "Profile", exact: true }).first().click();
  await page.getByRole("button", { name: /^Apple Health,/ }).click();
  await expect(
    page.getByText(/Read steps, weight, blood pressure and paired pulse/),
  ).toBeVisible();
  await expect(page.getByText(/Step totals stay on this device/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Steps", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Steps connects separately/)).toHaveCount(0);
});

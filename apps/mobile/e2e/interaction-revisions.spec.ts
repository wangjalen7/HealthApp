import { test, expect, signIn, quickLog } from "./fixture";

test("water glass follows saved totals, goal changes and goal completion", async ({
  page,
  backend,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  backend.tables.profiles[0].daily_water_goal_ml = 1000;
  await signIn(page);
  await quickLog(page, "Water");
  await page.getByRole("radio", { name: "Water", exact: true }).click();
  const glass = page.getByRole("progressbar", { name: "Daily water goal" });
  await expect(glass).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("radio", { name: "mL", exact: true }).click();
  await page.getByLabel("Fluid amount", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(glass).toHaveAttribute("aria-valuenow", "50");
  await expect(page.getByTestId("water-glass-fill")).toHaveCSS(
    "height",
    "50px",
  );
  await page.screenshot({ path: testInfo.outputPath("water-half-full.png") });
  await page.getByLabel("Fluid amount", { exact: true }).fill("750");
  backend.failNextWrite = "hydration_entries";
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(
    page.getByText("Test connection unavailable. Try again."),
  ).toBeVisible();
  await expect(glass).toHaveAttribute("aria-valuenow", "50");
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(glass).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByText("Daily goal reached")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("water-goal-reached.png"),
  });
  backend.tables.profiles[0].daily_water_goal_ml = 2500;
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await quickLog(page, "Water");
  await page.getByRole("radio", { name: "Water", exact: true }).click();
  await expect(glass).toHaveAttribute("aria-valuenow", "50");
  backend.tables.profiles[0].daily_water_goal_ml = null;
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await quickLog(page, "Water");
  await page.getByRole("radio", { name: "Water", exact: true }).click();
  await expect(glass).toHaveAttribute("aria-valuetext", "No water goal set");
});

test("single-side rows align with regular exercises and save both sides", async ({
  page,
  backend,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await signIn(page);
  await quickLog(page, "Workout");
  await page.getByRole("button", { name: "Chest", exact: true }).click();
  for (const [index, name] of ["Single arm press", "Bench press"].entries()) {
    await page
      .getByRole("button", { name: "Add exercise", exact: true })
      .click();
    const card = page.getByTestId(/^exercise-card-/).nth(index);
    await card.getByLabel("Exercise name", { exact: true }).fill(name);
    await card.getByLabel("Number of sets", { exact: true }).fill("2");
    await card.getByLabel("Set 1 reps", { exact: true }).fill("10");
    await card.getByLabel("Set 2 reps", { exact: true }).fill("9");
    await card
      .getByLabel("Working weight in pounds", { exact: true })
      .fill("20");
    if (index === 0) {
      await card.getByLabel("Right side set 1 reps").fill("8");
      await card.getByLabel("Right side set 2 reps").fill("7");
      await card.getByLabel("Right side working weight in pounds").fill("25");
    }
  }
  const cards = page.getByTestId(/^exercise-card-/);
  await expect(page.getByText(/Single-side exercise detected/)).toHaveCount(0);
  await expect(page.getByText("Side", { exact: true })).toHaveCount(0);
  const left = (await cards
    .first()
    .getByLabel("Set 1 reps", { exact: true })
    .boundingBox())!;
  const right = (await cards
    .first()
    .getByLabel("Right side set 1 reps")
    .boundingBox())!;
  const regular = (await cards
    .nth(1)
    .getByLabel("Set 1 reps", { exact: true })
    .boundingBox())!;
  const secondRep = (await cards
    .first()
    .getByLabel("Set 2 reps", { exact: true })
    .boundingBox())!;
  expect(left.y).toBeCloseTo(secondRep.y, 0);
  expect(left.x).toBeCloseTo(right.x, 0);
  expect(left.x).toBeCloseTo(regular.x, 0);
  const leftWeight = (await cards
    .first()
    .getByLabel("Working weight in pounds", { exact: true })
    .boundingBox())!;
  const rightWeight = (await cards
    .first()
    .getByLabel("Right side working weight in pounds")
    .boundingBox())!;
  expect(leftWeight.x).toBeCloseTo(rightWeight.x, 0);
  expect(leftWeight.y).toBeCloseTo(left.y, 0);
  expect(rightWeight.y).toBeCloseTo(right.y, 0);
  expect(leftWeight.height).toBeCloseTo(left.height, 0);
  expect(rightWeight.height).toBeCloseTo(right.height, 0);
  // Focus must scroll both sides together when the set list overflows.
  const firstCard = cards.first();
  await firstCard.getByLabel("Number of sets", { exact: true }).fill("6");
  for (const label of [
    "Set 6 reps",
    "Right side set 3 reps",
    "Right side set 6 reps",
  ]) {
    await firstCard.getByLabel(label, { exact: true }).fill("12");
    for (const set of [1, 3, 6]) {
      const l = (await firstCard
        .getByLabel(`Set ${set} reps`, { exact: true })
        .boundingBox())!;
      const r = (await firstCard
        .getByLabel(`Right side set ${set} reps`, { exact: true })
        .boundingBox())!;
      expect(l.x).toBeCloseTo(r.x, 0);
      expect(l.width).toBeCloseTo(r.width, 0);
    }
  }
  await firstCard.getByLabel("Number of sets", { exact: true }).fill("2");

  expect(leftWeight.x + leftWeight.width).toBeLessThan(320);
  await cards.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("single-side-320.png") });
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page.getByText(/Workout saved/)).toBeVisible();
  expect(
    backend.tables.workout_sets
      .slice(0, 2)
      .map((row) => [row.reps, row.weight, row.right_reps, row.right_weight]),
  ).toEqual([
    [10, 20, 8, 25],
    [9, 20, 7, 25],
  ]);
  await page
    .getByRole("button", { name: "View workout history", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit workout", exact: true }).click();
  const editLeft = page.getByLabel("Set 1 reps", { exact: true }).first();
  const editRight = page.getByLabel("Right side set 1 reps", { exact: true });
  await editRight.fill("11");
  expect((await editLeft.boundingBox())!.x).toBeCloseTo(
    (await editRight.boundingBox())!.x,
    0,
  );
  await expect(editLeft).toHaveValue("10");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(() =>
      backend.tables.workout_sets.some(
        (row) =>
          row.exercise_name === "Single arm press" &&
          row.reps === 10 &&
          row.right_reps === 11,
      ),
    )
    .toBe(true);
});

test("repeated diagonal chart touches pan without vertical page movement", async ({
  page,
  backend,
}) => {
  void backend;
  await signIn(page);
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const charts = page.getByTestId("vital-chart-gesture");
  for (const index of [0, 1]) {
    const chart = charts.nth(index);
    await chart.scrollIntoViewIfNeeded();
    const initial = (await chart.boundingBox())!;
    let previousText = await chart.innerText();
    for (const dy of [35, -40, 55]) {
      const bounds = (await chart.boundingBox())!;
      const x = bounds.x + bounds.width * 0.35;
      const y = bounds.y + bounds.height * 0.5;
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 10; step++) {
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: x + (step <= 2 ? step * 2 : step * 9),
              y:
                y +
                Math.sign(dy) *
                  (step <= 2
                    ? step * 10
                    : 20 + ((Math.abs(dy) - 20) * (step - 2)) / 8),
            },
          ],
        });
      }
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect
        .poll(async () => (await chart.boundingBox())!.y)
        .toBeCloseTo(initial.y, 0);
      await expect.poll(() => chart.innerText()).not.toBe(previousText);
      previousText = await chart.innerText();
    }
  }
  const last = charts.last();
  const before = (await last.boundingBox())!;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: before.x + 100, y: before.y + 80 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await page.mouse.move(10, 100);
  await page.mouse.wheel(0, -180);
  await expect
    .poll(async () => (await last.boundingBox())!.y)
    .toBeGreaterThan(before.y + 30);
  await client.detach();
});

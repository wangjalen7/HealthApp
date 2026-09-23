import { expect, quickLog, signIn, test } from "./fixture";

const user = "11111111-1111-4111-8111-111111111111";
test.use({ timezoneId: "America/New_York" });

test("quick fluid amounts leave drink selection and classification to the user", async ({
  page,
  backend,
}, testInfo) => {
  await signIn(page);
  await quickLog(page, "Water");
  await expect(
    page.getByText("Quick fluid amount", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "12 fluid ounces", exact: true })
    .click();
  await expect(page.getByLabel("Fluid amount", { exact: true })).toHaveValue(
    "12",
  );
  await expect(
    page.getByRole("radio", { name: "Water", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(page.getByLabel("Fluid name", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(
    page.getByText("Choose a drink category.", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.hydration_entries ?? []).toHaveLength(0);
  await page.getByRole("radio", { name: "Other", exact: true }).click();
  await page
    .getByRole("radio", { name: "Contains alcohol", exact: true })
    .click();
  await page.getByLabel("Fluid name", { exact: true }).fill("Evening drink");
  await page.getByRole("radio", { name: "mL", exact: true }).click();
  await page
    .getByRole("radio", { name: "8 fluid ounces", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Other", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("radio", { name: "Contains alcohol", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Fluid name", { exact: true })).toHaveValue(
    "Evening drink",
  );
  await expect(page.getByLabel("Fluid amount", { exact: true })).toHaveValue(
    "8",
  );
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect.poll(() => backend.tables.hydration_entries?.length).toBe(1);
  expect(backend.tables.hydration_entries[0]).toMatchObject({
    fluid_name: "Evening drink",
    category_id: "other",
    alcohol_status: "alcoholic",
  });
  expect(Number(backend.tables.hydration_entries[0].volume_ml)).toBeCloseTo(
    236.6,
    0,
  );
  await page
    .getByRole("heading", { name: "Daily fluids", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("fluid-date-and-quick-amount.png"),
  });
});

test("lifting and cardio keep a shared header in place and preserve independent dates", async ({
  page,
  backend,
}, testInfo) => {
  void backend;
  await page.clock.setFixedTime(new Date("2026-09-23T16:00:00Z"));
  await signIn(page);
  await quickLog(page, "Workout");
  const date = page
    .getByLabel("Entry date", { exact: true })
    .filter({ visible: true });
  const ai = page.getByRole("button", {
    name: "Plan workout with AI",
    exact: true,
  });
  const tabs = page.getByLabel("Workout type", { exact: true });
  await date.fill("2026-09-22");
  const positions = async () =>
    Promise.all(
      [date, ai, tabs].map(async (item) => {
        const box = await item.boundingBox();
        expect(box).not.toBeNull();
        return box;
      }),
    );
  const lifting = await positions();
  expect(lifting[0]!.y).toBeLessThan(lifting[1]!.y);
  expect(lifting[1]!.y).toBeLessThan(lifting[2]!.y);
  await expect(
    page.getByRole("button", { name: "Choose entry date" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("lifting-shared-header.png"),
  });
  await page.getByRole("tab", { name: "Cardio", exact: true }).click();
  await expect(date).toHaveValue("2026-09-23");
  expect(await positions()).toEqual(lifting);
  await date.fill("2026-09-21");
  await page.getByRole("radio", { name: "walk", exact: true }).click();
  await page.getByLabel("Minutes", { exact: true }).fill("25");
  await page.screenshot({
    path: testInfo.outputPath("cardio-shared-header.png"),
  });
  await page.getByRole("tab", { name: "Lifting", exact: true }).click();
  await expect(date).toHaveValue("2026-09-22");
  expect(await positions()).toEqual(lifting);
  await page.getByRole("tab", { name: "Cardio", exact: true }).click();
  await expect(date).toHaveValue("2026-09-21");
  await expect(page.getByLabel("Minutes", { exact: true })).toHaveValue("25");
  expect(await positions()).toEqual(lifting);
});

test("weight, BP and fluids save the selected date and default back to today", async ({
  page,
  backend,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-23T16:00:00Z"));
  await signIn(page);
  await quickLog(page, "Weight");
  await expect(
    page.getByLabel("Entry date", { exact: true }).filter({ visible: true }),
  ).toHaveValue("2026-09-23");
  await page
    .getByLabel("Entry date", { exact: true })
    .filter({ visible: true })
    .fill("2026-09-22");
  await page.getByLabel("Weight (lb)", { exact: true }).fill("175");
  await page.getByRole("button", { name: "Save weight", exact: true }).click();
  await expect(
    page
      .getByText("Saved and synced.", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  expect(String(backend.tables.vital_samples[0].occurred_at).slice(0, 10)).toBe(
    "2026-09-22",
  );
  await expect(
    page.getByLabel("Entry date", { exact: true }).filter({ visible: true }),
  ).toHaveValue("2026-09-23");
  await quickLog(page, "Blood pressure");
  await page
    .getByLabel("Entry date", { exact: true })
    .filter({ visible: true })
    .fill("2026-09-21");
  await page.getByLabel("Systolic", { exact: true }).fill("120");
  await page.getByLabel("Diastolic", { exact: true }).fill("80");
  await page
    .getByRole("button", { name: "Save blood pressure", exact: true })
    .click();
  await expect(
    page
      .getByText("Saved and synced.", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  const bp = backend.tables.vital_samples.filter((r) => r.kind !== "weight");
  expect(bp).toHaveLength(2);
  expect(bp[0].occurred_at).toBe(bp[1].occurred_at);
  expect(String(bp[0].occurred_at).slice(0, 10)).toBe("2026-09-21");
  await quickLog(page, "Water");
  await page.getByRole("radio", { name: "Water", exact: true }).click();
  await page
    .getByLabel("Entry date", { exact: true })
    .filter({ visible: true })
    .fill("2026-09-22");
  await page.getByLabel("Fluid amount", { exact: true }).fill("8");
  backend.loseNextResponse = "hydration_entries";
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save fluid", exact: true }),
  ).toBeEnabled();
  await expect.poll(() => backend.tables.hydration_entries?.length).toBe(1);
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(page.getByText("Fluid saved.", { exact: true })).toBeVisible();
  expect(backend.tables.hydration_entries).toHaveLength(1);
  expect(
    String(backend.tables.hydration_entries[0].occurred_at).slice(0, 10),
  ).toBe("2026-09-22");
  await page
    .getByLabel("Entry date", { exact: true })
    .filter({ visible: true })
    .fill("2026-09-24");
  await page.getByLabel("Fluid amount", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Save fluid", exact: true }).click();
  await expect(
    page.getByText("Choose today or an earlier entry date.", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.hydration_entries).toHaveLength(1);
});

test("meal, lifting and cardio drafts retain selected dates through reload and save", async ({
  page,
  backend,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-23T16:00:00Z"));
  await page.goto("/sign-in");
  await page.evaluate((user) => {
    localStorage.setItem(
      `healthapp:nutrition-draft:${user}`,
      JSON.stringify({
        mealType: "lunch",
        entries: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Date test food",
            source: "manual",
            amount: 1,
            unit: "serving",
            servingCount: 1,
            nutrientsPerServing: { calories: 400, proteinGrams: 25 },
            totalNutrients: { calories: 400, proteinGrams: 25 },
            entryMethod: "basic",
            saveToMyFoods: false,
          },
        ],
      }),
    );
    localStorage.setItem(
      `healthapp:workout-draft:${user}`,
      JSON.stringify({
        muscleGroups: ["Chest"],
        notes: "",
        location: "",
        entries: [
          {
            id: "lift",
            name: "Date test press",
            muscleGroup: "Chest",
            setCount: 1,
            reps: [10],
            weight: 25,
          },
        ],
      }),
    );
  }, user);
  await signIn(page);
  await quickLog(page, "Food");
  await page
    .getByLabel("Entry date", { exact: true })
    .filter({ visible: true })
    .fill("2026-09-22");
  await expect
    .poll(() =>
      page.evaluate(
        (user) =>
          JSON.parse(localStorage.getItem(`healthapp:nutrition-draft:${user}`)!)
            .entryDay,
        user,
      ),
    )
    .toBe("2026-09-22");
  await signIn(page);
  await quickLog(page, "Food");
  await expect(
    page.getByLabel("Entry date", { exact: true }).filter({ visible: true }),
  ).toHaveValue("2026-09-22");
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  expect(
    String(backend.tables.nutrition_entries[0].occurred_at).slice(0, 10),
  ).toBe("2026-09-22");
  await quickLog(page, "Workout");
  await page
    .getByLabel("Entry date", { exact: true })
    .filter({ visible: true })
    .fill("2026-09-22");
  await expect
    .poll(() =>
      page.evaluate(
        (user) =>
          JSON.parse(localStorage.getItem(`healthapp:workout-draft:${user}`)!)
            .entryDay,
        user,
      ),
    )
    .toBe("2026-09-22");
  await signIn(page);
  await quickLog(page, "Workout");
  await expect(
    page.getByLabel("Entry date", { exact: true }).filter({ visible: true }),
  ).toHaveValue("2026-09-22");
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(
    page.getByText(
      "Workout saved. New exercise names will be suggested next time.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    String(backend.tables.workout_sessions[0].completed_at).slice(0, 10),
  ).toBe("2026-09-22");
  await page.getByRole("tab", { name: "Cardio", exact: true }).click();
  await page.getByRole("radio", { name: "walk", exact: true }).click();
  await page.getByLabel("Minutes", { exact: true }).fill("25");
  await page
    .getByLabel("Entry date", { exact: true })
    .filter({ visible: true })
    .fill("2026-09-21");
  await expect
    .poll(() =>
      page.evaluate(
        (user) =>
          JSON.parse(localStorage.getItem(`healthapp:cardio-draft:${user}`)!)
            .entryDay,
        user,
      ),
    )
    .toBe("2026-09-21");
  await signIn(page);
  await quickLog(page, "Workout");
  await page.getByRole("tab", { name: "Cardio", exact: true }).click();
  await expect(
    page.getByLabel("Entry date", { exact: true }).filter({ visible: true }),
  ).toHaveValue("2026-09-21");
  await page.getByRole("button", { name: "Save cardio", exact: true }).click();
  await expect(
    page.getByText("Cardio activity saved.", { exact: true }),
  ).toBeVisible();
  expect(
    String(backend.tables.cardio_entries[0].occurred_at).slice(0, 10),
  ).toBe("2026-09-21");
});

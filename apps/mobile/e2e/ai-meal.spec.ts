import { test, expect, signIn, quickLog } from "./fixture";
import type { Page } from "@playwright/test";

async function openAiEstimator(page: Page) {
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Estimate meal with AI from a photo or description",
      exact: true,
    })
    .click();
}

const estimate = {
  inputType: "meal",
  explanation:
    "Estimated from the described cooked foods. Check the portions and cooking oil.",
  items: [
    {
      name: "Cooked pasta",
      description: "Plain cooked pasta without sauce",
      portionAmount: 1,
      portionUnit: "serving",
      servingLabel: "1 serving (200 g)",
      servingWeightGrams: 200,
      servingVolumeMl: null,
      householdQuantityPerServing: null,
      householdUnit: null,
      confidence: "medium",
      assumptions: "Cooked weight estimated from two cups",
      nutrientsPerServing: {
        calories: 316,
        proteinGrams: 11.6,
        carbohydrateGrams: 62,
        fatGrams: 1.8,
        fiberGrams: 3.6,
        sugarGrams: 1.2,
        sodiumMg: 2,
      },
    },
    {
      name: "Tomato sauce",
      description: "Tomato sauce with seasoning",
      portionAmount: 1,
      portionUnit: "serving",
      servingLabel: "1 serving (120 g)",
      servingWeightGrams: 120,
      servingVolumeMl: null,
      householdQuantityPerServing: null,
      householdUnit: null,
      confidence: "low",
      assumptions: "Typical prepared sauce",
      nutrientsPerServing: {
        calories: 72,
        proteinGrams: 1.8,
        carbohydrateGrams: 9.6,
        fatGrams: 3,
        fiberGrams: 2.4,
        sugarGrams: 6,
        sodiumMg: 420,
      },
    },
    {
      name: "Grilled chicken",
      description: "Cooked skinless chicken breast",
      portionAmount: 1,
      portionUnit: "serving",
      servingLabel: "1 serving (150 g)",
      servingWeightGrams: 150,
      servingVolumeMl: null,
      householdQuantityPerServing: null,
      householdUnit: null,
      confidence: "medium",
      assumptions: "No additional oil",
      nutrientsPerServing: {
        calories: 248,
        proteinGrams: 46.5,
        carbohydrateGrams: 0,
        fatGrams: 5.4,
        fiberGrams: 0,
        sugarGrams: 0,
        sodiumMg: 111,
      },
    },
  ],
};

const dumplingEstimate = {
  inputType: "meal",
  explanation: "Estimated from the stated dumpling count.",
  items: [
    {
      name: "pork dumplings",
      description: "Steamed pork dumplings",
      portionAmount: 8,
      portionUnit: "household",
      servingLabel: "1 dumpling (25 g)",
      servingWeightGrams: 25,
      servingVolumeMl: null,
      householdQuantityPerServing: 1,
      householdUnit: "dumpling",
      confidence: "high",
      assumptions: "Typical steamed dumpling",
      nutrientsPerServing: {
        calories: 80,
        proteinGrams: 4,
        carbohydrateGrams: 8,
        fatGrams: 3.5,
        fiberGrams: 0.5,
        sugarGrams: 0.5,
        sodiumMg: 160,
      },
    },
  ],
};

test("AI text meal creates separate editable labels and exact saved portions", async ({
  page,
  backend,
}, testInfo) => {
  await signIn(page);
  let calls = 0;
  await page.route("**/functions/v1/estimate-meal", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.description).toContain("pasta");
    expect(body.consent).toBe(true);
    expect(body.imageBase64).toBeUndefined();
    await route.fulfill({ json: estimate });
  });
  await quickLog(page, "Food");
  await openAiEstimator(page);
  await page
    .getByLabel("Meal description", { exact: true })
    .fill("2 cups pasta, tomato sauce, and 150g chicken");
  await expect(
    page.getByRole("button", { name: "Estimate foods", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Allow AI meal processing" })
    .click();
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await expect(page.getByText("Review 3 estimated foods")).toBeVisible();
  await page
    .getByLabel("Food 1 name", { exact: true })
    .fill("Whole wheat pasta");
  await page
    .getByLabel("Food 1 description", { exact: true })
    .fill("Cooked whole wheat pasta, no oil");
  await page
    .getByLabel("Food 1 portion (serving)", { exact: true })
    .fill("0.5");
  await page.getByLabel("Food 1 Calories (kcal)", { exact: true }).fill("300");
  await expect(
    page.getByText("150 estimated calories in this portion", { exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`ai-review-${width}.png`),
    });
  }
  await page
    .getByRole("button", { name: "Add foods to meal", exact: true })
    .click();
  await page.getByRole("radio", { name: "dinner", exact: true }).click();
  await expect(page.getByText("470 calories", { exact: true })).toBeVisible();
  await expect(
    page
      .getByText("Whole wheat pasta", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  expect(backend.tables.nutrition_entries).toHaveLength(3);
  expect(backend.tables.user_food_profiles).toHaveLength(3);
  const pasta = backend.tables.nutrition_entries.find(
    (row) => row.food_name === "Whole wheat pasta",
  )!;
  expect(pasta).toMatchObject({
    quantity: 0.5,
    quantity_unit: "serving",
    calories: 150,
    nutrition_source: "ai",
    entry_method: "ai",
    serving_count: 0.5,
  });
  expect(pasta.note).toBe("AI estimate (medium confidence).");
  expect(
    backend.tables.user_food_profiles.find(
      (row) => row.food_name === "Whole wheat pasta",
    ),
  ).toMatchObject({
    description: "Cooked whole wheat pasta, no oil",
    source: "ai",
    is_user_corrected: true,
    serving_weight_grams: 200,
    calories_per_serving: 300,
  });
});

test("AI count estimate saves an editable number of food items", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await quickLog(page, "Food");
  await openAiEstimator(page);
  await page
    .getByLabel("Meal description", { exact: true })
    .fill("8 pork dumplings");
  await page
    .getByRole("checkbox", { name: "Allow AI meal processing" })
    .click();
  let estimateCalls = 0;
  await page.route("**/functions/v1/estimate-meal", (route) => {
    estimateCalls += 1;
    const response =
      estimateCalls === 1
        ? dumplingEstimate
        : {
            ...dumplingEstimate,
            items: [
              {
                ...dumplingEstimate.items[0],
                name: "steamed pork dumplings",
                description: "Steamed dumplings with pork",
              },
            ],
          };
    return route.fulfill({ json: response });
  });
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await expect(page.getByText("Nutrition for 1 dumpling (25 g)")).toBeVisible();
  await expect(
    page.getByLabel("Food 1 portion (dumplings)", { exact: true }),
  ).toHaveValue("8");
  await page
    .getByLabel("Food 1 portion (dumplings)", { exact: true })
    .fill("6");
  await expect(
    page.getByText("480 estimated calories in this portion", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add foods to meal", exact: true })
    .click();
  await page.getByRole("radio", { name: "dinner", exact: true }).click();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  expect(backend.tables.nutrition_entries).toHaveLength(1);
  expect(backend.tables.nutrition_entries[0]).toMatchObject({
    food_name: "Pork dumplings",
    quantity: 6,
    quantity_unit: "household",
    household_quantity_per_serving: 1,
    household_unit: "dumpling",
    serving_count: 6,
    consumed_weight_grams: 150,
    calories: 480,
  });
  backend.tables.user_food_profiles.push({
    ...backend.tables.user_food_profiles[0],
    id: "55555555-5555-4555-8555-555555555555",
    food_name: "Steamed pork dumplings",
    description: "Older duplicate estimate",
    is_user_corrected: false,
    archived_at: null,
    updated_at: "2026-09-10T12:00:00.000Z",
  });

  await openAiEstimator(page);
  await page
    .getByLabel("Meal description", { exact: true })
    .fill("8 steamed pork dumplings");
  await page
    .getByRole("checkbox", { name: "Allow AI meal processing" })
    .click();
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add foods to meal", exact: true })
    .click();
  await page.getByRole("radio", { name: "dinner", exact: true }).click();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  expect(estimateCalls).toBe(2);
  expect(
    backend.tables.user_food_profiles.filter((row) => !row.archived_at),
  ).toHaveLength(1);
  expect(
    backend.tables.user_food_profiles.find((row) => !row.archived_at)
      ?.food_name,
  ).toBe("Pork dumplings");
  expect(
    backend.tables.user_food_profiles.find(
      (row) => row.id === "55555555-5555-4555-8555-555555555555",
    )?.archived_at,
  ).toBeTruthy();
  expect(backend.tables.nutrition_entries).toHaveLength(2);
});

test("each AI food can independently skip its reusable label", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await quickLog(page, "Food");
  await openAiEstimator(page);
  await page
    .getByLabel("Meal description", { exact: true })
    .fill("pasta, tomato sauce, and grilled chicken");
  await page
    .getByRole("checkbox", { name: "Allow AI meal processing" })
    .click();
  await page.route("**/functions/v1/estimate-meal", (route) =>
    route.fulfill({ json: estimate }),
  );
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await expect(page.getByText("Review 3 estimated foods")).toBeVisible();
  const skippedLabel = page.getByLabel("Create reusable label for Food 2");
  await expect(skippedLabel).toBeChecked();
  await skippedLabel.click();
  await expect(skippedLabel).not.toBeChecked();
  await expect(
    page.getByLabel("Create reusable label for Food 1"),
  ).toBeChecked();
  await expect(
    page.getByLabel("Create reusable label for Food 3"),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Add foods to meal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Estimate a meal", exact: true }),
  ).not.toBeVisible();
  expect(backend.tables.user_food_profiles ?? []).toHaveLength(2);
  await page.getByRole("radio", { name: "dinner", exact: true }).click();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  expect(backend.tables.nutrition_entries).toHaveLength(3);
  expect(backend.tables.user_food_profiles ?? []).toHaveLength(2);
  expect(
    backend.tables.user_food_profiles.some(
      (profile) => profile.food_name === "Tomato sauce",
    ),
  ).toBe(false);
});

test("AI errors retain input, retry works, and cancel/close never adds foods", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await quickLog(page, "Food");
  await openAiEstimator(page);
  await page
    .getByLabel("Meal description", { exact: true })
    .fill("pasta with sauce and chicken");
  await page
    .getByRole("checkbox", { name: "Allow AI meal processing" })
    .click();
  let calls = 0;
  await page.route("**/functions/v1/estimate-meal", async (route) => {
    calls++;
    await route.fulfill(
      calls === 1
        ? {
            status: 503,
            json: {
              code: "not_configured",
              message:
                "AI meal estimation is not configured yet. You can still add food manually.",
            },
          }
        : { json: estimate },
    );
  });
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await expect(
    page.getByText(/AI meal estimation is not configured yet/),
  ).toBeVisible();
  await expect(
    page.getByLabel("Meal description", { exact: true }),
  ).toHaveValue("pasta with sauce and chicken");
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await expect(page.getByText("Review 3 estimated foods")).toBeVisible();
  await page
    .getByRole("button", { name: "Remove food 2", exact: true })
    .click();
  await expect(page.getByText("Review 2 estimated foods")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save meal", exact: true }),
  ).toBeDisabled();
  expect(backend.tables.nutrition_entries ?? []).toHaveLength(0);
  expect(backend.tables.user_food_profiles ?? []).toHaveLength(0);
});

test("AI photo is prepared as JPEG and sent with optional description", async ({
  page,
  backend,
}) => {
  void backend;
  await signIn(page);
  await quickLog(page, "Food");
  await openAiEstimator(page);
  const fileChooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose meal photo", exact: true })
    .click();
  // Synthetic one-pixel PNG exercises real browser image preparation, not food recognition.
  await (
    await fileChooser
  ).setFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT0kAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    page.getByRole("img", { name: "Selected meal photo" }),
  ).toBeVisible();
  await page
    .getByLabel("Meal description", { exact: true })
    .fill("Pasta, sauce and chicken; no butter");
  await page
    .getByRole("checkbox", { name: "Allow AI meal processing" })
    .click();
  let sent = false;
  await page.route("**/functions/v1/estimate-meal", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.imageBase64).toMatch(/^\/9j\//);
    expect(body.description).toContain("no butter");
    expect(body.consent).toBe(true);
    sent = true;
    await route.fulfill({ json: estimate });
  });
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await expect(page.getByText("Review 3 estimated foods")).toBeVisible();
  expect(sent).toBe(true);
});

test("AI rejects a non-food photo without creating food labels", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await quickLog(page, "Food");
  await openAiEstimator(page);
  const fileChooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose meal photo", exact: true })
    .click();
  await (
    await fileChooser
  ).setFiles({
    name: "not-food.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT0kAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByRole("checkbox", { name: "Allow AI meal processing" })
    .click();
  await page.route("**/functions/v1/estimate-meal", (route) =>
    route.fulfill({
      json: {
        ...estimate,
        inputType: "not_food",
        explanation: "A chair is visible.",
        // A defensive client check must discard labels even if a provider
        // contradicts its own classification.
        items: [estimate.items[0]],
      },
    }),
  );
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await expect(
    page.getByText(/does not appear to show food or a meal/),
  ).toBeVisible();
  await expect(page.getByText(/Review 1 estimated foods/)).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "Selected meal photo" }),
  ).toBeVisible();
  expect(backend.tables.user_food_profiles ?? []).toHaveLength(0);
});

test("cancelled AI response is ignored and existing meal portions survive another estimate", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await quickLog(page, "Food");
  await page.getByRole("radio", { name: "dinner", exact: true }).click();
  await openAiEstimator(page);
  await page.getByLabel("Meal description", { exact: true }).fill("pasta");
  await page
    .getByRole("checkbox", { name: "Allow AI meal processing" })
    .click();
  let release: (() => void) | undefined;
  let count = 0;
  await page.route("**/functions/v1/estimate-meal", async (route) => {
    count++;
    if (count === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({
      json: { ...estimate, items: [estimate.items[count === 3 ? 2 : 0]] },
    });
  });
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await expect.poll(() => !!release).toBe(true);
  await page
    .getByRole("button", { name: "Cancel estimation", exact: true })
    .click();
  release!();
  await expect(page.getByText(/Estimation stopped/)).toBeVisible();
  await expect(page.getByText(/Review 1 estimated foods/)).toHaveCount(0);
  expect(backend.tables.user_food_profiles ?? []).toHaveLength(0);
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await expect(page.getByText("Review 1 estimated foods")).toBeVisible();
  await page
    .getByRole("button", { name: "Add foods to meal", exact: true })
    .click();
  await expect(page.getByText("316 calories", { exact: true })).toBeVisible();
  expect(backend.tables.user_food_profiles).toHaveLength(1);
  await openAiEstimator(page);
  await page.getByLabel("Meal description", { exact: true }).fill("chicken");
  await page
    .getByRole("checkbox", { name: "Allow AI meal processing" })
    .click();
  await page
    .getByRole("button", { name: "Estimate foods", exact: true })
    .click();
  await expect(page.getByText("Review 1 estimated foods")).toBeVisible();
  await page
    .getByRole("button", { name: "Add foods to meal", exact: true })
    .click();
  await expect(page.getByText("564 calories", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  expect(backend.tables.nutrition_entries).toHaveLength(2);
  expect(
    backend.tables.nutrition_entries.every((row) => row.meal_type === "dinner"),
  ).toBe(true);
});

import { expect, quickLog, signIn, test } from "./fixture";

const userId = "11111111-1111-4111-8111-111111111111";

function foodProfile({
  id,
  name,
  calories,
  protein,
}: {
  id: string;
  name: string;
  calories: number;
  protein: number;
}) {
  return {
    id,
    user_id: userId,
    food_name: name,
    description: null,
    source: "manual_label",
    is_user_corrected: false,
    serving_label: "100 g",
    serving_weight_grams: 100,
    serving_volume_ml: null,
    household_quantity_per_serving: null,
    household_unit: null,
    servings_per_container: null,
    calories_per_serving: calories,
    protein_grams_per_serving: protein,
    carbohydrate_grams_per_serving: null,
    fat_grams_per_serving: null,
    fiber_grams_per_serving: null,
    sugar_grams_per_serving: null,
    sodium_mg_per_serving: null,
    archived_at: null,
    updated_at: new Date().toISOString(),
  };
}

test("creates a recipe from labels and logs a fraction of the whole batch", async ({
  page,
  backend,
}, testInfo) => {
  backend.tables.user_food_profiles = [
    foodProfile({
      id: "81000000-0000-4000-8000-000000000001",
      name: "Dry pasta",
      calories: 800,
      protein: 28,
    }),
    foodProfile({
      id: "81000000-0000-4000-8000-000000000002",
      name: "Ground beef",
      calories: 400,
      protein: 40,
    }),
  ];

  await signIn(page);
  await quickLog(page, "Food");
  await page.getByRole("radio", { name: "dinner", exact: true }).click();

  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  await page
    .getByRole("button", { name: "Create recipe", exact: true })
    .click();

  for (const name of ["Dry pasta", "Ground beef"]) {
    await page
      .getByRole("button", { name: "Add ingredient", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Find or add food", exact: true })
      .click();
    await page.getByLabel("Find or add food", { exact: true }).fill(name);
    await page.getByText(name, { exact: true }).click();
    await page
      .getByRole("button", { name: "Add to recipe", exact: true })
      .click();
    await expect(page.getByLabel("Food amount", { exact: true })).toBeHidden();
    await expect(
      page.getByText(name, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  }

  await page.getByLabel("Recipe name", { exact: true }).fill("Pasta bake");
  await page.getByLabel("Recipe servings", { exact: true }).fill("4");
  await expect(
    page.getByText("300 calories · 17g protein per serving"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(
    page
      .getByText("Pasta bake", { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect.poll(() => backend.tables.food_recipes?.length).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("saved-recipe.png") });
  expect(backend.tables.food_recipes[0]).toMatchObject({
    name: "Pasta bake",
    yield_servings: 4,
  });
  expect(backend.tables.food_recipes[0].ingredients).toHaveLength(2);

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Add food", exact: true }).click();
  await page
    .getByRole("button", { name: "Find or add food", exact: true })
    .click();
  await page
    .getByLabel("Find or add food", { exact: true })
    .fill("Pasta bake");
  await expect(page.getByText("Recipes", { exact: true })).toBeVisible();
  await page.getByText("Pasta bake", { exact: true }).click();
  await expect(page.getByText("Recipe: 4 servings total")).toBeVisible();
  await page.getByRole("radio", { name: "recipe", exact: true }).click();
  await page.getByLabel("Food amount", { exact: true }).fill("1/4");
  await expect(page.getByText("300 cal", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("recipe-amount.png") });
  await page.getByRole("button", { name: "Add to meal", exact: true }).click();

  await expect(
    page
      .getByText("Pasta bake", { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByText(/^0\.25 recipes/)).toBeVisible();
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  expect(backend.tables.nutrition_entries).toHaveLength(1);
  expect(backend.tables.nutrition_entries[0]).toMatchObject({
    recipe_id: backend.tables.food_recipes[0].id,
    food_name: "Pasta bake",
    entry_method: "recipe",
    quantity: 0.25,
    quantity_unit: "household",
    serving_count: 1,
    calories: 300,
    protein_grams: 17,
  });
  expect(backend.tables.user_food_profiles).toHaveLength(2);
});

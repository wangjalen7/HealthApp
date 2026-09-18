import { z } from "zod";

import {
  calculateFoodAmount,
  foodBasisSchema,
  formatFoodMeasurementAmount,
  mealDraftEntrySchema,
  type FoodBasis,
  type MealDraftEntry,
  type NutrientValues,
} from "./model";

const recipeIngredientsSchema = z
  .array(mealDraftEntrySchema)
  .min(1)
  .max(100)
  .refine(
    (ingredients) => ingredients.every((ingredient) => !ingredient.recipeId),
    "A recipe cannot contain another recipe.",
  );

export const foodRecipeInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).optional(),
  yieldServings: z.number().positive().max(10000),
  ingredients: recipeIngredientsSchema,
});
export type FoodRecipeInput = z.infer<typeof foodRecipeInputSchema>;

export const foodRecipeSchema = foodRecipeInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FoodRecipe = z.infer<typeof foodRecipeSchema>;

const optionalNutrients = [
  "carbohydrateGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "sodiumMg",
] as const;

export function recipeTotalNutrients(
  ingredients: MealDraftEntry[],
): NutrientValues {
  const parsed = recipeIngredientsSchema.parse(ingredients);
  const result: NutrientValues = {
    calories: parsed.reduce(
      (total, ingredient) => total + ingredient.totalNutrients.calories,
      0,
    ),
    proteinGrams: parsed.reduce(
      (total, ingredient) => total + ingredient.totalNutrients.proteinGrams,
      0,
    ),
  };
  for (const nutrient of optionalNutrients) {
    if (
      parsed.every(
        (ingredient) => ingredient.totalNutrients[nutrient] !== undefined,
      )
    ) {
      result[nutrient] = parsed.reduce(
        (total, ingredient) =>
          total + (ingredient.totalNutrients[nutrient] ?? 0),
        0,
      );
    }
  }
  return result;
}

export function recipeFoodBasis(recipeInput: FoodRecipeInput): FoodBasis {
  const recipe = foodRecipeInputSchema.parse(recipeInput);
  const totals = recipeTotalNutrients(recipe.ingredients);
  const perServing = (value: number | undefined) =>
    value === undefined ? undefined : value / recipe.yieldServings;
  const yieldLabel = formatFoodMeasurementAmount(recipe.yieldServings);
  return foodBasisSchema.parse({
    name: recipe.name,
    description: recipe.description,
    source: "manual",
    isUserCorrected: false,
    servingLabel:
      recipe.yieldServings === 1
        ? "1 serving (whole recipe)"
        : `1 serving (1 of ${yieldLabel} total)`,
    householdQuantityPerServing: 1 / recipe.yieldServings,
    householdUnit: "recipe",
    servingsPerContainer: recipe.yieldServings,
    nutrientsPerServing: {
      calories: perServing(totals.calories) ?? 0,
      proteinGrams: perServing(totals.proteinGrams) ?? 0,
      carbohydrateGrams: perServing(totals.carbohydrateGrams),
      fatGrams: perServing(totals.fatGrams),
      fiberGrams: perServing(totals.fiberGrams),
      sugarGrams: perServing(totals.sugarGrams),
      sodiumMg: perServing(totals.sodiumMg),
    },
  });
}

export function recipeMealDraftEntry(
  recipe: FoodRecipe,
  id: string,
): MealDraftEntry {
  const basis = recipeFoodBasis(recipe);
  return mealDraftEntrySchema.parse({
    ...basis,
    id,
    recipeId: recipe.id,
    amount: 1,
    unit: "serving",
    ...calculateFoodAmount(basis, 1, "serving"),
    entryMethod: "recipe",
    saveToMyFoods: false,
  });
}

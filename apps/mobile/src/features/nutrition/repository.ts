import { entryTimestamp } from "../../lib/entry-date";
import { serviceErrorMessage } from "../../lib/service-errors";
import { createRecords, changeRecord } from "../../lib/mutations";
import { collectPages } from "../../lib/pagination";
import { z } from "zod";
import { sameEstimatedFoodName } from "../../../../../supabase/functions/_shared/meal-estimate";

import { supabase } from "../../lib/supabase";
import { createId } from "../vitals/storage";
import { calorieTotalsByLocalDay, type DailyCalorieTotal } from "./calendar";
import {
  canonicalFoodBarcode,
  foodBasisSchema,
  foodProfileContentKey,
  foodUnitSchema,
  mealDraftEntrySchema,
  nutrientValuesSchema,
  type FoodBasis,
  type FoodUnit,
  type MealDraftEntry,
  type NutrientValues,
} from "./model";
import {
  foodRecipeInputSchema,
  foodRecipeSchema,
  recipeFoodBasis,
  type FoodRecipe,
  type FoodRecipeInput,
} from "./recipe";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const recipeSelect =
  "id, name, description, yield_servings, ingredients, created_at, updated_at" as const;

function rowRecipe(row: Record<string, unknown>): FoodRecipe {
  return foodRecipeSchema.parse({
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    yieldServings: Number(row.yield_servings),
    ingredients: row.ingredients,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  });
}

export async function getFoodRecipes(userId: string): Promise<FoodRecipe[]> {
  const { data, error } = await supabase
    .from("food_recipes")
    .select(recipeSelect)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(serviceErrorMessage(error));
  return (data ?? []).map((row) => rowRecipe(row));
}

export async function saveFoodRecipe(
  userId: string,
  input: FoodRecipeInput,
): Promise<FoodRecipe> {
  const recipe = foodRecipeInputSchema.parse(input);
  const rows = await createRecords(
    userId,
    "food_recipes",
    "recipe:create",
    recipe,
    () => [
      {
        id: recipe.id ?? createId(),
        name: recipe.name,
        description: recipe.description ?? null,
        yield_servings: recipe.yieldServings,
        ingredients: recipe.ingredients,
      },
    ],
  );
  return rowRecipe(rows[0]);
}

export async function archiveFoodRecipe(
  userId: string,
  recipeId: string,
): Promise<void> {
  const id = z.string().uuid().parse(recipeId);
  const { data, error } = await supabase
    .from("food_recipes")
    .select("version")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (error) throw new Error(serviceErrorMessage(error));
  await changeRecord(userId, "food_recipes", id, Number(data.version), {
    archived_at: new Date().toISOString(),
  });
}

const nullableNumber = z.number().min(0).nullable();
const barcodeProductSchema = z.object({
  catalogProductId: z.string().uuid(),
  name: z.string().min(1),
  brand: z.string().nullable(),
  barcode: z.string(),
  source: z.literal("open_food_facts"),
  sourceUrl: z.string().nullable(),
  servingLabel: z.string().nullable(),
  servingWeightGrams: nullableNumber,
  servingVolumeMl: nullableNumber,
  householdQuantityPerServing: nullableNumber,
  householdUnit: z.string().nullable(),
  servingsPerContainer: nullableNumber,
  nutrientsPerServing: z.object({
    calories: nullableNumber,
    proteinGrams: nullableNumber,
    carbohydrateGrams: nullableNumber,
    fatGrams: nullableNumber,
    fiberGrams: nullableNumber,
    sugarGrams: nullableNumber,
    sodiumMg: nullableNumber,
  }),
  complete: z.boolean(),
  cache: z.enum(["fresh", "refreshed", "stale"]),
});
export type BarcodeProduct = z.infer<typeof barcodeProductSchema>;

const foodBarcodeLookupCodeSchema = z.enum([
  "invalid_request",
  "invalid_barcode",
  "not_found",
  "unauthorized",
  "server_configuration",
  "provider_unavailable",
  "lookup_failed",
]);
export type FoodBarcodeLookupCode = z.infer<typeof foodBarcodeLookupCodeSchema>;

export class FoodBarcodeLookupError extends Error {
  constructor(
    public readonly code: FoodBarcodeLookupCode,
    message: string,
  ) {
    super(message);
    this.name = "FoodBarcodeLookupError";
  }
}

export async function resolveFoodBarcode(
  barcode: string,
  type: string,
): Promise<BarcodeProduct> {
  const { data, error } = await supabase.functions.invoke(
    "resolve-food-barcode",
    { body: { barcode, type } },
  );
  if (error) {
    let code: FoodBarcodeLookupCode = "lookup_failed";
    let message =
      "Could not reach barcode lookup. Check your connection and try again. If the scanned digits look wrong, type the barcode manually.";
    const context = (error as { context?: { json?: () => Promise<unknown> } })
      .context;
    if (context?.json) {
      try {
        const body = (await context.json()) as {
          code?: unknown;
          message?: unknown;
        };
        const parsedCode = foodBarcodeLookupCodeSchema.safeParse(body.code);
        if (parsedCode.success) code = parsedCode.data;
        if (typeof body.message === "string") message = body.message;
      } catch {
        // Keep the connection-focused fallback when no JSON body exists.
      }
    }
    throw new FoodBarcodeLookupError(code, message);
  }
  return barcodeProductSchema.parse(data);
}

const optionalNumber = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

function rowNutrients(row: Record<string, unknown>): NutrientValues {
  return nutrientValuesSchema.parse({
    calories: Number(row.calories_per_serving),
    proteinGrams: Number(row.protein_grams_per_serving),
    carbohydrateGrams: optionalNumber(row.carbohydrate_grams_per_serving),
    fatGrams: optionalNumber(row.fat_grams_per_serving),
    fiberGrams: optionalNumber(row.fiber_grams_per_serving),
    sugarGrams: optionalNumber(row.sugar_grams_per_serving),
    sodiumMg: optionalNumber(row.sodium_mg_per_serving),
  });
}

function rowBasis(row: Record<string, unknown>): FoodBasis {
  return foodBasisSchema.parse({
    profileId: String(row.id),
    version: optionalNumber(row.version),
    catalogProductId:
      row.catalog_product_id === null || row.catalog_product_id === undefined
        ? undefined
        : String(row.catalog_product_id),
    name: String(row.food_name),
    description: row.description ? String(row.description) : undefined,
    brand: row.brand ? String(row.brand) : undefined,
    barcode: row.barcode ? String(row.barcode) : undefined,
    source:
      row.source === "ai"
        ? "ai"
        : row.source === "open_food_facts"
          ? "open_food_facts"
          : "manual",
    isUserCorrected: Boolean(row.is_user_corrected),
    servingLabel: row.serving_label ? String(row.serving_label) : undefined,
    servingWeightGrams: optionalNumber(row.serving_weight_grams),
    servingVolumeMl: optionalNumber(row.serving_volume_ml),
    householdQuantityPerServing: optionalNumber(
      row.household_quantity_per_serving,
    ),
    householdUnit: row.household_unit ? String(row.household_unit) : undefined,
    servingsPerContainer: optionalNumber(row.servings_per_container),
    nutrientsPerServing: rowNutrients(row),
  });
}

const profileSelect =
  "id, version, catalog_product_id, food_name, description, brand, barcode, source, is_user_corrected, serving_label, serving_weight_grams, serving_volume_ml, household_quantity_per_serving, household_unit, servings_per_container, calories_per_serving, protein_grams_per_serving, carbohydrate_grams_per_serving, fat_grams_per_serving, fiber_grams_per_serving, sugar_grams_per_serving, sodium_mg_per_serving, archived_at, updated_at" as const;

export async function getFoodProfilesByIds(
  userId: string,
  profileIds: string[],
): Promise<FoodBasis[]> {
  const ids = [...new Set(profileIds.map((id) => z.string().uuid().parse(id)))];
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("user_food_profiles")
    .select(profileSelect)
    .eq("user_id", userId)
    .in("id", ids)
    .is("archived_at", null);
  if (error) throw new Error(serviceErrorMessage(error));
  return (data ?? []).map((row) => rowBasis(row));
}

function profileFields(userId: string, basis: FoodBasis) {
  return {
    user_id: userId,
    catalog_product_id: basis.catalogProductId ?? null,
    food_name: basis.name,
    description: basis.description ?? null,
    brand: basis.brand?.trim() || null,
    barcode: canonicalFoodBarcode(basis.barcode) ?? null,
    source: basis.source === "manual" ? "manual_label" : basis.source,
    is_user_corrected: basis.isUserCorrected,
    serving_label: basis.servingLabel?.trim() || null,
    serving_weight_grams: basis.servingWeightGrams ?? null,
    serving_volume_ml: basis.servingVolumeMl ?? null,
    household_quantity_per_serving: basis.householdQuantityPerServing ?? null,
    household_unit: basis.householdUnit?.trim() || null,
    servings_per_container: basis.servingsPerContainer ?? null,
    calories_per_serving: basis.nutrientsPerServing.calories,
    protein_grams_per_serving: basis.nutrientsPerServing.proteinGrams,
    carbohydrate_grams_per_serving:
      basis.nutrientsPerServing.carbohydrateGrams ?? null,
    fat_grams_per_serving: basis.nutrientsPerServing.fatGrams ?? null,
    fiber_grams_per_serving: basis.nutrientsPerServing.fiberGrams ?? null,
    sugar_grams_per_serving: basis.nutrientsPerServing.sugarGrams ?? null,
    sodium_mg_per_serving: basis.nutrientsPerServing.sodiumMg ?? null,
    archived_at: null,
    updated_at: new Date().toISOString(),
  };
}

export async function saveFoodProfile(
  userId: string,
  input: FoodBasis,
): Promise<FoodBasis> {
  const basis = foodBasisSchema.parse(input);
  if (basis.profileId) return basis;
  const canonicalBarcode = canonicalFoodBarcode(basis.barcode);
  let current: Record<string, unknown> | null = null;
  if (basis.catalogProductId) {
    const { data, error: currentError } = await supabase
      .from("user_food_profiles")
      .select(profileSelect)
      .eq("user_id", userId)
      .eq("catalog_product_id", basis.catalogProductId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    current = data;
  }
  if (!current && canonicalBarcode) {
    const { data, error: currentError } = await supabase
      .from("user_food_profiles")
      .select(profileSelect)
      .eq("user_id", userId)
      .eq("barcode", canonicalBarcode)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    current = data;
  }
  if (
    !current &&
    !basis.catalogProductId &&
    !canonicalBarcode &&
    basis.source === "ai"
  ) {
    const { data, error: currentError } = await supabase
      .from("user_food_profiles")
      .select(profileSelect)
      .eq("user_id", userId)
      .eq("source", "ai")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (currentError) throw new Error(currentError.message);
    const matches = (data ?? [])
      .filter((row) => sameEstimatedFoodName(String(row.food_name), basis.name))
      .sort((left, right) => {
        const corrected =
          Number(Boolean(right.is_user_corrected)) -
          Number(Boolean(left.is_user_corrected));
        if (corrected) return corrected;
        return (
          (Date.parse(String(right.updated_at ?? "")) || 0) -
          (Date.parse(String(left.updated_at ?? "")) || 0)
        );
      });
    current = matches[0] ?? null;
  }
  if (
    !current &&
    !basis.catalogProductId &&
    !canonicalBarcode &&
    basis.source !== "ai"
  ) {
    const { data, error: currentError } = await supabase
      .from("user_food_profiles")
      .select(profileSelect)
      .eq("user_id", userId)
      .eq("food_name", basis.name)
      .is("archived_at", null)
      .limit(50);
    if (currentError) throw new Error(currentError.message);
    const contentKey = foodProfileContentKey(basis);
    current =
      (data ?? []).find(
        (row) => foodProfileContentKey(rowBasis(row)) === contentKey,
      ) ?? null;
  }
  // Do not archive or overwrite another device's label as a side effect of logging.
  if (current && !basis.isUserCorrected && !current.archived_at)
    return rowBasis(current);
  if (current) {
    const rows = await changeRecord(
      userId,
      "user_food_profiles",
      String(current.id),
      basis.version ?? Number(current.version),
      profileFields(userId, basis),
    );
    return rowBasis(rows[0]);
  }
  const rows = await createRecords(
    userId,
    "user_food_profiles",
    `label:create:${basis.name}`,
    basis,
    () => [{ id: createId(), ...profileFields(userId, basis) }],
  );
  return rowBasis(rows[0]);
}

export async function updateFoodProfile(
  userId: string,
  input: FoodBasis,
): Promise<FoodBasis> {
  const basis = foodBasisSchema.parse(input);
  if (!basis.profileId) throw new Error("This food label cannot be updated.");
  const rows = await changeRecord(
    userId,
    "user_food_profiles",
    basis.profileId,
    basis.version ?? 0,
    profileFields(userId, basis),
  );
  return rowBasis(rows[0]);
}

export async function getFoodProfileByIdentity(
  userId: string,
  identity: { barcode?: string; catalogProductId?: string },
): Promise<FoodBasis | undefined> {
  let current: Record<string, unknown> | null = null;
  if (identity.catalogProductId) {
    const { data, error } = await supabase
      .from("user_food_profiles")
      .select(profileSelect)
      .eq("user_id", userId)
      .eq("catalog_product_id", identity.catalogProductId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Error(serviceErrorMessage(error));
    current = data;
  }
  const canonicalBarcode = canonicalFoodBarcode(identity.barcode);
  if (!current && canonicalBarcode) {
    const { data, error } = await supabase
      .from("user_food_profiles")
      .select(profileSelect)
      .eq("user_id", userId)
      .eq("barcode", canonicalBarcode)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Error(serviceErrorMessage(error));
    current = data;
  }
  return current ? rowBasis(current) : undefined;
}

export async function archiveFoodProfile(
  userId: string,
  profileId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("user_food_profiles")
    .select("version")
    .eq("user_id", userId)
    .eq("id", profileId)
    .single();
  if (error) throw new Error(serviceErrorMessage(error));
  await changeRecord(
    userId,
    "user_food_profiles",
    profileId,
    Number(data.version),
    { archived_at: new Date().toISOString() },
  );
}

export type FoodSuggestion = {
  key: string;
  kind: "recent" | "profile" | "recipe";
  basis: FoodBasis;
  defaultAmount: number;
  defaultUnit: FoodUnit;
  lastLoggedAt?: string;
  recipeId?: string;
};

function searchScore(name: string, brand: string | undefined, query: string) {
  if (!query) return 1;
  const value = `${name} ${brand ?? ""}`.trim().toLowerCase();
  const normalizedName = name.trim().toLowerCase();
  if (normalizedName === query) return 100;
  if (normalizedName.startsWith(query)) return 80;
  if (value.split(/\s+/).some((word) => word.startsWith(query))) return 60;
  if (value.includes(query)) return 40;
  return 0;
}

function divide(value: unknown, divisor: number) {
  const number = optionalNumber(value);
  return number === undefined ? undefined : number / divisor;
}

export async function getFoodSuggestions(
  userId: string,
  query: string,
): Promise<FoodSuggestion[]> {
  const [profilesResult, recentResult, recipes] = await Promise.all([
    supabase
      .from("user_food_profiles")
      .select(profileSelect)
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("nutrition_entries")
      .select(
        "id, food_profile_id, food_name, brand, barcode, serving_label, household_quantity_per_serving, household_unit, quantity, quantity_unit, serving_count, consumed_weight_grams, consumed_volume_ml, calories, protein_grams, carbohydrate_grams, fat_grams, fiber_grams, sugar_grams, sodium_mg, nutrition_source, entry_method, occurred_at",
      )
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(250),
    getFoodRecipes(userId),
  ]);
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (recentResult.error) throw new Error(recentResult.error.message);
  const normalized = query.trim().toLowerCase();
  const suggestions: FoodSuggestion[] = [];
  const seen = new Set<string>();
  const recentProfileIds = new Set<string>();
  const profileMap = new Map(
    (profilesResult.data ?? []).map((row) => [String(row.id), rowBasis(row)]),
  );
  for (const recipe of recipes) {
    const basis = recipeFoodBasis(recipe);
    if (!searchScore(basis.name, undefined, normalized)) continue;
    suggestions.push({
      key: `recipe:${recipe.id}`,
      kind: "recipe",
      basis,
      defaultAmount: 1,
      defaultUnit: "serving",
      recipeId: recipe.id,
    });
  }
  for (const row of recentResult.data ?? []) {
    if (row.entry_method === "recipe") continue;
    const servingCount = optionalNumber(row.serving_count) ?? 1;
    const unitResult = foodUnitSchema.safeParse(row.quantity_unit);
    const profileId = row.food_profile_id
      ? String(row.food_profile_id)
      : undefined;
    const fingerprint = profileId
      ? `profile:${profileId}`
      : [
          String(row.food_name).toLowerCase(),
          String(row.brand ?? "").toLowerCase(),
          Number(row.calories),
          Number(row.protein_grams),
          String(row.serving_label ?? ""),
        ].join("|");
    if (seen.has(fingerprint)) continue;
    const name = String(row.food_name);
    const brand = row.brand ? String(row.brand) : undefined;
    const score = searchScore(name, brand, normalized);
    if (!score) continue;
    if (
      row.nutrition_source === "ai" &&
      suggestions.some(
        (item) =>
          item.basis.source === "ai" &&
          sameEstimatedFoodName(item.basis.name, name),
      )
    )
      continue;
    seen.add(fingerprint);
    const savedBasis = profileId ? profileMap.get(profileId) : undefined;
    if (profileId && savedBasis) recentProfileIds.add(profileId);
    suggestions.push({
      key: `recent:${fingerprint}`,
      kind: "recent",
      basis:
        savedBasis ??
        foodBasisSchema.parse({
          profileId: savedBasis ? profileId : undefined,
          name,
          brand,
          barcode: row.barcode ? String(row.barcode) : undefined,
          source:
            row.nutrition_source === "ai"
              ? "ai"
              : row.nutrition_source === "open_food_facts"
                ? "open_food_facts"
                : "manual",
          isUserCorrected: false,
          servingLabel: row.serving_label
            ? String(row.serving_label)
            : undefined,
          servingWeightGrams: divide(row.consumed_weight_grams, servingCount),
          servingVolumeMl: divide(row.consumed_volume_ml, servingCount),
          householdQuantityPerServing: optionalNumber(
            row.household_quantity_per_serving,
          ),
          householdUnit: row.household_unit
            ? String(row.household_unit)
            : undefined,
          nutrientsPerServing: {
            calories: Number(row.calories) / servingCount,
            proteinGrams: Number(row.protein_grams) / servingCount,
            carbohydrateGrams: divide(row.carbohydrate_grams, servingCount),
            fatGrams: divide(row.fat_grams, servingCount),
            fiberGrams: divide(row.fiber_grams, servingCount),
            sugarGrams: divide(row.sugar_grams, servingCount),
            sodiumMg: divide(row.sodium_mg, servingCount),
          },
        }),
      defaultAmount: optionalNumber(row.quantity) ?? 1,
      defaultUnit: unitResult.success ? unitResult.data : "serving",
      lastLoggedAt: String(row.occurred_at),
    });
  }
  for (const row of profilesResult.data ?? []) {
    const id = String(row.id);
    if (recentProfileIds.has(id)) continue;
    const basis = rowBasis(row);
    if (!searchScore(basis.name, basis.brand, normalized)) continue;
    if (
      basis.source === "ai" &&
      suggestions.some(
        (item) =>
          item.basis.source === "ai" &&
          sameEstimatedFoodName(item.basis.name, basis.name),
      )
    )
      continue;
    suggestions.push({
      key: `profile:${id}`,
      kind: "profile",
      basis,
      defaultAmount:
        basis.householdQuantityPerServing && basis.householdUnit
          ? basis.householdQuantityPerServing
          : 1,
      defaultUnit:
        basis.householdQuantityPerServing && basis.householdUnit
          ? "household"
          : "serving",
    });
  }
  return suggestions
    .sort((left, right) => {
      const scoreDifference =
        searchScore(right.basis.name, right.basis.brand, normalized) -
        searchScore(left.basis.name, left.basis.brand, normalized);
      if (scoreDifference) return scoreDifference;
      return left.kind === "recent" ? -1 : 1;
    })
    .slice(0, 20);
}

export async function saveNutritionMeal(
  userId: string,
  mealType: MealType,
  foods: MealDraftEntry[],
  entryDay?: string,
) {
  const occurredAt = entryTimestamp(entryDay);
  const values = foods.map((food) => mealDraftEntrySchema.parse(food));
  if (!values.length) throw new Error("Add at least one food.");
  const profiledValues: MealDraftEntry[] = [];
  for (const food of values) {
    if (food.profileId || food.recipeId || food.saveToMyFoods === false) {
      profiledValues.push(food);
      continue;
    }
    const profile = await saveFoodProfile(userId, food);
    profiledValues.push(mealDraftEntrySchema.parse({ ...food, ...profile }));
  }
  const mealLogId = createId();
  await createRecords(
    userId,
    "nutrition_entries",
    "meal:create",
    { mealType, foods: values, entryDay },
    () =>
      profiledValues.map((food) => ({
        id: createId(),
        user_id: userId,
        meal_log_id: mealLogId,
        food_profile_id: food.profileId ?? null,
        recipe_id: food.recipeId ?? null,
        food_name: food.name,
        brand: food.brand ?? null,
        barcode: food.barcode ?? null,
        serving_label: food.servingLabel ?? null,
        household_quantity_per_serving:
          food.householdQuantityPerServing ?? null,
        household_unit: food.householdUnit ?? null,
        meal_type: mealType,
        quantity: food.amount,
        quantity_unit: food.unit,
        serving_count: food.servingCount,
        consumed_weight_grams: food.consumedWeightGrams ?? null,
        consumed_volume_ml: food.consumedVolumeMl ?? null,
        calories: food.totalNutrients.calories,
        protein_grams: food.totalNutrients.proteinGrams,
        carbohydrate_grams: food.totalNutrients.carbohydrateGrams ?? null,
        fat_grams: food.totalNutrients.fatGrams ?? null,
        fiber_grams: food.totalNutrients.fiberGrams ?? null,
        sugar_grams: food.totalNutrients.sugarGrams ?? null,
        sodium_mg: food.totalNutrients.sodiumMg ?? null,
        note: food.note ?? null,
        entry_method: food.entryMethod,
        nutrition_source: food.source,
        occurred_at: occurredAt,
        source: food.entryMethod === "barcode" ? "barcode" : "manual",
      })),
    true,
  );
}

export type FoodHistoryEntry = {
  id: string;
  version: number;
  foodName: string;
  brand?: string;
  mealType: MealType | "meal";
  calories: number;
  proteinGrams: number;
  carbohydrateGrams?: number;
  fatGrams?: number;
  fiberGrams?: number;
  sugarGrams?: number;
  sodiumMg?: number;
  amount: number;
  unit: FoodUnit;
  servingCount: number;
  consumedWeightGrams?: number;
  consumedVolumeMl?: number;
  servingLabel?: string;
  householdQuantityPerServing?: number;
  householdUnit?: string;
  note?: string;
  occurredAt: string;
  source: "manual" | "open_food_facts" | "import" | "ai";
  recipeId?: string;
  entryMethod:
    | "basic"
    | "history"
    | "profile"
    | "label"
    | "barcode"
    | "import"
    | "ai"
    | "recipe";
};

const foodHistorySelect =
  "id, version, recipe_id, food_name, brand, meal_type, calories, protein_grams, carbohydrate_grams, fat_grams, fiber_grams, sugar_grams, sodium_mg, quantity, quantity_unit, serving_count, consumed_weight_grams, consumed_volume_ml, serving_label, household_quantity_per_serving, household_unit, note, occurred_at, nutrition_source, entry_method" as const;

function foodHistoryEntry(row: Record<string, unknown>): FoodHistoryEntry {
  const unit = foodUnitSchema.safeParse(row.quantity_unit);
  return {
    id: String(row.id),
    version: Number(row.version),
    foodName: String(row.food_name),
    brand: row.brand ? String(row.brand) : undefined,
    mealType: ["breakfast", "lunch", "dinner", "snack"].includes(
      String(row.meal_type),
    )
      ? (row.meal_type as MealType)
      : "meal",
    calories: Number(row.calories),
    proteinGrams: Number(row.protein_grams),
    carbohydrateGrams: optionalNumber(row.carbohydrate_grams),
    fatGrams: optionalNumber(row.fat_grams),
    fiberGrams: optionalNumber(row.fiber_grams),
    sugarGrams: optionalNumber(row.sugar_grams),
    sodiumMg: optionalNumber(row.sodium_mg),
    amount: optionalNumber(row.quantity) ?? 1,
    unit: unit.success ? unit.data : "serving",
    servingCount: optionalNumber(row.serving_count) ?? 1,
    consumedWeightGrams: optionalNumber(row.consumed_weight_grams),
    consumedVolumeMl: optionalNumber(row.consumed_volume_ml),
    servingLabel: row.serving_label ? String(row.serving_label) : undefined,
    householdQuantityPerServing: optionalNumber(
      row.household_quantity_per_serving,
    ),
    householdUnit: row.household_unit ? String(row.household_unit) : undefined,
    note: row.note ? String(row.note) : undefined,
    occurredAt: String(row.occurred_at),
    source:
      row.nutrition_source === "ai"
        ? "ai"
        : row.nutrition_source === "open_food_facts"
          ? "open_food_facts"
          : row.nutrition_source === "import"
            ? "import"
            : "manual",
    recipeId: row.recipe_id ? String(row.recipe_id) : undefined,
    entryMethod: [
      "history",
      "profile",
      "label",
      "barcode",
      "import",
      "ai",
      "recipe",
    ].includes(String(row.entry_method))
      ? (row.entry_method as FoodHistoryEntry["entryMethod"])
      : "basic",
  };
}

const foodHistoryUpdateSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "meal"]),
  amount: z.number().positive().max(100000),
  unit: foodUnitSchema,
  servingCount: z.number().positive().max(100000),
  consumedWeightGrams: z.number().positive().max(100000).optional(),
  consumedVolumeMl: z.number().positive().max(100000).optional(),
  totalNutrients: nutrientValuesSchema,
  note: z.string().max(1000).optional(),
});
export type FoodHistoryUpdate = z.infer<typeof foodHistoryUpdateSchema>;

export async function getFoodHistory(
  userId: string,
): Promise<FoodHistoryEntry[]> {
  const data = await collectPages((after) => {
    let query = supabase
      .from("nutrition_entries")
      .select(foodHistorySelect)
      .eq("user_id", userId)
      .order("id")
      .limit(200);
    if (after) query = query.gt("id", after);
    return query;
  });
  data.sort(
    (a, b) =>
      b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id),
  );
  return (data ?? []).map((entry) => foodHistoryEntry(entry));
}

export async function getFoodById(
  userId: string,
  foodId: string,
): Promise<FoodHistoryEntry | undefined> {
  const id = z.string().uuid().parse(foodId);
  const { data, error } = await supabase
    .from("nutrition_entries")
    .select(foodHistorySelect)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(serviceErrorMessage(error));
  return data ? foodHistoryEntry(data) : undefined;
}

export async function updateFoodHistoryEntry(
  userId: string,
  foodId: string,
  version: number,
  input: FoodHistoryUpdate,
): Promise<void> {
  const id = z.string().uuid().parse(foodId);
  const value = foodHistoryUpdateSchema.parse(input);
  await changeRecord(userId, "nutrition_entries", id, version, {
    meal_type: value.mealType,
    quantity: value.amount,
    quantity_unit: value.unit,
    serving_count: value.servingCount,
    consumed_weight_grams: value.consumedWeightGrams ?? null,
    consumed_volume_ml: value.consumedVolumeMl ?? null,
    calories: value.totalNutrients.calories,
    protein_grams: value.totalNutrients.proteinGrams,
    carbohydrate_grams: value.totalNutrients.carbohydrateGrams ?? null,
    fat_grams: value.totalNutrients.fatGrams ?? null,
    fiber_grams: value.totalNutrients.fiberGrams ?? null,
    sugar_grams: value.totalNutrients.sugarGrams ?? null,
    sodium_mg: value.totalNutrients.sodiumMg ?? null,
    note: value.note?.trim() || null,
  });
}

export async function deleteFood(
  userId: string,
  foodId: string,
  version: number,
) {
  const id = z.string().uuid().parse(foodId);
  await changeRecord(userId, "nutrition_entries", id, version);
}

export async function getCurrentMonthCalorieTotals(
  userId: string,
  reference = new Date(),
): Promise<Record<string, DailyCalorieTotal>> {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  const entries = await collectPages((after) => {
    let query = supabase
      .from("nutrition_entries")
      .select("id, occurred_at, calories")
      .eq("user_id", userId)
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString())
      .order("id")
      .limit(200);
    if (after) query = query.gt("id", after);
    return query;
  });
  return calorieTotalsByLocalDay(
    entries.map((entry) => ({
      occurredAt: String(entry.occurred_at),
      calories: Number(entry.calories),
    })),
  );
}

import { z } from "zod";

export const foodUnitSchema = z.enum([
  "serving",
  "household",
  "g",
  "oz",
  "lb",
  "ml",
  "fl_oz",
  "cup",
  "tbsp",
  "tsp",
]);
export type FoodUnit = z.infer<typeof foodUnitSchema>;

export const nutrientValuesSchema = z.object({
  calories: z.number().min(0).max(20000),
  proteinGrams: z.number().min(0).max(1000),
  carbohydrateGrams: z.number().min(0).max(2000).optional(),
  fatGrams: z.number().min(0).max(2000).optional(),
  fiberGrams: z.number().min(0).max(1000).optional(),
  sugarGrams: z.number().min(0).max(2000).optional(),
  sodiumMg: z.number().min(0).max(100000).optional(),
});
export type NutrientValues = z.infer<typeof nutrientValuesSchema>;

export const foodBasisSchema = z.object({
  profileId: z.string().uuid().optional(),
  catalogProductId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  brand: z.string().trim().max(160).optional(),
  barcode: z.string().trim().max(32).optional(),
  source: z.enum(["manual", "open_food_facts"]),
  isUserCorrected: z.boolean().default(false),
  servingLabel: z.string().trim().max(160).optional(),
  servingWeightGrams: z.number().positive().max(100000).optional(),
  servingVolumeMl: z.number().positive().max(100000).optional(),
  householdQuantityPerServing: z.number().positive().max(100000).optional(),
  householdUnit: z.string().trim().min(1).max(40).optional(),
  nutrientsPerServing: nutrientValuesSchema,
});
export type FoodBasis = z.infer<typeof foodBasisSchema>;

export const mealDraftEntrySchema = foodBasisSchema.extend({
  id: z.string().uuid(),
  amount: z.number().positive().max(100000),
  unit: foodUnitSchema,
  servingCount: z.number().positive(),
  consumedWeightGrams: z.number().positive().optional(),
  consumedVolumeMl: z.number().positive().optional(),
  totalNutrients: nutrientValuesSchema,
  note: z.string().trim().max(1000).optional(),
  entryMethod: z.enum(["basic", "history", "profile", "label", "barcode"]),
});
export type MealDraftEntry = z.infer<typeof mealDraftEntrySchema>;

export const nutritionDraftSchema = z.object({
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  entries: z.array(mealDraftEntrySchema).max(100),
});
export type NutritionDraft = z.infer<typeof nutritionDraftSchema>;

export function canonicalFoodBarcode(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (!digits) return undefined;
  return digits.length <= 14 ? digits.padStart(14, "0") : digits;
}

export function foodNameMatchesQuery(name: string, query: string): boolean {
  const normalize = (value: string) =>
    value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const normalizedQuery = normalize(query);
  return normalizedQuery.length > 0 && normalize(name) === normalizedQuery;
}

const WEIGHT_TO_GRAMS: Partial<Record<FoodUnit, number>> = {
  g: 1,
  oz: 28.349523125,
  lb: 453.59237,
};
const VOLUME_TO_ML: Partial<Record<FoodUnit, number>> = {
  ml: 1,
  fl_oz: 29.5735295625,
  cup: 236.5882365,
  tbsp: 14.78676478125,
  tsp: 4.92892159375,
};

export function weightAmountToGrams(amount: number, unit: "g" | "oz" | "lb") {
  return amount * WEIGHT_TO_GRAMS[unit]!;
}

export function volumeAmountToMl(
  amount: number,
  unit: "ml" | "fl_oz" | "cup" | "tbsp" | "tsp",
) {
  return amount * VOLUME_TO_ML[unit]!;
}

export const foodUnitLabel: Record<FoodUnit, string> = {
  serving: "serving",
  household: "item",
  g: "g",
  oz: "oz",
  lb: "lb",
  ml: "mL",
  fl_oz: "fl oz",
  cup: "cup",
  tbsp: "tbsp",
  tsp: "tsp",
};

export function availableFoodUnits(basis: FoodBasis): FoodUnit[] {
  return [
    "serving",
    ...(basis.householdQuantityPerServing && basis.householdUnit
      ? (["household"] as FoodUnit[])
      : []),
    ...(basis.servingWeightGrams ? (["g", "oz", "lb"] as FoodUnit[]) : []),
    ...(basis.servingVolumeMl
      ? (["ml", "fl_oz", "cup", "tbsp", "tsp"] as FoodUnit[])
      : []),
  ];
}

const pluralAliases: Record<string, string> = {
  bag: "bags",
  bar: "bars",
  bottle: "bottles",
  can: "cans",
  chip: "chips",
  cookie: "cookies",
  cracker: "crackers",
  package: "packages",
  packet: "packets",
  piece: "pieces",
  pouch: "pouches",
  slice: "slices",
  stick: "sticks",
};

export function normalizeHouseholdUnit(value: string): string {
  const normalized = value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return (
    Object.entries(pluralAliases).find(
      ([, plural]) => plural === normalized,
    )?.[0] ?? normalized
  );
}

export function foodAmountUnitLabel(
  unit: FoodUnit,
  amount: number,
  householdUnit?: string,
): string {
  if (unit === "household") {
    const label = householdUnit?.trim() || "item";
    return amount === 1
      ? label
      : (pluralAliases[label] ?? (label.endsWith("s") ? label : `${label}s`));
  }
  if (unit === "serving" && amount !== 1) return "servings";
  return foodUnitLabel[unit];
}

export function foodAmountDescription(
  amount: number,
  unit: FoodUnit,
  householdUnit?: string,
  servingLabel?: string,
): string {
  const amountDescription = `${amount} ${foodAmountUnitLabel(
    unit,
    amount,
    householdUnit,
  )}`;
  const serving = servingLabel?.trim();
  if (!serving) return amountDescription;
  const normalize = (value: string) =>
    value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const normalizedAmount = normalize(amountDescription);
  const normalizedServing = normalize(serving);
  if (
    normalizedServing === normalizedAmount ||
    normalizedServing.startsWith(`${normalizedAmount} `) ||
    normalizedServing.startsWith(`${normalizedAmount}(`) ||
    normalizedServing.startsWith(`${normalizedAmount},`)
  ) {
    return serving;
  }
  return `${amountDescription} · ${serving}`;
}

const rounded = (value: number, digits = 3) => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

export function calculateFoodAmount(
  basisInput: FoodBasis,
  amount: number,
  unit: FoodUnit,
) {
  const basis = foodBasisSchema.parse(basisInput);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter an amount greater than zero.");
  }
  let servingCount = amount;
  let consumedWeightGrams: number | undefined;
  let consumedVolumeMl: number | undefined;
  if (unit in WEIGHT_TO_GRAMS) {
    if (!basis.servingWeightGrams) {
      throw new Error("This food does not have a weight conversion.");
    }
    consumedWeightGrams = amount * WEIGHT_TO_GRAMS[unit]!;
    servingCount = consumedWeightGrams / basis.servingWeightGrams;
  } else if (unit in VOLUME_TO_ML) {
    if (!basis.servingVolumeMl) {
      throw new Error("This food does not have a volume conversion.");
    }
    consumedVolumeMl = amount * VOLUME_TO_ML[unit]!;
    servingCount = consumedVolumeMl / basis.servingVolumeMl;
  } else if (unit === "household") {
    if (!basis.householdQuantityPerServing || !basis.householdUnit) {
      throw new Error("This food does not have a package or piece conversion.");
    }
    servingCount = amount / basis.householdQuantityPerServing;
  } else if (unit !== "serving") {
    throw new Error("Unsupported food unit.");
  }
  if (consumedWeightGrams === undefined && basis.servingWeightGrams) {
    consumedWeightGrams = basis.servingWeightGrams * servingCount;
  }
  if (consumedVolumeMl === undefined && basis.servingVolumeMl) {
    consumedVolumeMl = basis.servingVolumeMl * servingCount;
  }
  const scale = (value: number | undefined) =>
    value === undefined ? undefined : rounded(value * servingCount);
  return {
    servingCount: rounded(servingCount, 6),
    consumedWeightGrams: consumedWeightGrams
      ? rounded(consumedWeightGrams, 4)
      : undefined,
    consumedVolumeMl: consumedVolumeMl
      ? rounded(consumedVolumeMl, 4)
      : undefined,
    totalNutrients: {
      calories: Math.round(basis.nutrientsPerServing.calories * servingCount),
      proteinGrams: rounded(
        basis.nutrientsPerServing.proteinGrams * servingCount,
      ),
      carbohydrateGrams: scale(basis.nutrientsPerServing.carbohydrateGrams),
      fatGrams: scale(basis.nutrientsPerServing.fatGrams),
      fiberGrams: scale(basis.nutrientsPerServing.fiberGrams),
      sugarGrams: scale(basis.nutrientsPerServing.sugarGrams),
      sodiumMg: scale(basis.nutrientsPerServing.sodiumMg),
    } satisfies NutrientValues,
  };
}

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
export type WeightUnit = "g" | "oz" | "lb";
export type VolumeUnit = "ml" | "fl_oz" | "cup" | "tbsp" | "tsp";

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
  description: z.string().trim().max(600).optional(),
  brand: z.string().trim().max(160).optional(),
  barcode: z.string().trim().max(32).optional(),
  source: z.enum(["manual", "open_food_facts", "ai"]),
  isUserCorrected: z.boolean().default(false),
  servingLabel: z.string().trim().max(160).optional(),
  servingWeightGrams: z.number().positive().max(100000).optional(),
  servingVolumeMl: z.number().positive().max(100000).optional(),
  householdQuantityPerServing: z.number().positive().max(100000).optional(),
  householdUnit: z.string().trim().min(1).max(40).optional(),
  servingsPerContainer: z.number().positive().max(100000).optional(),
  nutrientsPerServing: nutrientValuesSchema,
});
export type FoodBasis = z.infer<typeof foodBasisSchema>;

export function shouldPreferSavedFoodProfile(
  basis: FoodBasis | undefined,
): basis is FoodBasis {
  return Boolean(basis);
}

const normalizedProfileText = (value: string | undefined) =>
  value?.trim().toLocaleLowerCase().replace(/\s+/g, " ") || null;

export function foodProfileContentKey(input: FoodBasis) {
  const basis = foodBasisSchema.parse(input);
  return JSON.stringify([
    normalizedProfileText(basis.name),
    normalizedProfileText(basis.description),
    normalizedProfileText(basis.brand),
    basis.source,
    normalizedProfileText(basis.servingLabel),
    basis.servingWeightGrams ?? null,
    basis.servingVolumeMl ?? null,
    basis.householdQuantityPerServing ?? null,
    normalizedProfileText(basis.householdUnit),
    basis.servingsPerContainer ?? null,
    basis.nutrientsPerServing.calories,
    basis.nutrientsPerServing.proteinGrams,
    basis.nutrientsPerServing.carbohydrateGrams ?? null,
    basis.nutrientsPerServing.fatGrams ?? null,
    basis.nutrientsPerServing.fiberGrams ?? null,
    basis.nutrientsPerServing.sugarGrams ?? null,
    basis.nutrientsPerServing.sodiumMg ?? null,
  ]);
}

export const mealDraftEntrySchema = foodBasisSchema.extend({
  id: z.string().uuid(),
  amount: z.number().positive().max(100000),
  unit: foodUnitSchema,
  servingCount: z.number().positive(),
  consumedWeightGrams: z.number().positive().optional(),
  consumedVolumeMl: z.number().positive().optional(),
  totalNutrients: nutrientValuesSchema,
  note: z.string().trim().max(1000).optional(),
  entryMethod: z.enum([
    "basic",
    "history",
    "profile",
    "label",
    "barcode",
    "ai",
  ]),
});
export type MealDraftEntry = z.infer<typeof mealDraftEntrySchema>;

export type FoodHistorySnapshot = {
  name: string;
  brand?: string;
  source: "manual" | "open_food_facts" | "import" | "ai";
  servingLabel?: string;
  householdQuantityPerServing?: number;
  householdUnit?: string;
  amount: number;
  unit: FoodUnit;
  servingCount: number;
  consumedWeightGrams?: number;
  consumedVolumeMl?: number;
  totalNutrients: NutrientValues;
};

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

export function weightAmountToGrams(amount: number, unit: WeightUnit) {
  return amount * WEIGHT_TO_GRAMS[unit]!;
}

export function volumeAmountToMl(amount: number, unit: VolumeUnit) {
  return amount * VOLUME_TO_ML[unit]!;
}

export function convertWeightAmount(
  amount: number,
  from: WeightUnit,
  to: WeightUnit,
) {
  return weightAmountToGrams(amount, from) / WEIGHT_TO_GRAMS[to]!;
}

export function convertVolumeAmount(
  amount: number,
  from: VolumeUnit,
  to: VolumeUnit,
) {
  return volumeAmountToMl(amount, from) / VOLUME_TO_ML[to]!;
}

/** Parse a food-label measurement entered as a decimal or common fraction. */
export function parseFoodMeasurementAmount(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;

  const mixed = normalized.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (!denominator) return undefined;
    return Number(mixed[1]) + Number(mixed[2]) / denominator;
  }

  const fraction = normalized.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : undefined;
  }

  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function calculateServingScale(
  baseline: number | undefined,
  next: number | undefined,
  paired: number | undefined,
): { paired?: number; ratio: number } {
  if (!baseline || !next || baseline <= 0 || next <= 0) return { ratio: 1 };
  const ratio = next / baseline;
  return {
    ratio,
    paired: paired && paired > 0 ? paired * ratio : undefined,
  };
}

export function formatFoodMeasurementAmount(amount: number) {
  const magnitude = Math.abs(amount);
  const digits = magnitude < 0.1 ? 4 : magnitude < 1 ? 3 : 2;
  const multiplier = 10 ** digits;
  return String(Math.round(amount * multiplier) / multiplier);
}

export function preferredWeightUnitFromServingLabel(
  servingLabel: string | undefined,
): WeightUnit {
  const label = (servingLabel ?? "")
    .toLocaleLowerCase()
    .replace(/\bfl\s*\.?\s*oz\b/g, "");
  if (/\blbs?\b|\bpounds?\b/.test(label)) return "lb";
  if (/\boz\b|\bounces?\b/.test(label)) return "oz";
  return "g";
}

export function preferredVolumeUnitFromServingLabel(
  servingLabel: string | undefined,
): VolumeUnit {
  const label = (servingLabel ?? "").toLocaleLowerCase();
  if (/\bfl\s*\.?\s*oz\b|\bfluid ounces?\b/.test(label)) return "fl_oz";
  if (/\bcups?\b/.test(label)) return "cup";
  if (/\btbsp\b|\btablespoons?\b/.test(label)) return "tbsp";
  if (/\btsp\b|\bteaspoons?\b/.test(label)) return "tsp";
  return "ml";
}

export function foodBasisFromHistorySnapshot(
  snapshot: FoodHistorySnapshot,
): FoodBasis {
  const servingCount =
    Number.isFinite(snapshot.servingCount) && snapshot.servingCount > 0
      ? snapshot.servingCount
      : 1;
  const consumedWeightGrams =
    snapshot.consumedWeightGrams ??
    (snapshot.unit === "g" || snapshot.unit === "oz" || snapshot.unit === "lb"
      ? weightAmountToGrams(snapshot.amount, snapshot.unit)
      : undefined);
  const consumedVolumeMl =
    snapshot.consumedVolumeMl ??
    (snapshot.unit === "ml" ||
    snapshot.unit === "fl_oz" ||
    snapshot.unit === "cup" ||
    snapshot.unit === "tbsp" ||
    snapshot.unit === "tsp"
      ? volumeAmountToMl(snapshot.amount, snapshot.unit)
      : undefined);
  const perServing = (value: number | undefined) =>
    value === undefined ? undefined : value / servingCount;
  return foodBasisSchema.parse({
    name: snapshot.name,
    brand: snapshot.brand,
    source: snapshot.source === "import" ? "manual" : snapshot.source,
    isUserCorrected: false,
    servingLabel: snapshot.servingLabel,
    servingWeightGrams: perServing(consumedWeightGrams),
    servingVolumeMl: perServing(consumedVolumeMl),
    householdQuantityPerServing: snapshot.householdQuantityPerServing,
    householdUnit: snapshot.householdUnit,
    nutrientsPerServing: {
      calories: snapshot.totalNutrients.calories / servingCount,
      proteinGrams: snapshot.totalNutrients.proteinGrams / servingCount,
      carbohydrateGrams: perServing(snapshot.totalNutrients.carbohydrateGrams),
      fatGrams: perServing(snapshot.totalNutrients.fatGrams),
      fiberGrams: perServing(snapshot.totalNutrients.fiberGrams),
      sugarGrams: perServing(snapshot.totalNutrients.sugarGrams),
      sodiumMg: perServing(snapshot.totalNutrients.sodiumMg),
    },
  });
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

const nonSpecificHouseholdUnits = new Set([
  "serving",
  "portion",
  "g",
  "gram",
  "grams",
  "kg",
  "kilogram",
  "kilograms",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "ml",
  "milliliter",
  "milliliters",
  "l",
  "liter",
  "liters",
  "fl oz",
  "fluid ounce",
  "fluid ounces",
  "cup",
  "cups",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "tsp",
  "teaspoon",
  "teaspoons",
]);

export function isSpecificHouseholdUnit(
  value: string | null | undefined,
): boolean {
  if (!value?.trim()) return false;
  return !nonSpecificHouseholdUnits.has(normalizeHouseholdUnit(value));
}

export function hasReproducibleServingBasis({
  householdAmount,
  householdUnit,
  volumeAmount,
  weightAmount,
}: {
  householdAmount?: number | null;
  householdUnit?: string | null;
  volumeAmount?: number | null;
  weightAmount?: number | null;
}): boolean {
  return Boolean(
    (typeof weightAmount === "number" && weightAmount > 0) ||
    (typeof volumeAmount === "number" && volumeAmount > 0) ||
    (typeof householdAmount === "number" &&
      householdAmount > 0 &&
      isSpecificHouseholdUnit(householdUnit)),
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

export function buildServingLabel({
  fallback,
  householdAmount,
  householdUnit,
  volumeAmount,
  volumeUnit = "ml",
  weightAmount,
  weightUnit = "g",
}: {
  fallback?: string;
  householdAmount?: number;
  householdUnit?: string;
  volumeAmount?: number;
  volumeUnit?: VolumeUnit;
  weightAmount?: number;
  weightUnit?: WeightUnit;
}): string | undefined {
  const validHousehold =
    householdAmount !== undefined &&
    householdAmount > 0 &&
    Boolean(householdUnit?.trim());
  const item = validHousehold
    ? `${formatFoodMeasurementAmount(householdAmount)} ${foodAmountUnitLabel(
        "household",
        householdAmount,
        normalizeHouseholdUnit(householdUnit!),
      )}`
    : undefined;
  const conversions = [
    weightAmount !== undefined && weightAmount > 0
      ? `${formatFoodMeasurementAmount(weightAmount)} ${foodUnitLabel[weightUnit]}`
      : undefined,
    volumeAmount !== undefined && volumeAmount > 0
      ? `${formatFoodMeasurementAmount(volumeAmount)} ${foodUnitLabel[volumeUnit]}`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  if (item && conversions.length) return `${item} (${conversions.join(", ")})`;
  if (item) return item;
  if (conversions.length) return conversions.join(", ");
  return fallback?.trim() || undefined;
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

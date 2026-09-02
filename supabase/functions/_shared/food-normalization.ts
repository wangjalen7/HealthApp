export type NormalizedNutrients = {
  calories: number | null;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
  sugarGrams: number | null;
  sodiumMg: number | null;
};

export type NormalizedFoodProduct = {
  providerId: string;
  foodName: string;
  brand: string | null;
  serving: {
    label: string | null;
    weightGrams: number | null;
    volumeMl: number | null;
    householdQuantity: number | null;
    householdUnit: string | null;
  };
  nutrients: NormalizedNutrients;
};

export const finite = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export const positiveFinite = (value: unknown): number | null => {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
};

export function sentenceCaseFoodName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "Scanned product";
  const letters = normalized.replace(/[^\p{L}]/gu, "");
  const sentence = letters && letters === letters.toLocaleUpperCase()
    ? normalized.toLocaleLowerCase()
    : normalized;
  return sentence.charAt(0).toLocaleUpperCase() + sentence.slice(1);
}

function parseFraction(value: string): number | null {
  const normalized = value.trim();
  const mixed = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    return denominator ? Number(mixed[1]) + Number(mixed[2]) / denominator : null;
  }
  const fraction = normalized.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : null;
  }
  return finite(normalized);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

export type OpenFoodFactsProductResult =
  | { kind: "found"; product: Record<string, unknown> }
  | { kind: "not_found" }
  | { kind: "invalid_response" };

export function openFoodFactsProductResult(
  payload: unknown,
): OpenFoodFactsProductResult {
  const root = record(payload);
  const resultId = record(root?.result)?.id;
  if (resultId === "product_not_found") return { kind: "not_found" };
  const errors = Array.isArray(root?.errors) ? root.errors : [];
  if (errors.some((error) => record(record(error)?.message)?.id === "product_not_found")) {
    return { kind: "not_found" };
  }
  const product = record(root?.product);
  if (resultId === "product_found" && product) return { kind: "found", product };
  return { kind: "invalid_response" };
}

const householdAliases: Record<string, string> = {
  bags: "bag",
  bars: "bar",
  bottles: "bottle",
  cans: "can",
  chips: "chip",
  cookies: "cookie",
  crackers: "cracker",
  packets: "packet",
  packages: "package",
  pieces: "piece",
  pouches: "pouch",
  slices: "slice",
  sticks: "stick",
};

const measurementUnits = new Set([
  "g", "gram", "grams", "kg", "kilogram", "kilograms",
  "ml", "milliliter", "milliliters", "l", "liter", "liters",
  "oz", "ounce", "ounces", "fl oz", "fluid ounce", "fluid ounces",
  "cup", "cups", "tbsp", "tablespoon", "tablespoons",
  "tsp", "teaspoon", "teaspoons",
  "serving", "servings",
]);

function householdServing(label: string) {
  const candidates = label.replace(/[()[\]]/g, "|").split(/[|,;]/);
  for (const candidate of candidates) {
    const match = candidate.trim().match(
      /^(?:about|approximately|approx\.?|~)?\s*(\d+(?:\.\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s+([a-z][a-z -]*)$/i,
    );
    if (!match) continue;
    const quantity = parseFraction(match[1]);
    const rawUnit = match[2].trim().toLocaleLowerCase().replace(/\s+/g, " ");
    if (!quantity || quantity <= 0 || measurementUnits.has(rawUnit)) continue;
    const unit = householdAliases[rawUnit] ?? rawUnit;
    if (unit.length <= 40) return { quantity, unit };
  }
  return { quantity: null, unit: null };
}

const liquidContainers = new Set(["bottle", "can", "carton", "cup", "pouch"]);

function packageVolumeMl(
  product: Record<string, unknown>,
  household: { quantity: number | null; unit: string | null },
): { amount: number; label: string } | null {
  if (household.quantity !== 1 || !household.unit) return null;
  const quantityLabel = typeof product.quantity === "string"
    ? product.quantity.trim()
    : "";
  if (!quantityLabel) return null;
  const ml = quantityLabel.match(/([\d.]+)\s*(?:ml|milliliters?)\b/i);
  if (ml) {
    const amount = positiveFinite(ml[1]);
    return amount === null ? null : { amount, label: `${amount} mL` };
  }
  const liters = quantityLabel.match(/([\d.]+)\s*(?:l|liters?)\b/i);
  if (liters) {
    const amount = positiveFinite(liters[1]);
    return amount === null
      ? null
      : { amount: amount * 1000, label: `${amount} L` };
  }
  const ounces = quantityLabel.match(/([\d.]+)\s*(fl\.?\s*oz|fluid ounces?|oz|ounces?)\b/i);
  if (!ounces) return null;
  const explicitlyFluid = /^(?:fl\.?\s*oz|fluid ounces?)$/i.test(ounces[2]);
  if (!explicitlyFluid && !liquidContainers.has(household.unit)) {
    return null;
  }
  const fluidOunces = positiveFinite(ounces[1]);
  if (fluidOunces === null) return null;
  const converted = fluidOunces * 29.5735295625;
  const servingQuantity = positiveFinite(product.serving_quantity);
  const amount = servingQuantity !== null &&
      Math.abs(servingQuantity - converted) / converted <= 0.02
    ? servingQuantity
    : converted;
  return { amount, label: `${fluidOunces} fl oz` };
}

export function servingConversions(product: Record<string, unknown>) {
  let label = typeof product.serving_size === "string"
    ? product.serving_size.trim()
    : "";
  let weightGrams: number | null = null;
  let volumeMl: number | null = null;
  const quantity = positiveFinite(product.serving_quantity);
  const unit = typeof product.serving_quantity_unit === "string"
    ? product.serving_quantity_unit.toLocaleLowerCase()
    : "";
  if (quantity !== null) {
    if (unit === "g") weightGrams = quantity;
    if (unit === "kg") weightGrams = quantity * 1000;
    if (unit === "ml") volumeMl = quantity;
    if (unit === "l") volumeMl = quantity * 1000;
  }
  const gramMatch = label.match(/([\d.]+)\s*(?:g|gram|grams)\b/i);
  const mlMatch = label.match(/([\d.]+)\s*(?:ml|milliliter|milliliters)\b/i);
  const fluidOunceMatch = label.match(/([\d.]+)\s*(?:fl\.?\s*oz|fluid ounces?)\b/i);
  const ounceMatch = label.match(/([\d.]+)\s*(?:oz|ounces?)\b/i);
  if (gramMatch) weightGrams = finite(gramMatch[1]);
  if (mlMatch) volumeMl = finite(mlMatch[1]);
  if (!volumeMl && fluidOunceMatch) {
    const amount = finite(fluidOunceMatch[1]);
    if (amount !== null) volumeMl = amount * 29.5735295625;
  }
  if (!weightGrams && !fluidOunceMatch && ounceMatch) {
    const amount = finite(ounceMatch[1]);
    if (amount !== null) weightGrams = amount * 28.349523125;
  }
  const household = householdServing(label);
  const packageVolume = packageVolumeMl(product, household);
  if (packageVolume) {
    // Some liquid OFF records import a US fl oz package as grams. A liquid
    // category + one liquid container + the package quantity is an explicit
    // volume cue, so keep only volume rather than inventing a density.
    weightGrams = null;
    volumeMl = packageVolume.amount;
    label = `${household.quantity} ${household.unit} (${packageVolume.label})`;
  }
  return {
    label: label || null,
    weightGrams,
    volumeMl,
    householdQuantity: household.quantity,
    householdUnit: household.unit,
  };
}

function firstFinite(nutriments: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = finite(nutriments[key]);
    if (value !== null) return value;
  }
  return null;
}

type StructuredNutrition = {
  nutrients: NormalizedNutrients;
  per: "serving" | "100g" | "100ml";
  servingIsInconsistent: boolean;
};

function structuredNutrientEntry(
  nutritionSet: Record<string, unknown>,
  key: string,
) {
  return record(record(nutritionSet.nutrients)?.[key]);
}

function structuredValue(
  nutritionSet: Record<string, unknown>,
  key: string,
): number | null {
  return finite(structuredNutrientEntry(nutritionSet, key)?.value);
}

function structuredGrams(
  nutritionSet: Record<string, unknown>,
  key: string,
): number | null {
  const entry = structuredNutrientEntry(nutritionSet, key);
  const value = finite(entry?.value);
  if (value === null) return null;
  const unit = typeof entry?.unit === "string" ? entry.unit.toLocaleLowerCase() : "g";
  if (unit === "mg") return value / 1000;
  if (unit === "kg") return value * 1000;
  return unit === "g" ? value : null;
}

function structuredCalories(nutritionSet: Record<string, unknown>) {
  const calories = structuredValue(nutritionSet, "energy-kcal");
  if (calories !== null) return calories;
  const kilojoules = structuredValue(nutritionSet, "energy-kj") ??
    structuredValue(nutritionSet, "energy");
  return kilojoules === null ? null : kilojoules / 4.184;
}

function normalizedStructuredNutrients(
  nutritionSet: Record<string, unknown>,
): NormalizedNutrients {
  const sodiumGrams = structuredGrams(nutritionSet, "sodium");
  return {
    calories: structuredCalories(nutritionSet),
    proteinGrams: structuredGrams(nutritionSet, "proteins"),
    carbohydrateGrams: structuredGrams(nutritionSet, "carbohydrates-total") ??
      structuredGrams(nutritionSet, "carbohydrates"),
    fatGrams: structuredGrams(nutritionSet, "fat"),
    fiberGrams: structuredGrams(nutritionSet, "fiber"),
    sugarGrams: structuredGrams(nutritionSet, "sugars"),
    sodiumMg: sodiumGrams === null ? null : sodiumGrams * 1000,
  };
}

function normalizedPer(value: unknown): "serving" | "100g" | "100ml" | null {
  if (value === "serving" || value === "100g" || value === "100ml") return value;
  return null;
}

function productHasExplicitVolume(product: Record<string, unknown>) {
  const labels = [product.quantity, product.serving_size];
  if (Array.isArray(product.packagings)) {
    for (const packaging of product.packagings) {
      const value = record(packaging)?.quantity_per_unit;
      if (typeof value === "string") labels.push(value);
    }
  }
  return labels.some((value) =>
    typeof value === "string" &&
    /[\d.]\s*(?:ml|millilit(?:er|re)s?|cl|centilit(?:er|re)s?|l|lit(?:er|re)s?|fl\.?\s*oz|fluid ounces?|qt|quarts?)\b/i.test(value)
  );
}

function comparableNutrient(
  nutritionSet: Record<string, unknown>,
  key: string,
) {
  return key === "energy-kcal"
    ? structuredCalories(nutritionSet)
    : structuredGrams(nutritionSet, key);
}

function servingNutritionIsInconsistent(
  servingSet: Record<string, unknown>,
  per100Set: Record<string, unknown> | undefined,
  product: Record<string, unknown>,
) {
  if (!per100Set) return false;
  const quantity = positiveFinite(servingSet.per_quantity) ??
    positiveFinite(product.serving_quantity);
  if (quantity === null) return false;
  const servingUnit = typeof servingSet.per_unit === "string"
    ? servingSet.per_unit.toLocaleLowerCase()
    : typeof product.serving_quantity_unit === "string"
    ? product.serving_quantity_unit.toLocaleLowerCase()
    : "";
  const per100Unit = typeof per100Set.per_unit === "string"
    ? per100Set.per_unit.toLocaleLowerCase()
    : normalizedPer(per100Set.per) === "100ml" ? "ml" : "g";
  if (!servingUnit || servingUnit !== per100Unit) return false;
  const differences: number[] = [];
  for (const key of ["energy-kcal", "carbohydrates", "fat", "proteins", "sodium"]) {
    const servingValue = comparableNutrient(servingSet, key);
    const per100Value = comparableNutrient(per100Set, key);
    if (servingValue === null || per100Value === null || per100Value <= 0) continue;
    const expected = per100Value * quantity / 100;
    if (expected <= 0) continue;
    differences.push(Math.abs(servingValue - expected) / expected);
  }
  return differences.length >= 2 &&
    differences.filter((difference) => difference > 0.25).length >=
      Math.ceil(differences.length / 2);
}

function structuredNutrition(product: Record<string, unknown>): StructuredNutrition | null {
  const nutrition = record(product.nutrition);
  if (!nutrition) return null;
  const inputs = Array.isArray(nutrition.input_sets)
    ? nutrition.input_sets.map(record).filter((value) => value !== null)
    : [];
  const packagingInputs = inputs.filter((value) =>
    value.source === "packaging" && value.preparation !== "prepared"
  );
  const servingSet = packagingInputs.find((value) => value.per === "serving");
  const servingUnit = typeof servingSet?.per_unit === "string"
    ? servingSet.per_unit.toLocaleLowerCase()
    : typeof product.serving_quantity_unit === "string"
    ? product.serving_quantity_unit.toLocaleLowerCase()
    : "";
  const matchingPer100 = packagingInputs.find((value) =>
    (servingUnit === "ml" && value.per === "100ml") ||
    (servingUnit !== "ml" && value.per === "100g")
  );
  if (servingSet) {
    return {
      nutrients: normalizedStructuredNutrients(servingSet),
      per: "serving",
      servingIsInconsistent: servingNutritionIsInconsistent(
        servingSet,
        matchingPer100,
        product,
      ),
    };
  }
  const aggregated = record(nutrition.aggregated_set);
  const per = normalizedPer(aggregated?.per);
  if (!aggregated || (per !== "100g" && per !== "100ml")) return null;
  return {
    nutrients: normalizedStructuredNutrients(aggregated),
    per,
    // Do not turn a volume-labelled package into a mass conversion merely
    // because an OFF record has a conflicting 100g aggregate basis.
    servingIsInconsistent: per === "100g" && productHasExplicitVolume(product),
  };
}

function nutrient(
  nutriments: Record<string, unknown>,
  keys: string[],
  servingSize: number | null,
): number | null {
  const serving = firstFinite(
    nutriments,
    keys.map((key) => `${key}_serving`),
  );
  if (serving !== null) return serving;
  const per100 = firstFinite(
    nutriments,
    keys.map((key) => `${key}_100g`),
  );
  if (per100 === null || servingSize === null) return null;
  return per100 * (servingSize / 100);
}

export function normalizeFoodProduct(
  product: Record<string, unknown>,
  providerBarcode: string,
): NormalizedFoodProduct {
  const nutriments = product.nutriments && typeof product.nutriments === "object"
    ? product.nutriments as Record<string, unknown>
    : {};
  const structured = structuredNutrition(product);
  let serving = servingConversions(product);
  const nutrientKeys = [
    "energy-kcal", "energy-kj", "energy", "proteins", "carbohydrates-total",
    "carbohydrates", "fat", "fiber", "sugars", "sodium",
  ];
  const hasServingNutrients = nutrientKeys.some(
    (key) => finite(nutriments[`${key}_serving`]) !== null,
  );
  if (structured?.servingIsInconsistent) {
    // OFF can retain conflicting packaging input sets. Keep the explicit
    // per-serving nutrients, but do not present an internally inconsistent
    // package size or conversion as reliable.
    serving = {
      label: null,
      weightGrams: null,
      volumeMl: null,
      householdQuantity: null,
      householdUnit: null,
    };
  } else if (structured?.per === "100ml") {
    serving = {
      label: "100 mL",
      weightGrams: null,
      volumeMl: 100,
      householdQuantity: null,
      householdUnit: null,
    };
  } else if (structured?.per === "100g") {
    serving = {
      label: "100 g",
      weightGrams: 100,
      volumeMl: null,
      householdQuantity: null,
      householdUnit: null,
    };
  } else if (
    !structured &&
    !hasServingNutrients &&
    serving.weightGrams === null &&
    serving.volumeMl === null &&
    serving.label === null
  ) {
    // Open Food Facts always normalizes `_100g` values. When no package
    // serving exists at all, 100 g is an explicit provider basis—not a guess.
    serving = { ...serving, label: "100 g", weightGrams: 100 };
  }
  const servingSize = serving.weightGrams ?? serving.volumeMl;
  const calories = nutrient(nutriments, ["energy-kcal"], servingSize);
  const energyKj = nutrient(nutriments, ["energy-kj", "energy"], servingSize);
  const sodiumGrams = nutrient(nutriments, ["sodium"], servingSize);
  const nutrients: NormalizedNutrients = structured?.nutrients ?? {
    calories: calories ?? (energyKj === null ? null : energyKj / 4.184),
    proteinGrams: nutrient(nutriments, ["proteins"], servingSize),
    carbohydrateGrams: nutrient(
      nutriments,
      ["carbohydrates-total", "carbohydrates"],
      servingSize,
    ),
    fatGrams: nutrient(nutriments, ["fat"], servingSize),
    fiberGrams: nutrient(nutriments, ["fiber"], servingSize),
    sugarGrams: nutrient(nutriments, ["sugars"], servingSize),
    sodiumMg: sodiumGrams === null ? null : sodiumGrams * 1000,
  };
  const foodName = [product.product_name, product.product_name_en]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
  return {
    providerId: String(product.code ?? providerBarcode),
    foodName: sentenceCaseFoodName(foodName ?? "Scanned product"),
    brand: typeof product.brands === "string" && product.brands.trim()
      ? product.brands.split(",")[0].trim()
      : null,
    serving,
    nutrients,
  };
}

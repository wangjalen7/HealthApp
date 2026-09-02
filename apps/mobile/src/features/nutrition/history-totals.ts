export type NutritionHistoryTotalSource = {
  calories: number;
  proteinGrams: number;
  carbohydrateGrams?: number;
  fatGrams?: number;
  fiberGrams?: number;
  sugarGrams?: number;
  sodiumMg?: number;
};

export type OptionalNutritionTotal = {
  value: number;
  hasAny: boolean;
  complete: boolean;
};

export type DailyNutritionTotals = {
  calories: number;
  proteinGrams: number;
  waterMl: number;
  carbohydrateGrams: OptionalNutritionTotal;
  fatGrams: OptionalNutritionTotal;
  fiberGrams: OptionalNutritionTotal;
  sugarGrams: OptionalNutritionTotal;
  sodiumMg: OptionalNutritionTotal;
};

function optionalTotal(
  entries: NutritionHistoryTotalSource[],
  value: (entry: NutritionHistoryTotalSource) => number | undefined,
): OptionalNutritionTotal {
  const available = entries
    .map(value)
    .filter((item): item is number => item !== undefined);
  return {
    value: available.reduce((total, item) => total + item, 0),
    hasAny: available.length > 0,
    complete: available.length === entries.length,
  };
}

export function dailyNutritionTotals(
  entries: NutritionHistoryTotalSource[],
  waterMl: number,
): DailyNutritionTotals {
  return {
    calories: entries.reduce((total, entry) => total + entry.calories, 0),
    proteinGrams: entries.reduce(
      (total, entry) => total + entry.proteinGrams,
      0,
    ),
    waterMl,
    carbohydrateGrams: optionalTotal(
      entries,
      (entry) => entry.carbohydrateGrams,
    ),
    fatGrams: optionalTotal(entries, (entry) => entry.fatGrams),
    fiberGrams: optionalTotal(entries, (entry) => entry.fiberGrams),
    sugarGrams: optionalTotal(entries, (entry) => entry.sugarGrams),
    sodiumMg: optionalTotal(entries, (entry) => entry.sodiumMg),
  };
}

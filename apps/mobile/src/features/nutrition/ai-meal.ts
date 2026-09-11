import {
  estimatedFoodSchema,
  sameEstimatedFoodName,
  type EstimatedFood,
} from "../../../../../supabase/functions/_shared/meal-estimate";
import {
  calculateFoodAmount,
  foodProfileContentKey,
  mealDraftEntrySchema,
  type MealDraftEntry,
} from "./model";

export function capitalizeFoodLabel(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const firstLetter = normalized.match(/\p{L}/u);
  if (!firstLetter || firstLetter.index === undefined) return normalized;
  const index = firstLetter.index;
  return (
    normalized.slice(0, index) +
    normalized.charAt(index).toLocaleUpperCase() +
    normalized.slice(index + 1)
  );
}

export function estimatedFoodToEntry(
  input: EstimatedFood,
  id: string,
): MealDraftEntry {
  const food = estimatedFoodSchema.parse(input);
  const basis = {
    name: capitalizeFoodLabel(food.name),
    description: food.description,
    source: "ai" as const,
    isUserCorrected: false,
    servingLabel: food.servingLabel,
    servingWeightGrams: food.servingWeightGrams ?? undefined,
    servingVolumeMl: food.servingVolumeMl ?? undefined,
    householdQuantityPerServing: food.householdQuantityPerServing ?? undefined,
    householdUnit: food.householdUnit ?? undefined,
    nutrientsPerServing: food.nutrientsPerServing,
  };
  return mealDraftEntrySchema.parse({
    ...basis,
    id,
    amount: food.portionAmount,
    unit: food.portionUnit,
    ...calculateFoodAmount(basis, food.portionAmount, food.portionUnit),
    note: `AI estimate (${food.confidence} confidence).`,
    entryMethod: "ai",
  });
}

function entryDuplicateKey(entry: MealDraftEntry) {
  return JSON.stringify([
    foodProfileContentKey(entry),
    entry.amount,
    entry.unit,
  ]);
}

export function deduplicateAiDraftEntries(entries: MealDraftEntry[]) {
  const unique: MealDraftEntry[] = [];
  for (const item of entries) {
    const duplicate =
      item.source === "ai" &&
      unique.some(
        (current) =>
          current.source === "ai" &&
          ((item.profileId !== undefined &&
            current.profileId === item.profileId) ||
            sameEstimatedFoodName(current.name, item.name)),
      );
    if (!duplicate) unique.push(item);
  }
  return unique;
}

export function appendEstimatedEntries(
  current: MealDraftEntry[],
  added: MealDraftEntry[],
) {
  const entries = deduplicateAiDraftEntries(current);
  const ids = new Set(entries.map((item) => item.id));
  const profileIds = new Set(
    entries.flatMap((item) => (item.profileId ? [item.profileId] : [])),
  );
  const content = new Set(entries.map(entryDuplicateKey));
  for (const item of added) {
    const duplicateKey = entryDuplicateKey(item);
    const sameAiFood =
      item.source === "ai" &&
      entries.some(
        (existing) =>
          existing.source === "ai" &&
          sameEstimatedFoodName(existing.name, item.name),
      );
    if (
      ids.has(item.id) ||
      content.has(duplicateKey) ||
      (item.profileId !== undefined && profileIds.has(item.profileId)) ||
      sameAiFood
    )
      continue;
    ids.add(item.id);
    content.add(duplicateKey);
    if (item.profileId) profileIds.add(item.profileId);
    entries.push(item);
  }
  if (entries.length > 100)
    throw new Error(
      "A meal can contain up to 100 foods. Remove some foods first.",
    );
  return entries;
}

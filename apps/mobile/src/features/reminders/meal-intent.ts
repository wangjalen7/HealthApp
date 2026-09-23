import type { NutritionDraft } from "../nutrition/model";
export function mealDraftForReminder(
  draft: NutritionDraft | undefined,
  meal: unknown,
): NutritionDraft | undefined {
  if (draft && (draft.entryDay || draft.mealType || draft.entries.length))
    return draft;
  if (meal !== "breakfast" && meal !== "lunch" && meal !== "dinner")
    return draft;
  // Notification dates never become entry dates. Blank means today at save time.
  return { mealType: meal, entries: [] };
}

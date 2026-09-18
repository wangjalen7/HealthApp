import type { CoachActionPayload } from "../../../../../supabase/functions/_shared/coach";
import { createUuid } from "../../lib/id";
import {
  loadWorkoutDraft,
  saveWorkoutDraft,
  workoutDraftSchema,
} from "../training/workout-draft";
import {
  loadCardioDraft,
  saveCardioDraft,
  cardioDraftSchema,
} from "../training/cardio-draft";
import {
  calculateFoodAmount,
  type MealDraftEntry,
  type NutritionDraft,
} from "../nutrition/model";
import { loadNutritionDraft, saveNutritionDraft } from "../nutrition/draft";
import { capitalizeFoodLabel } from "../nutrition/ai-meal";
import { getFoodProfilesByIds, saveFoodProfile } from "../nutrition/repository";
import {
  cardioDraftFromCoach,
  mergeWorkoutDrafts,
  type CoachDraftMode,
  workoutDraftFromCoach,
} from "./draft-action-model";

export {
  mergeWorkoutDrafts,
  workoutDraftFromCoach,
} from "./draft-action-model";

export async function applyCoachWorkout(
  userId: string,
  action: Extract<CoachActionPayload, { kind: "next_workout" }>,
  mode: CoachDraftMode,
) {
  // Validate both sections before writing either draft.
  const proposed = action.exercises.length
    ? workoutDraftSchema.parse(workoutDraftFromCoach(action))
    : undefined;
  const cardioValue = cardioDraftFromCoach(action);
  const cardio = cardioValue ? cardioDraftSchema.parse(cardioValue) : undefined;
  if (proposed) {
    const existing = await loadWorkoutDraft(userId);
    await saveWorkoutDraft(
      userId,
      mergeWorkoutDrafts(existing, proposed, mode),
    );
  }
  if (cardio) {
    const existing = await loadCardioDraft(userId);
    await saveCardioDraft(userId, {
      ...cardio,
      notes:
        mode === "append"
          ? [existing?.notes, cardio.notes]
              .filter(Boolean)
              .join("\n\n")
              .slice(0, 1000)
          : cardio.notes,
    });
  }
}

export async function mealEntriesFromCoach(
  userId: string,
  action: Extract<CoachActionPayload, { kind: "next_meal" }>,
): Promise<MealDraftEntry[]> {
  const profiles = await getFoodProfilesByIds(
    userId,
    action.items.flatMap((item) =>
      item.profileId === null ? [] : [item.profileId],
    ),
  );
  const byId = new Map(
    profiles.map((profile) => [profile.profileId!, profile]),
  );
  const savedIds = action.items.flatMap((item) =>
    item.profileId === null ? [] : [item.profileId],
  );
  if (byId.size !== new Set(savedIds).size)
    throw new Error("One of these saved foods is no longer available.");
  return action.items.map((item) => {
    const basis =
      item.profileId === null
        ? {
            name: capitalizeFoodLabel(item.name),
            description: item.description,
            source: "ai" as const,
            isUserCorrected: false,
            servingLabel: item.servingLabel,
            servingWeightGrams: item.servingWeightGrams ?? undefined,
            servingVolumeMl: item.servingVolumeMl ?? undefined,
            householdQuantityPerServing:
              item.householdQuantityPerServing ?? undefined,
            householdUnit: item.householdUnit ?? undefined,
            nutrientsPerServing: item.nutrientsPerServing,
          }
        : byId.get(item.profileId)!;
    const calculated = calculateFoodAmount(basis, item.amount, item.unit);
    return {
      ...basis,
      id: createUuid(),
      amount: item.amount,
      unit: item.unit,
      ...calculated,
      entryMethod:
        item.profileId === null ? ("ai" as const) : ("profile" as const),
      note: "Coach suggestion",
    };
  });
}

export async function applyCoachMeal(
  userId: string,
  action: Extract<CoachActionPayload, { kind: "next_meal" }>,
  items: MealDraftEntry[],
  mode: CoachDraftMode,
) {
  const existing = await loadNutritionDraft(userId);
  const persistedItems = await Promise.all(
    items.map(async (item) => {
      if (item.profileId) return item;
      const profile = await saveFoodProfile(userId, item);
      return {
        ...item,
        ...profile,
        ...calculateFoodAmount(profile, item.amount, item.unit),
      };
    }),
  );
  const next: NutritionDraft = {
    mealType: action.mealType ?? existing?.mealType,
    entries:
      mode === "replace"
        ? persistedItems
        : [...(existing?.entries ?? []), ...persistedItems],
  };
  await saveNutritionDraft(userId, next);
}

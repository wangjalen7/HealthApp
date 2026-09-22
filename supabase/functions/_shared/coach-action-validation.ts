import type { CoachActionPayload } from "./coach.ts";

type MealAction = Extract<CoachActionPayload, { kind: "next_meal" }>;
type ProposedMealItem = Extract<
  MealAction["items"][number],
  { profileId: null }
>;
type TrainingAction = Extract<CoachActionPayload, { kind: "next_workout" }>;

const normalizeText = (value: string) =>
  value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const genericFoodWords = new Set([
  "and",
  "food",
  "meal",
  "plate",
  "serving",
  "some",
  "the",
  "with",
]);

export function proposedFoodMatchesUserMessage(name: string, message: string) {
  const normalizedName = normalizeText(name);
  const messageWords = normalizeText(message).split(" ");
  const normalizedMessage = messageWords.join(" ");
  if (!normalizedName || !normalizedMessage) return false;
  if (normalizedMessage.includes(normalizedName)) return true;
  return normalizedName
    .split(" ")
    .filter((word) => word.length >= 3 && !genericFoodWords.has(word))
    .some((word) => messageWords.includes(word));
}

export function proposedFoodSupportsUnit(item: ProposedMealItem) {
  if (item.unit === "serving") return true;
  if (["g", "oz", "lb"].includes(item.unit))
    return item.servingWeightGrams !== null;
  if (["ml", "fl_oz", "cup", "tbsp", "tsp"].includes(item.unit))
    return item.servingVolumeMl !== null;
  return (
    item.householdQuantityPerServing !== null && item.householdUnit !== null
  );
}

export function trainingActionHasValidShape(action: TrainingAction) {
  const hasLifting = action.exercises.length > 0;
  const hasCardio = action.cardio !== null;
  switch (action.recommendation) {
    case "lifting":
      return hasLifting && !hasCardio;
    case "cardio":
      return !hasLifting && hasCardio;
    case "combo":
      return hasLifting && hasCardio;
    case "rest":
      return !hasLifting && !hasCardio;
  }
}

export function normalizeTrainingAction(
  action: TrainingAction,
  historyNames: string[],
): TrainingAction {
  const names = new Map(
    historyNames.map((name) => [name.trim().toLocaleLowerCase(), name]),
  );
  return {
    ...action,
    exercises: action.exercises.map((exercise) => {
      const savedName = names.get(exercise.name.trim().toLocaleLowerCase());
      return {
        ...exercise,
        name: savedName ?? exercise.name,
        isNewToHistory: savedName === undefined,
        // An unsupported load must not discard the rest of a useful routine.
        suggestedWeightLb:
          savedName === undefined ? null : exercise.suggestedWeightLb,
        targetReps: Array.from(
          { length: exercise.setCount },
          (_, index) =>
            exercise.targetReps[index] ?? exercise.targetReps.at(-1) ?? 8,
        ),
      };
    }),
  };
}

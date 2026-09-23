import AsyncStorage from "@react-native-async-storage/async-storage";

import { nutritionDraftSchema, type NutritionDraft } from "./model";

const writes = new Map<string, Promise<void>>();
const draftKey = (userId: string) => `healthapp:nutrition-draft:${userId}`;

function queueWrite(key: string, operation: () => Promise<void>) {
  const next = (writes.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(operation)
    .finally(() => {
      if (writes.get(key) === next) writes.delete(key);
    });
  writes.set(key, next);
  return next;
}

export function nutritionDraftHasContent(draft: NutritionDraft) {
  return Boolean(draft.entryDay || draft.mealType || draft.entries.length);
}

export async function loadNutritionDraft(
  userId: string,
): Promise<NutritionDraft | undefined> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId));
    if (!raw) return undefined;
    const result = nutritionDraftSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function saveNutritionDraft(userId: string, draft: NutritionDraft) {
  const value = nutritionDraftSchema.parse(draft);
  const key = draftKey(userId);
  return queueWrite(key, () =>
    AsyncStorage.setItem(key, JSON.stringify(value)),
  );
}

export function clearNutritionDraft(userId: string) {
  const key = draftKey(userId);
  return queueWrite(key, () => AsyncStorage.removeItem(key));
}

import {
  deduplicateEstimatedFoods,
  mealEstimateRequestSchema,
  mealEstimateSchema,
  type MealEstimateRequest,
} from "../../../../../supabase/functions/_shared/meal-estimate";
import { supabase } from "../../lib/supabase";

export async function estimateMeal(
  input: MealEstimateRequest,
  signal: AbortSignal,
) {
  const body = mealEstimateRequestSchema.parse(input);
  const { data, error } = await supabase.functions.invoke("estimate-meal", {
    body,
    signal,
  });
  if (signal.aborted) throw new Error("Meal estimation cancelled.");
  if (error) {
    let message =
      "Could not reach AI meal estimation. Check your connection and try again, or add food manually.";
    const context = (error as { context?: Response }).context;
    if (context?.json) {
      try {
        const response = await context.json();
        if (typeof response.message === "string") message = response.message;
        if (context.status === 404)
          message =
            "AI meal estimation is not configured yet. You can still add food manually.";
      } catch {
        /* Keep the connection fallback. */
      }
    }
    throw new Error(message);
  }
  const result = mealEstimateSchema.safeParse(data);
  if (!result.success)
    throw new Error("AI returned an incomplete estimate. Please try again.");
  return {
    ...result.data,
    items: deduplicateEstimatedFoods(result.data.items),
  };
}

import { dayKey } from "./calendar";
import type { FoodRow } from "../streaks/engine";
export function todaysMeals(rows: FoodRow[], now: Date) {
  const meals = new Map<
    string,
    {
      id: string;
      title: string;
      names: string[];
      at: string;
      calories: number;
      protein: number;
    }
  >();
  for (const row of rows) {
    if (dayKey(new Date(row.occurred_at)) !== dayKey(now)) continue;
    const id = row.meal_log_id || row.id;
    const meal = meals.get(id) ?? {
      id,
      title: row.meal_type || "Meal",
      names: [],
      at: row.occurred_at,
      calories: 0,
      protein: 0,
    };
    if (row.food_name) meal.names.push(row.food_name);
    meal.calories += Number(row.calories ?? 0);
    meal.protein += Number(row.protein_grams ?? 0);
    meals.set(id, meal);
  }
  return [...meals.values()].sort((a, b) => a.at.localeCompare(b.at));
}

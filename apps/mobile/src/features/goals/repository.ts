import { runMutation } from "../../lib/mutations";
import { canonicalJson } from "../../lib/mutation-model";
import { z } from "zod";
import { deviceZone } from "../summary/calendar";
import { normalizeWeightGoal } from "./calculator";

import { supabase } from "../../lib/supabase";

const goalsSchema = z.object({
  calorieCalculation: z.record(z.string(), z.unknown()).optional(),
  fluidCalculation: z.record(z.string(), z.unknown()).optional(),
  calorieGoal: z.number().int().min(0).max(20000).optional(),
  proteinGoal: z.number().int().min(0).max(5000).optional(),
  waterGoalMl: z.number().positive().max(20000).optional(),
  weightGoalLb: z.number().positive().max(2000).optional(),
  systolicGoal: z.number().int().positive().max(300).optional(),
  diastolicGoal: z.number().int().positive().max(200).optional(),
});
export type DailyGoals = z.infer<typeof goalsSchema>;
const goalColumns: Record<keyof DailyGoals, string> = {
  calorieCalculation: "calorie_goal_calculation",
  fluidCalculation: "fluid_goal_calculation",
  calorieGoal: "daily_calorie_goal",
  proteinGoal: "daily_protein_goal",
  waterGoalMl: "daily_water_goal_ml",
  weightGoalLb: "weight_goal_lb",
  systolicGoal: "bp_systolic_goal",
  diastolicGoal: "bp_diastolic_goal",
};
const rawGoals = new WeakMap<DailyGoals, Record<string, unknown>>();
function parseGoals(data: Record<string, unknown>): DailyGoals {
  const parsed = goalsSchema.parse(
    Object.fromEntries(
      Object.entries(goalColumns).map(([key, column]) => [
        key,
        data[column] ?? undefined,
      ]),
    ),
  );
  rawGoals.set(parsed, data);
  return parsed;
}
export async function getDailyGoals(userId: string): Promise<DailyGoals> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "daily_calorie_goal, daily_protein_goal, daily_water_goal_ml, weight_goal_lb, bp_systolic_goal, bp_diastolic_goal, calorie_goal_calculation, fluid_goal_calculation",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return {};
  return parseGoals(data);
}

export async function saveDailyGoals(
  userId: string,
  input: DailyGoals,
  previous: DailyGoals,
): Promise<DailyGoals> {
  const goals = goalsSchema.parse(input);
  const changes: Record<string, unknown> = {};
  const baseline: Record<string, unknown> = {};
  const before =
    rawGoals.get(previous) ??
    Object.fromEntries(
      Object.entries(goalColumns).map(([key, column]) => [
        column,
        previous[key as keyof DailyGoals] ?? null,
      ]),
    );
  for (const key of Object.keys(goalColumns) as (keyof DailyGoals)[]) {
    if (
      canonicalJson(goals[key] ?? null) === canonicalJson(previous[key] ?? null)
    )
      continue;
    const column = goalColumns[key];
    changes[column] =
      key === "weightGoalLb" && goals.weightGoalLb !== undefined
        ? normalizeWeightGoal(goals.weightGoalLb)
        : (goals[key] ?? null);
    baseline[column] = before[column] ?? null;
  }
  // Calculation provenance and the corresponding numeric goal are one edit.
  for (const [value, metadata] of [
    ["daily_calorie_goal", "calorie_goal_calculation"],
    ["daily_water_goal_ml", "fluid_goal_calculation"],
  ]) {
    if (!(value in changes) && !(metadata in changes)) continue;
    if (!(value in changes)) changes[value] = before[value] ?? null;
    if (!(metadata in changes)) changes[metadata] = before[metadata] ?? null;
    baseline[value] = before[value] ?? null;
    baseline[metadata] = before[metadata] ?? null;
  }
  if (!Object.keys(changes).length) return previous;
  const result = await runMutation<Record<string, unknown>>(
    userId,
    "goals",
    { changes, baseline },
    () => ({ action: "goals", changes, baseline, zone: deviceZone() }),
  );
  return parseGoals(result);
}

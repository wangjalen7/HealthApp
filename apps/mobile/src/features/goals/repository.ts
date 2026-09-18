import { z } from "zod";
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
  return goalsSchema.parse({
    calorieCalculation: data.calorie_goal_calculation ?? undefined,
    fluidCalculation: data.fluid_goal_calculation ?? undefined,
    calorieGoal: data.daily_calorie_goal ?? undefined,
    proteinGoal: data.daily_protein_goal ?? undefined,
    waterGoalMl:
      data.daily_water_goal_ml === null
        ? undefined
        : Number(data.daily_water_goal_ml),
    weightGoalLb:
      data.weight_goal_lb === null
        ? undefined
        : normalizeWeightGoal(Number(data.weight_goal_lb)),
    systolicGoal: data.bp_systolic_goal ?? undefined,
    diastolicGoal: data.bp_diastolic_goal ?? undefined,
  });
}
export async function saveDailyGoals(
  userId: string,
  input: DailyGoals,
): Promise<void> {
  const goals = goalsSchema.parse(input);
  const { error } = await supabase
    .from("profiles")
    .update({
      calorie_goal_calculation: goals.calorieCalculation ?? {
        method: "custom",
        acceptedAt: new Date().toISOString(),
      },
      fluid_goal_calculation: goals.fluidCalculation ?? {
        method: "custom",
        acceptedAt: new Date().toISOString(),
      },
      daily_calorie_goal: goals.calorieGoal ?? null,
      daily_protein_goal: goals.proteinGoal ?? null,
      daily_water_goal_ml: goals.waterGoalMl ?? null,
      weight_goal_lb:
        goals.weightGoalLb === undefined
          ? null
          : normalizeWeightGoal(goals.weightGoalLb),
      bp_systolic_goal: goals.systolicGoal ?? null,
      bp_diastolic_goal: goals.diastolicGoal ?? null,
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

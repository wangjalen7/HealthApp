import { z } from "zod";

import { supabase } from "../../lib/supabase";

const goalsSchema = z.object({
  calorieGoal: z.number().int().min(0).max(20000).optional(),
  proteinGoal: z.number().int().min(0).max(5000).optional(),
  weightGoalLb: z.number().positive().max(2000).optional(),
  systolicGoal: z.number().int().positive().max(300).optional(),
  diastolicGoal: z.number().int().positive().max(200).optional(),
});
export type DailyGoals = z.infer<typeof goalsSchema>;
export async function getDailyGoals(userId: string): Promise<DailyGoals> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "daily_calorie_goal, daily_protein_goal, weight_goal_lb, bp_systolic_goal, bp_diastolic_goal",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return {};
  return goalsSchema.parse({
    calorieGoal: data.daily_calorie_goal ?? undefined,
    proteinGoal: data.daily_protein_goal ?? undefined,
    weightGoalLb:
      data.weight_goal_lb === null ? undefined : Number(data.weight_goal_lb),
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
      daily_calorie_goal: goals.calorieGoal ?? null,
      daily_protein_goal: goals.proteinGoal ?? null,
      weight_goal_lb: goals.weightGoalLb ?? null,
      bp_systolic_goal: goals.systolicGoal ?? null,
      bp_diastolic_goal: goals.diastolicGoal ?? null,
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

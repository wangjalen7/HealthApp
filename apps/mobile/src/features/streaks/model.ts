import { z } from "zod";
import { habits, type Habit } from "../summary/layout";
export const ruleConfigSchema = z
  .object({
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .default([0, 1, 2, 3, 4, 5, 6]),
    trainingDays: z.number().int().min(1).max(7).default(3),
    includeImports: z.boolean().default(false),
    calorieMode: z
      .enum(["under", "over", "tolerance", "range"])
      .default("under"),
    tolerance: z.number().min(0).max(0.5).default(0.1),
    lower: z.number().positive().max(20000).optional(),
    upper: z.number().positive().max(20000).optional(),
    reminderId: z.string().optional(),
  })
  .refine(
    (v) =>
      v.calorieMode !== "range" ||
      (v.lower !== undefined && v.upper !== undefined && v.lower <= v.upper),
    "Enter a valid inclusive calorie range.",
  );
export type RuleConfig = z.infer<typeof ruleConfigSchema>;
export const ruleSchema = z.preprocess((input) => {
  if (input && typeof input === "object" && "habit" in input && input.habit === "calorie_target" && "config" in input && input.config && typeof input.config === "object" && !("calorieMode" in input.config))
    return { ...input, config: { ...input.config, calorieMode: "tolerance" } };
  return input;
}, z.object({
  habit: z.enum(habits),
  effective_day: z.string(),
  activation_day: z.string(),
  enabled: z.boolean(),
  version: z.literal(1),
  config: ruleConfigSchema,
}));
export type Rule = z.infer<typeof ruleSchema>;
// Keep retired server records intact, but never offer or evaluate this habit.
export function parseActiveRules(rows: { habit: string }[]): Rule[] {
  return rows.filter((row) => row.habit !== "food_complete").map((row) => ruleSchema.parse(row));
}
export type GoalSnapshot = {
  effective_day: string;
  calorie_goal: number | null;
  protein_goal: number | null;
  fluid_goal_ml: number | null;
  protein_source?: string;
  weight_id?: string | null;
};
export const explanations: Record<Habit, string> = {
  daily_logging:
    "At least one user-created saved food, positive drink, completed training session, manual weight or paired BP reading, or explicitly completed reminder. Imports, edits alone and drafts do not count.",
  food_logging:
    "At least one saved food entry. This records logging, not complete intake.",
  calorie_target:
    "Saved food totals at or under (or at or over) the dated calorie target. Equality qualifies; empty days do not. Today is provisional and later edits recalculate progress. This tracks recorded calories, not complete intake. Earlier days are also recalculated without manual confirmation.",
  protein_target:
    "Logged protein meets the positive target effective that day. This does not claim complete intake.",
  fluid_logging:
    "At least one positive saved drink, independently of goal contribution.",
  fluid_target:
    "Counted fluid volume meets the positive goal effective that day. Alcohol counts zero; unknown classification remains pending.",
  training:
    "The chosen number of distinct training days in a Monday–Sunday week. Lifting needs valid saved sets; cardio needs a positive duration.",
  weight:
    "A valid weight reading on each selected weekday. Manual readings by default; imported readings count only if selected.",
  bp: "One valid paired blood pressure reading completes each local day. Manual and imported readings count automatically. BP is now daily; earlier weekday and manual-only preferences no longer apply.",
  reminder:
    "All due occurrences of the selected recurring reminder are explicitly completed for that day. On this device; recorded completion is not verified medication adherence.",
};

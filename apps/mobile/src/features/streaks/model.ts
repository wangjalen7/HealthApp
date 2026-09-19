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
    calorieMode: z.enum(["tolerance", "range"]).default("tolerance"),
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
export const ruleSchema = z.object({
  habit: z.enum(habits),
  effective_day: z.string(),
  activation_day: z.string(),
  enabled: z.boolean(),
  version: z.literal(1),
  config: ruleConfigSchema,
});
export type Rule = z.infer<typeof ruleSchema>;
export type GoalSnapshot = {
  effective_day: string;
  calorie_goal: number | null;
  protein_goal: number | null;
  fluid_goal_ml: number | null;
  protein_source?: string;
  weight_id?: string | null;
};
export type FoodCompletion = {
  local_day: string;
  time_zone: string;
  fingerprint: string;
  confirmed_at: string;
};
export const explanations: Record<Habit, string> = {
  daily_logging:
    "At least one user-created saved food, positive drink, completed training session, manual weight or paired BP reading, or explicitly completed reminder. Imports, edits alone and drafts do not count.",
  food_logging:
    "At least one saved food entry. This records logging, not complete intake.",
  food_complete:
    "You explicitly confirmed this day's food log. Food changes require reconfirmation.",
  calorie_target:
    "A confirmed food day whose logged calories fall inside your inclusive range. The tolerance is a tracking preference, not a medical threshold.",
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
  bp: "A valid paired systolic/diastolic reading on each selected weekday. Manual readings by default.",
  reminder:
    "All due occurrences of the selected recurring reminder are explicitly completed for that day. On this device; recorded completion is not verified medication adherence.",
};

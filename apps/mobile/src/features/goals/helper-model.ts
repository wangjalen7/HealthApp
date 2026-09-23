import { z } from "zod";
import {
  bodyMassIndex,
  calculateMaintenance,
  calculateBmr,
  calorieTargetForGoal,
  calorieTargetForLossRate,
  canUseCalorieTarget,
  calculateFluidGoal,
  centimetersToFeetAndInches,
  kilogramsToPounds,
  poundsToKilograms,
  millilitersToFluidOunces,
  ENERGY_ACTIVITY_FACTORS,
} from "./calculator";
import { localEntryDay } from "../../lib/entry-date";

const text = z.string().max(100);
const optionalNumber = z.number().finite().optional();
const sex = z.enum(["male", "female"]).optional();
export const calorieDraftSchema = z.object({
  unitSystem: z.enum(["us", "metric"]),
  age: text,
  heightFeet: text,
  heightInches: text,
  heightMetric: text,
  heightCm: optionalNumber,
  currentWeight: text,
  weightKg: optionalNumber,
  goalWeight: text,
  goalWeightKg: optionalNumber,
  sex,
  activity: z.enum([
    "sedentary",
    "light",
    "moderate",
    "active",
    "very_active",
    "extra_active",
  ]),
  intent: z.enum(["maintain", "lose", "gain"]),
  targetDate: text,
  lossPlan: z.enum(["date", "rate"]),
  lossRate: z.number().min(0.1).max(2),
  gain: z.enum(["gain_5", "gain_10"]),
});
export type CalorieDraft = z.infer<typeof calorieDraftSchema>;
export const fluidDraftSchema = z.object({
  unit: z.enum(["fl_oz", "ml"]),
  mode: z.enum(["suggested", "custom"]),
  sex,
  activity: z.enum(["low", "light", "moderate", "high"]).optional(),
  custom: text,
  customMl: optionalNumber,
});
export type FluidDraft = z.infer<typeof fluidDraftSchema>;
const resultBase = {
  target: z.number().positive().max(20000),
  calculatedAt: z.iso.datetime().optional(),
  startDate: z.iso.date().optional(),
  assumptions: z.record(z.string(), z.unknown()),
};
export const calorieResultSchema = z.object({
  ...resultBase,
  kind: z.literal("calories"),
  inputs: calorieDraftSchema,
  maintenance: z.number().positive().optional(),
  bmr: z.number().positive().optional(),
  weeks: optionalNumber,
  rateLbPerWeek: optionalNumber,
});
export const fluidResultSchema = z.object({
  ...resultBase,
  kind: z.literal("fluids"),
  inputs: fluidDraftSchema,
});
export type CalorieResult = z.infer<typeof calorieResultSchema>;
export type FluidResult = z.infer<typeof fluidResultSchema>;
export type HelperResult = CalorieResult | FluidResult;
export type HelperKind = HelperResult["kind"];
export const parseNumber = (value: string) => {
  const n = value.trim() ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
export const displayNumber = (value: number, digits = 2) =>
  String(Number(value.toFixed(digits)));
export function calorieDefaults(
  unitSystem: "us" | "metric",
  intent: CalorieDraft["intent"],
  weightLb?: number,
  goalLb?: number,
): CalorieDraft {
  return {
    unitSystem,
    intent,
    age: "",
    heightFeet: "",
    heightInches: "",
    heightMetric: "",
    currentWeight:
      weightLb === undefined
        ? ""
        : displayNumber(
            unitSystem === "us" ? weightLb : poundsToKilograms(weightLb),
          ),
    weightKg: weightLb === undefined ? undefined : poundsToKilograms(weightLb),
    goalWeight:
      goalLb === undefined
        ? ""
        : displayNumber(
            unitSystem === "us" ? goalLb : poundsToKilograms(goalLb),
          ),
    goalWeightKg: goalLb === undefined ? undefined : poundsToKilograms(goalLb),
    activity: "sedentary",
    targetDate: "",
    lossPlan: "date",
    lossRate: 1,
    gain: "gain_5",
  };
}
export function fluidDefaults(
  unit: FluidDraft["unit"],
  ml?: number,
): FluidDraft {
  return {
    unit,
    mode: "suggested",
    custom:
      ml === undefined
        ? ""
        : displayNumber(unit === "ml" ? ml : millilitersToFluidOunces(ml), 1),
    customMl: ml,
  };
}
export function calorieUnits(
  input: CalorieDraft,
  unitSystem: CalorieDraft["unitSystem"],
): CalorieDraft {
  const converted =
    input.heightCm === undefined
      ? undefined
      : centimetersToFeetAndInches(input.heightCm);
  if (converted && Number(displayNumber(converted.inches)) >= 12) {
    converted.feet += 1;
    converted.inches = 0;
  }
  return {
    ...input,
    unitSystem,
    currentWeight:
      input.weightKg === undefined
        ? input.currentWeight
        : displayNumber(
            unitSystem === "us"
              ? kilogramsToPounds(input.weightKg)
              : input.weightKg,
          ),
    goalWeight:
      input.goalWeightKg === undefined
        ? input.goalWeight
        : displayNumber(
            unitSystem === "us"
              ? kilogramsToPounds(input.goalWeightKg)
              : input.goalWeightKg,
          ),
    heightMetric:
      input.heightCm === undefined
        ? input.heightMetric
        : displayNumber(input.heightCm),
    heightFeet: converted ? String(converted.feet) : input.heightFeet,
    heightInches: converted
      ? displayNumber(converted.inches)
      : input.heightInches,
  };
}
export function fluidUnits(
  input: FluidDraft,
  unit: FluidDraft["unit"],
): FluidDraft {
  return {
    ...input,
    unit,
    custom:
      input.customMl === undefined
        ? input.custom
        : displayNumber(
            unit === "ml"
              ? input.customMl
              : millilitersToFluidOunces(input.customMl),
            2,
          ),
  };
}
// Compare calendar-day ordinals, not elapsed hours; DST never changes a plan's duration.
function ordinal(day: string) {
  const parsed = z.iso.date().safeParse(day);
  if (!parsed.success) throw Error("Choose a valid target date.");
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86400000;
}
export function targetWeeks(startDate: string, targetDate: string) {
  const days = ordinal(targetDate) - ordinal(startDate);
  if (days <= 0) throw Error("Choose a target date after today.");
  if (days < 7) throw Error("Choose a date at least one week away.");
  if (days > 3640) throw Error("Choose a date within 520 weeks.");
  return days / 7;
}
export function calculateCalorieResult(
  inputs: CalorieDraft,
  now = new Date(),
): CalorieResult {
  const ageYears = parseNumber(inputs.age);
  if (
    ageYears === undefined ||
    inputs.heightCm === undefined ||
    inputs.weightKg === undefined ||
    !inputs.sex
  )
    throw Error("Enter age, height, current weight and Gender.");
  if (
    inputs.unitSystem === "us" &&
    (parseNumber(inputs.heightInches) === undefined ||
      Number(inputs.heightInches.replace(",", ".")) < 0 ||
      Number(inputs.heightInches.replace(",", ".")) >= 12)
  )
    throw Error("Enter height as feet and 0-11.9 inches.");
  const details = {
    ageYears,
    heightCm: inputs.heightCm,
    weightKg: inputs.weightKg,
    sex: inputs.sex,
    activity: inputs.activity,
  };
  const maintenance = calculateMaintenance(details);
  let target = calorieTargetForGoal(
    maintenance,
    inputs.intent === "gain" ? inputs.gain : "maintain",
  );
  let weeks: number | undefined, rateLbPerWeek: number | undefined;
  const startDate = localEntryDay(now);
  if (inputs.intent === "lose") {
    if (inputs.goalWeightKg === undefined)
      throw Error("Enter your goal weight.");
    const currentLb = kilogramsToPounds(inputs.weightKg),
      goalLb = kilogramsToPounds(inputs.goalWeightKg);
    if (
      currentLb < 66 ||
      currentLb > 1102 ||
      goalLb < 66 ||
      goalLb > 1102 ||
      goalLb >= currentLb
    )
      throw Error(
        "For weight loss, goal weight must be below current weight and within 66-1,102 lb (30-500 kg).",
      );
    if (
      bodyMassIndex(inputs.weightKg, inputs.heightCm) < 18.5 ||
      bodyMassIndex(inputs.goalWeightKg, inputs.heightCm) < 18.5
    )
      throw Error(
        "Loss targets are not offered when current or goal BMI is below 18.5. Use a manual or clinician-directed goal.",
      );
    if (inputs.lossPlan === "date") {
      weeks = targetWeeks(startDate, inputs.targetDate);
      rateLbPerWeek = (currentLb - goalLb) / weeks;
      if (rateLbPerWeek > 2)
        throw Error(
          "This date requires more than 2 lb/week (0.91 kg/week). Choose a later date.",
        );
      if (rateLbPerWeek < 0.1)
        throw Error(
          "This date requires less than 0.1 lb/week (0.05 kg/week), outside the supported range. Choose a closer date or a manual goal.",
        );
    } else {
      rateLbPerWeek = inputs.lossRate;
      weeks = (currentLb - goalLb) / rateLbPerWeek;
    }
    target = calorieTargetForLossRate(maintenance, rateLbPerWeek);
  }
  if (!canUseCalorieTarget(target))
    throw Error(
      inputs.intent === "lose"
        ? "This estimate is outside 1,000-20,000 kcal/day. Choose a later date, a slower option or a manual goal."
        : "This estimate is outside 1,000-20,000 kcal/day. Use a manual or clinician-directed goal.",
    );
  return {
    kind: "calories",
    inputs: { ...inputs },
    target: Math.round(target),
    maintenance,
    bmr: calculateBmr(details),
    weeks,
    rateLbPerWeek,
    calculatedAt: now.toISOString(),
    startDate,
    assumptions: {
      method: "mifflin_st_jeor_v1",
      ...details,
      maintenance,
      intent: inputs.intent,
      lossRateLbPerWeek: rateLbPerWeek,
      activityFactor: ENERGY_ACTIVITY_FACTORS[inputs.activity],
      deficitPerLbPerWeek: 500,
      gain: inputs.intent === "gain" ? inputs.gain : undefined,
      targetDate:
        inputs.intent === "lose" && inputs.lossPlan === "date"
          ? inputs.targetDate
          : undefined,
      startDate,
    },
  };
}
export function calculateFluidResult(
  inputs: FluidDraft,
  now = new Date(),
): FluidResult {
  const input =
    inputs.mode === "custom"
      ? { mode: inputs.mode, customMl: inputs.customMl }
      : { mode: inputs.mode, sex: inputs.sex, activity: inputs.activity };
  return {
    kind: "fluids",
    inputs: { ...inputs },
    target: calculateFluidGoal(input),
    calculatedAt: now.toISOString(),
    startDate: localEntryDay(now),
    assumptions: { method: "beverage_activity_goal_v2", ...input },
  };
}
export function latestResult(
  kind: HelperKind,
  metadata?: Record<string, unknown>,
): HelperResult | undefined {
  const parsed = (
    kind === "calories" ? calorieResultSchema : fluidResultSchema
  ).safeParse(metadata?.latestCalculation);
  return parsed.success ? parsed.data : undefined;
}
export function restoreCalorie(
  metadata: Record<string, unknown> | undefined,
  defaults: CalorieDraft,
  applied?: number,
): { inputs: CalorieDraft; result?: CalorieResult } {
  const current = latestResult("calories", metadata) as
    CalorieResult | undefined;
  if (current) return { inputs: current.inputs, result: current };
  if (!metadata) return { inputs: defaults };
  const n = (key: string) =>
    typeof metadata[key] === "number" && Number.isFinite(metadata[key])
      ? (metadata[key] as number)
      : undefined;
  const input = {
    ...defaults,
    age: n("ageYears") === undefined ? defaults.age : String(n("ageYears")),
    heightCm: n("heightCm"),
    heightFeet: "",
    heightInches: "",
    heightMetric: "",
    weightKg: n("weightKg"),
    currentWeight: "",
    sex: sex.safeParse(metadata.sex).success
      ? (metadata.sex as CalorieDraft["sex"])
      : undefined,
    activity: calorieDraftSchema.shape.activity
      .catch(defaults.activity)
      .parse(metadata.activity),
    intent: calorieDraftSchema.shape.intent
      .catch(defaults.intent)
      .parse(metadata.intent),
    lossPlan: "rate" as const,
    lossRate: calorieDraftSchema.shape.lossRate
      .catch(1)
      .parse(metadata.lossRateLbPerWeek),
  };
  const inputs = calorieUnits(input, defaults.unitSystem);
  const date = z.iso
    .datetime()
    .safeParse(metadata.calculatedAt ?? metadata.acceptedAt);
  const target = n("target") ?? applied;
  const result =
    metadata.method === "mifflin_st_jeor_v1" &&
    target &&
    canUseCalorieTarget(target) &&
    n("maintenance")
      ? {
          kind: "calories" as const,
          inputs,
          target,
          maintenance: n("maintenance"),
          calculatedAt: date.success ? date.data : undefined,
          rateLbPerWeek: n("lossRateLbPerWeek"),
          assumptions: metadata,
        }
      : undefined;
  return { inputs, result };
}
export function restoreFluid(
  metadata: Record<string, unknown> | undefined,
  defaults: FluidDraft,
  applied?: number,
): { inputs: FluidDraft; result?: FluidResult } {
  const current = latestResult("fluids", metadata) as FluidResult | undefined;
  if (current) return { inputs: current.inputs, result: current };
  if (!metadata) return { inputs: defaults };
  const mode = fluidDraftSchema.shape.mode
    .catch(defaults.mode)
    .parse(metadata.mode);
  const customMl =
    typeof metadata.customMl === "number" && Number.isFinite(metadata.customMl)
      ? metadata.customMl
      : defaults.customMl;
  const inputs = fluidUnits(
    {
      ...defaults,
      mode,
      customMl,
      sex: sex.safeParse(metadata.sex).success
        ? (metadata.sex as FluidDraft["sex"])
        : undefined,
      activity: fluidDraftSchema.shape.activity
        .catch(undefined)
        .parse(metadata.activity),
    },
    defaults.unit,
  );
  const date = z.iso
    .datetime()
    .safeParse(metadata.calculatedAt ?? metadata.acceptedAt);
  const target =
    typeof metadata.target === "number" ? metadata.target : applied;
  const result =
    metadata.method === "beverage_activity_goal_v2" &&
    target &&
    target > 0 &&
    target <= 20000
      ? {
          kind: "fluids" as const,
          inputs,
          target,
          calculatedAt: date.success ? date.data : undefined,
          assumptions: metadata,
        }
      : undefined;
  return { inputs, result };
}
export function appliedCalculation(result: HelperResult) {
  return {
    ...result.assumptions,
    target: result.target,
    calculatedAt: result.calculatedAt,
    acceptedAt: new Date().toISOString(),
    helperVersion: 2,
    latestCalculation: result,
  };
}

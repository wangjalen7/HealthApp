export const POUNDS_TO_KILOGRAMS = 0.45359237;
export const INCHES_TO_CENTIMETERS = 2.54;
export const FLUID_OUNCES_TO_MILLILITERS = 29.5735295625;

export type EnergyEquationSex = "male" | "female";
export const ENERGY_ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.465,
  active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
} as const;
export type EnergyActivity = keyof typeof ENERGY_ACTIVITY_FACTORS;
export const MINIMUM_GENERATED_CALORIES = 1000;
export type EnergyInput = {
  ageYears: number;
  heightCm: number;
  weightKg: number;
  sex: EnergyEquationSex;
  activity: EnergyActivity;
};
function finiteBetween(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}
export function calculateBmr(input: EnergyInput): number {
  if (!finiteBetween(input.ageYears, 19, 120))
    throw new Error("This calculator supports adults age 19 and older.");
  if (!finiteBetween(input.heightCm, 100, 250))
    throw new Error("Enter a height between 100 and 250 cm.");
  if (!finiteBetween(input.weightKg, 30, 500))
    throw new Error("Enter a weight between 30 and 500 kg.");
  if (input.sex !== "male" && input.sex !== "female")
    throw new Error("Choose an equation category.");
  return (
    10 * input.weightKg +
    6.25 * input.heightCm -
    5 * input.ageYears +
    (input.sex === "male" ? 5 : -161)
  );
}
export function calculateMaintenance(input: EnergyInput): number {
  const factor = ENERGY_ACTIVITY_FACTORS[input.activity];
  if (!factor) throw new Error("Choose an activity level.");
  return calculateBmr(input) * factor;
}
export function canUseCalorieTarget(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MINIMUM_GENERATED_CALORIES &&
    value <= 20000
  );
}

export function poundsToKilograms(pounds: number) {
  return pounds * POUNDS_TO_KILOGRAMS;
}

export function kilogramsToPounds(kilograms: number) {
  return kilograms / POUNDS_TO_KILOGRAMS;
}

export function feetAndInchesToCentimeters(feet: number, inches: number) {
  return (feet * 12 + inches) * INCHES_TO_CENTIMETERS;
}

export function centimetersToFeetAndInches(centimeters: number) {
  const totalInches = centimeters / INCHES_TO_CENTIMETERS;
  const feet = Math.floor(totalInches / 12);
  return { feet, inches: totalInches - feet * 12 };
}

export function bodyMassIndex(weightKg: number, heightCm: number) {
  if (!finiteBetween(weightKg, 1, 500) || !finiteBetween(heightCm, 50, 250))
    throw new Error("Enter a valid height and weight.");
  return weightKg / (heightCm / 100) ** 2;
}

export function roundCaloriesForDisplay(value: number) {
  return Math.round(value);
}

export type LossScenario = {
  id: string;
  rateLbPerWeek: number;
  targetCalories: number;
  displayCalories: number;
  estimatedWeeks?: number;
  fromTimeframe: boolean;
  available: boolean;
};

export function calorieTargetForLossRate(
  maintenanceCalories: number,
  rateLbPerWeek: number,
) {
  if (!Number.isFinite(maintenanceCalories) || maintenanceCalories <= 0)
    throw new Error("Maintenance calories must be greater than zero.");
  if (!finiteBetween(rateLbPerWeek, 0.1, 2))
    throw new Error("Choose a planning rate between 0.1 and 2 lb per week.");
  // A transparent short-term planning heuristic, not a dynamic weight model.
  return maintenanceCalories - rateLbPerWeek * 500;
}

export function lossScenarios({
  maintenanceCalories,
  currentWeightLb,
  goalWeightLb,
  timeframeWeeks,
}: {
  maintenanceCalories: number;
  currentWeightLb: number;
  goalWeightLb: number;
  timeframeWeeks?: number;
}): {
  scenarios: LossScenario[];
  timeframeRate?: number;
  timeframeMessage?: string;
} {
  if (!finiteBetween(currentWeightLb, 66, 1102))
    throw new Error("Enter your current weight.");
  if (!finiteBetween(goalWeightLb, 66, 1102) || goalWeightLb >= currentWeightLb)
    throw new Error(
      "For weight loss, goal weight must be below current weight.",
    );
  const poundsToLose = currentWeightLb - goalWeightLb;
  const standardRates = [0.5, 1, 1.5, 2];
  const scenarios = standardRates.map((rate) => {
    const targetCalories = calorieTargetForLossRate(maintenanceCalories, rate);
    return {
      id: `rate-${rate}`,
      rateLbPerWeek: rate,
      targetCalories,
      displayCalories: roundCaloriesForDisplay(targetCalories),
      estimatedWeeks: poundsToLose / rate,
      fromTimeframe: false,
      available: canUseCalorieTarget(targetCalories),
    };
  });
  if (timeframeWeeks === undefined) return { scenarios };
  if (!finiteBetween(timeframeWeeks, 1, 520))
    throw new Error("Enter a timeframe between 1 and 520 weeks.");
  const timeframeRate = poundsToLose / timeframeWeeks;
  if (timeframeRate > 2) {
    return {
      scenarios,
      timeframeRate,
      timeframeMessage:
        "That timeframe averages more than 2 lb per week, so it is not offered as a calorie target.",
    };
  }
  if (timeframeRate < 0.1) {
    return {
      scenarios,
      timeframeRate,
      timeframeMessage:
        "That timeframe is close to maintenance. Choose the 0.5 lb/week option or set a manual goal.",
    };
  }
  if (!standardRates.some((rate) => Math.abs(rate - timeframeRate) < 0.01)) {
    const targetCalories = calorieTargetForLossRate(
      maintenanceCalories,
      timeframeRate,
    );
    scenarios.unshift({
      id: "timeframe",
      rateLbPerWeek: timeframeRate,
      targetCalories,
      displayCalories: roundCaloriesForDisplay(targetCalories),
      estimatedWeeks: timeframeWeeks,
      fromTimeframe: true,
      available: canUseCalorieTarget(targetCalories),
    });
  }
  return { scenarios, timeframeRate };
}

export function calorieTargetForGoal(
  maintenanceCalories: number,
  goal: "maintain" | "gain_5" | "gain_10",
) {
  if (!Number.isFinite(maintenanceCalories) || maintenanceCalories <= 0)
    throw new Error("Maintenance calories must be greater than zero.");
  const multiplier = goal === "gain_5" ? 1.05 : goal === "gain_10" ? 1.1 : 1;
  return maintenanceCalories * multiplier;
}

export type HydrationReference = {
  beverageMl: number;
  totalWaterMl: number;
};

export function getHydrationReference(
  category: EnergyEquationSex,
): HydrationReference {
  return category === "male"
    ? { beverageMl: 3000, totalWaterMl: 3700 }
    : { beverageMl: 2200, totalWaterMl: 2700 };
}

export function millilitersToFluidOunces(value: number) {
  return value / FLUID_OUNCES_TO_MILLILITERS;
}

export function fluidOuncesToMilliliters(value: number) {
  return value * FLUID_OUNCES_TO_MILLILITERS;
}

// Activity additions are modest app planning allowances, not measured fluid losses.
export const fluidActivities = [
  {
    id: "low",
    label: "Mostly sitting",
    detail: "Little exercise or light daily movement",
    extraMl: 0,
  },
  {
    id: "light",
    label: "Lightly active",
    detail: "Regular walks or light workouts",
    extraMl: 250,
  },
  {
    id: "moderate",
    label: "Moderately active",
    detail: "Regular workouts or an active day",
    extraMl: 500,
  },
  {
    id: "high",
    label: "Very active",
    detail: "Hard training or a physical job",
    extraMl: 750,
  },
] as const;
export type FluidActivity = (typeof fluidActivities)[number]["id"];
export function normalizeWeightGoal(value: number) {
  return Number(value.toFixed(4));
}
export function calculateFluidGoal(input: {
  mode: "custom" | "suggested";
  customMl?: number;
  sex?: EnergyEquationSex;
  activity?: FluidActivity;
}): number {
  if (input.mode === "custom") {
    if (
      input.customMl === undefined ||
      !finiteBetween(input.customMl, 1, 20000)
    )
      throw new Error("Enter a custom goal between 1 and 20,000 mL.");
    return input.customMl;
  }
  if (input.sex !== "male" && input.sex !== "female")
    throw new Error("Choose your sex to see a suggested goal.");
  const activity = fluidActivities.find((item) => item.id === input.activity);
  if (!activity) throw new Error("Choose your usual activity level.");
  return getHydrationReference(input.sex).beverageMl + activity.extraMl;
}

import type { VitalSample } from "../../domain/vitals";
import type { DailyGoals } from "../goals/repository";
import { displayNumber } from "../goals/helper-model";
import {
  millilitersToFluidOunces,
  poundsToKilograms,
} from "../goals/calculator";
export const goalKinds = [
  "calories",
  "protein",
  "fluids",
  "weight",
  "blood-pressure",
] as const;
export type GoalKind = (typeof goalKinds)[number];
export const goalLabels: Record<GoalKind, string> = {
  calories: "Calories",
  protein: "Protein",
  fluids: "Fluids",
  weight: "Weight",
  "blood-pressure": "Blood Pressure",
};
export function automaticProtein(weight?: VitalSample) {
  if (!weight) return undefined;
  // Match Summary's existing automatic rule and conversion exactly.
  return Math.round(
    (weight.unit === "kg" ? weight.value * 2.20462 : weight.value) * 0.7,
  );
}
export function goalDisplay(
  kind: GoalKind,
  goals: DailyGoals,
  units: "us" | "metric",
  fluid: "ml" | "fl_oz",
  weight?: VitalSample,
) {
  switch (kind) {
    case "calories":
      return goals.calorieGoal === undefined
        ? "Not Set"
        : `${goals.calorieGoal.toLocaleString()} kcal/day`;
    case "protein": {
      const resolved = automaticProtein(weight);
      return goals.proteinGoal !== undefined
        ? `${goals.proteinGoal} g/day`
        : resolved === undefined
          ? "Automatic"
          : `Auto · ${resolved} g/day`;
    }
    case "fluids":
      return goals.waterGoalMl === undefined
        ? "Not Set"
        : fluid === "ml"
          ? `${displayNumber(goals.waterGoalMl)} mL/day`
          : `${displayNumber(millilitersToFluidOunces(goals.waterGoalMl), 1)} fl oz/day`;
    case "weight":
      return goals.weightGoalLb === undefined
        ? "Not Set"
        : `${displayNumber(units === "us" ? goals.weightGoalLb : poundsToKilograms(goals.weightGoalLb))} ${units === "us" ? "lb" : "kg"}`;
    case "blood-pressure":
      return goals.systolicGoal === undefined &&
        goals.diastolicGoal === undefined
        ? "Not Set"
        : `${goals.systolicGoal ?? "—"}/${goals.diastolicGoal ?? "—"} mmHg`;
  }
}

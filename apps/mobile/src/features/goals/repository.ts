import AsyncStorage from "@react-native-async-storage/async-storage";
import { runMutation, retryPendingMutation } from "../../lib/mutations";
import {
  canonicalJson,
  EditConflict,
  type PendingMutation,
} from "../../lib/mutation-model";
import { z } from "zod";
import { deviceZone } from "../summary/calendar";
import { normalizeWeightGoal } from "./calculator";
import type { HelperResult } from "./helper-model";
import {
  calorieDefaults,
  fluidDefaults,
  restoreCalorie,
  restoreFluid,
  latestResult,
} from "./helper-model";

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
const pendingKey = (userId: string) =>
  `healthapp:pending-write:v2:${userId}:goals`;
async function pendingGoals(
  userId: string,
): Promise<PendingMutation | undefined> {
  const raw = await AsyncStorage.getItem(pendingKey(userId));
  return raw ? (JSON.parse(raw) as PendingMutation) : undefined;
}
async function confirmPendingGoals(userId: string, pending: PendingMutation) {
  const reply = await retryPendingMutation(userId, pendingKey(userId), pending);
  if (reply?.status === "conflict")
    throw new EditConflict(reply.current, reply.field);
  return reply
    ? parseGoals(reply.data as Record<string, unknown>)
    : getDailyGoals(userId);
}
function withoutAcceptanceTime(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const copy = { ...(value as Record<string, unknown>) };
  delete copy.acceptedAt;
  return copy;
}
function pendingEstimate(pending: PendingMutation | undefined) {
  if (pending?.request.action !== "goals") return undefined;
  const changes = pending.request.changes as Record<string, unknown>;
  const baseline = pending.request.baseline as Record<string, unknown>;
  for (const kind of ["calories", "fluids"] as const) {
    const field =
      kind === "calories" ? "calorieCalculation" : "fluidCalculation";
    const goal = kind === "calories" ? "calorieGoal" : "waterGoalMl";
    const column = goalColumns[field],
      valueColumn = goalColumns[goal];
    if (
      !Object.keys(changes).every(
        (key) => key === column || key === valueColumn,
      )
    )
      continue;
    if (
      canonicalJson(changes[valueColumn]) !==
      canonicalJson(baseline[valueColumn])
    )
      continue;
    const saved = latestResult(
      kind,
      changes[column] as Record<string, unknown> | undefined,
    );
    const stripLatest = (value: unknown) => {
      const copy = { ...(value as Record<string, unknown> | undefined) };
      delete copy.latestCalculation;
      delete copy.helperVersion;
      return copy;
    };
    if (
      saved &&
      canonicalJson(stripLatest(changes[column])) ===
        canonicalJson(stripLatest(baseline[column]))
    )
      return { result: saved, field, goal } as const;
  }
  return undefined;
}
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
  const pending = await pendingGoals(userId);
  const estimate = pendingEstimate(pending);
  // A result can be read after its write succeeded but its response was lost.
  // Explicitly applying that result first confirms the original estimate save.
  if (
    pending &&
    estimate &&
    goals[estimate.goal] === estimate.result.target &&
    goals[estimate.field]?.acceptedAt &&
    canonicalJson(goals[estimate.field]?.latestCalculation) ===
      canonicalJson(estimate.result)
  ) {
    const confirmed = await confirmPendingGoals(userId, pending);
    return saveDailyGoals(userId, goals, confirmed);
  }
  // Retrying the same goal must use its original timestamp and operation ID,
  // including when the first response was lost and its baseline has advanced.
  if (pending?.request.action === "goals") {
    const pendingChanges = pending.request.changes as Record<string, unknown>;
    const sameIntent = Object.entries(goalColumns).every(([key, column]) => {
      const desired = goals[key as keyof DailyGoals] ?? null;
      const expected =
        column in pendingChanges
          ? pendingChanges[column]
          : (previous[key as keyof DailyGoals] ?? null);
      return (
        canonicalJson(withoutAcceptanceTime(desired)) ===
        canonicalJson(withoutAcceptanceTime(expected))
      );
    });
    if (sameIntent) return confirmPendingGoals(userId, pending);
  }
  // Manual goal edits clear applied provenance, but must not erase a previous estimate.
  for (const kind of ["calories", "fluids"] as const) {
    const field =
      kind === "calories" ? "calorieCalculation" : "fluidCalculation";
    if (goals[field] !== undefined || previous[field] === undefined) continue;
    const last =
      kind === "calories"
        ? restoreCalorie(
            previous[field],
            calorieDefaults("us", "maintain", undefined, previous.weightGoalLb),
            previous.calorieGoal,
          ).result
        : restoreFluid(
            previous[field],
            fluidDefaults("fl_oz", previous.waterGoalMl),
            previous.waterGoalMl,
          ).result;
    if (last)
      goals[field] = {
        method: "custom",
        helperVersion: 2,
        latestCalculation: last,
      };
  }
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

/** Save a successful estimate without changing the applied daily goal or its provenance. */
export async function saveGoalCalculation(
  userId: string,
  result: HelperResult,
): Promise<DailyGoals> {
  const field =
    result.kind === "calories" ? "calorieCalculation" : "fluidCalculation";
  const pending = await pendingGoals(userId);
  const estimate = pendingEstimate(pending);
  if (
    pending &&
    estimate?.result.kind === result.kind &&
    canonicalJson(estimate.result.inputs) === canonicalJson(result.inputs)
  )
    return confirmPendingGoals(userId, pending);
  const current = await getDailyGoals(userId);
  return saveDailyGoals(
    userId,
    {
      ...current,
      [field]: {
        ...current[field],
        helperVersion: 2,
        latestCalculation: result,
      },
    },
    current,
  );
}

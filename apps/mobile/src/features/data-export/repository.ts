import type { User } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { assertAccount } from "../../lib/mutations";
import { queuedChanges } from "../vitals/storage";
import { exportableDeviceKey } from "./local-inventory";

import { supabase } from "../../lib/supabase";
import { loadHealthKitSyncState } from "../healthkit/state";
import { loadNutritionDraft } from "../nutrition/draft";
import {
  listReminderCompletions,
  listReminders,
} from "../reminders/repository";
import { loadCardioDraft } from "../training/cardio-draft";
import { loadWorkoutDraft } from "../training/workout-draft";
import { loadCachedVitals } from "../vitals/sync";
import type { ExportRow, HealthDataExport } from "./model";

const pageSize = 1000;

const userTables = [
  "vital_samples",
  "workout_sessions",
  "workout_sets",
  "cardio_entries",
  "nutrition_entries",
  "hydration_entries",
  "saved_drinks",
  "user_food_profiles",
  "food_recipes",
  "progress_photos",
  "coach_threads",
  "coach_messages",
  "coach_actions",
  "account_setup",
  "streak_rules",
  "streak_goal_snapshots",
  "streak_activation",
  "food_day_completions",
  "ai_processing_choices",
  "coach_daily_usage",
  "meal_estimate_usage",
] as const;

type UserTable = (typeof userTables)[number];
const orderColumns: Partial<Record<UserTable, string[]>> = {
  account_setup: ["user_id"], streak_rules: ["habit", "effective_day"],
  streak_goal_snapshots: ["effective_day"], streak_activation: ["user_id"],
  food_day_completions: ["local_day"], ai_processing_choices: ["purpose"],
  coach_daily_usage: ["usage_day"], meal_estimate_usage: ["user_id"],
};

function asRows(value: unknown): ExportRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is ExportRow =>
      typeof row === "object" && row !== null && !Array.isArray(row),
  );
}

async function loadRows(
  table: UserTable,
  userId: string,
): Promise<ExportRow[]> {
  const rows: ExportRow[] = [];
  for (let start = 0; ; start += pageSize) {
    await assertAccount(userId);
    let query = supabase
      .from(table)
      .select("*")
      .eq("user_id", userId);
    for (const column of orderColumns[table] ?? ["id"]) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(start, start + pageSize - 1);
    if (error) throw new Error(`Could not export ${table}. The service may need updating. No complete export was created; try again later.`);
    const page = asRows(data);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function loadSingleRows(
  table: "profiles" | "coach_profiles",
  column: "id" | "user_id",
  userId: string,
): Promise<ExportRow[]> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq(column, userId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return asRows(data);
}

export async function getProgressPhotoExportSummary(userId: string): Promise<{
  count: number;
  bytes: number;
}> {
  let count = 0;
  let bytes = 0;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("progress_photos")
      .select("id, byte_size")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    count += page.length;
    bytes += page.reduce((total, row) => total + Number(row.byte_size || 0), 0);
    if (page.length < pageSize) return { count, bytes };
  }
}

export async function collectHealthDataExport(
  user: User,
): Promise<HealthDataExport> {
  await assertAccount(user.id);
  const deviceEntries = await AsyncStorage.multiGet((await AsyncStorage.getAllKeys()).filter(key => exportableDeviceKey(key,user.id)));
  const deviceSettings = deviceEntries.map(([key,value]) => ({ key, value: value ? JSON.parse(value) as unknown : null }));
  const pendingVitals = await queuedChanges(user.id);
  const remoteRequests = userTables.map(
    async (table) => [table, await loadRows(table, user.id)] as const,
  );
  const [
    profiles,
    coachProfiles,
    remote,
    reminders,
    reminderCompletions,
    workoutDraft,
    cardioDraft,
    nutritionDraft,
    healthKitState,
    deviceVitalCache,
  ] = await Promise.all([
    loadSingleRows("profiles", "id", user.id),
    loadSingleRows("coach_profiles", "user_id", user.id),
    Promise.all(remoteRequests),
    listReminders(user.id),
    listReminderCompletions(user.id),
    loadWorkoutDraft(user.id),
    loadCardioDraft(user.id),
    loadNutritionDraft(user.id),
    loadHealthKitSyncState(user.id),
    loadCachedVitals(user.id),
  ]);

  await assertAccount(user.id);
  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    datasets: {
      device_settings_and_pending_changes: deviceSettings,
      pending_vital_changes: pendingVitals as unknown as ExportRow[],
      account: [
        {
          id: user.id,
          email: user.email ?? null,
          phone: user.phone ?? null,
          created_at: user.created_at,
          updated_at: user.updated_at,
          last_sign_in_at: user.last_sign_in_at ?? null,
          app_metadata: user.app_metadata,
          user_metadata: user.user_metadata,
        },
      ],
      profiles,
      ...Object.fromEntries(remote),
      coach_profiles: coachProfiles,
      reminders: reminders as unknown as ExportRow[],
      reminder_completions: reminderCompletions as unknown as ExportRow[],
      unfinished_workout_draft: workoutDraft
        ? [workoutDraft as unknown as ExportRow]
        : [],
      unfinished_cardio_draft: cardioDraft
        ? [cardioDraft as unknown as ExportRow]
        : [],
      unfinished_nutrition_draft: nutritionDraft
        ? [nutritionDraft as unknown as ExportRow]
        : [],
      healthkit_sync_state: [healthKitState as unknown as ExportRow],
      device_vital_cache: deviceVitalCache as unknown as ExportRow[],
    },
  };
}

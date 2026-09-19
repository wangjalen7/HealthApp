import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { dayKey, deviceZone, monday, shiftDay } from "../summary/calendar";
import { serializedWrite } from "../summary/storage";
import { type Habit } from "../summary/layout";
import {
  ruleConfigSchema,
  ruleSchema,
  type Rule,
  type RuleConfig,
} from "./model";
import { type ScheduleRevision } from "./engine";
import { type Reminder } from "../reminders/model";
const localKey = (u: string) => `healthapp:streak-local:${u}`;
type Local = {
  rules: Rule[];
  schedules: ScheduleRevision[];
  reminderCoverage: string;
};
export async function loadLocalStreaks(user: string): Promise<Local> {
  const raw = await AsyncStorage.getItem(localKey(user));
  if (!raw) return { rules: [], schedules: [], reminderCoverage: dayKey() };
  const data = JSON.parse(raw) as Local;
  data.rules = data.rules.map((r) => ruleSchema.parse(r));
  return data;
}
export async function recordReminderSchedule(
  user: string,
  reminders: Reminder[],
  initial = false,
) {
  return serializedWrite(localKey(user), async () => {
    const data = await loadLocalStreaks(user),
      today = dayKey();
    const effective =
      data.schedules.length && !initial ? shiftDay(today, 1) : today;
    if (initial && data.schedules.length) return;
    data.schedules = [
      ...data.schedules.filter((s) => s.effective_day !== effective),
      { effective_day: effective, reminders },
    ];
    await AsyncStorage.setItem(localKey(user), JSON.stringify(data));
  });
}
export async function saveRule(
  user: string,
  habit: Habit,
  enabled: boolean,
  input: RuleConfig,
) {
  const config = ruleConfigSchema.parse(input);
  if (habit !== "reminder") {
    const { error } = await supabase.rpc("save_streak_rule", {
      p_user_id: user,
      p_habit: habit,
      p_enabled: enabled,
      p_config: config,
      p_zone: deviceZone(),
    });
    if (error) throw new Error(error.message);
    return;
  }
  if (!config.reminderId) throw new Error("Select a recurring reminder.");
  return serializedWrite(localKey(user), async () => {
    const data = await loadLocalStreaks(user),
      activation = data.rules[0]?.activation_day;
    const effective = activation ? shiftDay(dayKey(), 1) : dayKey();
    data.rules = [
      ...data.rules.filter((r) => r.effective_day !== effective),
      {
        habit,
        enabled,
        config,
        version: 1,
        activation_day: activation ?? effective,
        effective_day: effective,
      },
    ];
    await AsyncStorage.setItem(localKey(user), JSON.stringify(data));
  });
}
export async function ensureTracking() {
  const { error } = await supabase.rpc("ensure_streak_tracking", {
    p_day: dayKey(),
    p_zone: deviceZone(),
  });
  if (error) throw new Error(error.message);
}
export async function setFoodDayComplete(day: string, complete: boolean) {
  const { error } = await supabase.rpc("set_food_day_complete", {
    p_day: day,
    p_zone: deviceZone(),
    p_complete: complete,
  });
  if (error) throw new Error(error.message);
}
export function effectiveRuleDay(
  habit: Habit,
  existing: boolean,
  now = new Date(),
) {
  const key = existing ? shiftDay(dayKey(now), 1) : dayKey(now);
  return habit === "training" && monday(key) !== key
    ? shiftDay(monday(key), 7)
    : key;
}

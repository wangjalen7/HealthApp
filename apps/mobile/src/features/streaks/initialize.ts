import { listReminders } from "../reminders/repository";
import {
  loadLocalStreaks,
  recordReminderSchedule,
  saveRule,
} from "./repository";
import { ruleConfigSchema } from "./model";
import { supabase } from "../../lib/supabase";
import { deviceZone } from "../summary/calendar";
import type { Widget } from "../summary/layout";
export async function initializeWidgetHabits(user: string, widgets: Widget[]) {
  const habits = [
    ...new Set(
      widgets.flatMap((w) =>
        w.type === "streaks" ? (w.config.habits ?? []) : [],
      ),
    ),
  ];
  if (!habits.length) return;
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== user)
    throw new Error("Account changed. Reopen Summary.");
  const local = habits.includes("reminder")
    ? await loadLocalStreaks(user)
    : undefined;
  const reminderConfig = widgets.find(
    (w) => w.type === "streaks" && w.config.habits?.includes("reminder"),
  )?.config.reminderId;
  const reminders = local ? await listReminders(user, true) : [];
  const existing = local?.rules.some((r) => r.habit === "reminder");
  const chosen =
    reminderConfig ||
    (reminders.filter((r) => r.enabled && r.repeat !== "once").length === 1
      ? reminders.find((r) => r.enabled && r.repeat !== "once")?.id
      : undefined);
  if (local && !existing && !chosen)
    throw new Error(
      "Choose a recurring reminder in the streak widget options before saving.",
    );
  const { error } = await supabase.rpc("initialize_summary_streaks", {
    p_habits: habits.filter((h) => h !== "reminder"),
    p_zone: deviceZone(),
  });
  if (error) throw new Error(error.message);
  if (local && !existing && chosen) {
    await recordReminderSchedule(user, reminders, true);
    await saveRule(
      user,
      "reminder",
      true,
      ruleConfigSchema.parse({ reminderId: chosen }),
    );
  }
}

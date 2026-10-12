import { supabase } from "../../lib/supabase";
import { deviceZone } from "../summary/calendar";
import { habits, type Widget } from "../summary/layout";
import { loadLocalStreaks, saveRule } from "./repository";
import { parseActiveRules, ruleConfigSchema } from "./model";
export async function initializeWidgetHabits(user: string, widgets: Widget[]) {
  const selected = [
    ...new Set(
      widgets.flatMap((w) =>
        w.type === "streaks" ? (w.config.habits ?? []) : [],
      ),
    ),
  ].filter((habit) => habits.some((active) => active === habit));
  if (!selected.length) return;
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== user)
    throw new Error("Account changed. Reopen Summary.");
  const reminderWidget = widgets.find((widget) =>
    widget.type === "streaks" && widget.config.habits?.includes("reminder"));
  const local = reminderWidget ? await loadLocalStreaks(user) : undefined;
  const reminderRule = local?.rules.filter((rule) => rule.habit === "reminder")
    .sort((a, b) => a.effective_day.localeCompare(b.effective_day)).at(-1);
  const reminderId = reminderWidget?.config.reminderId ?? reminderRule?.config.reminderId;
  if (reminderWidget && !reminderId)
    throw new Error("Choose a recurring reminder for the reminder streak.");
  // The RPC initializes only absent habits. Removing a card never deletes its rules.
  const remote = selected.filter((habit) => habit !== "reminder");
  if (remote.length) {
    const { error } = await supabase.rpc("initialize_summary_streaks", {
      p_habits: remote,
      p_zone: deviceZone(),
    });
    if (error) throw new Error(error.message);
    const { data: rows, error: readError } = await supabase.from("streak_rules")
      .select("*").eq("user_id", user).in("habit", remote).order("effective_day");
    if (readError) throw new Error(readError.message);
    const rules = parseActiveRules(rows ?? []);
    for (const habit of remote) {
      const latest = rules.filter((rule) => rule.habit === habit).at(-1);
      // Resume legacy disabled rules prospectively without rewriting their history.
      if (latest && !latest.enabled) await saveRule(user, habit, true, latest.config);
    }
  }
  if (reminderWidget && (!reminderRule?.enabled || reminderRule.config.reminderId !== reminderId)) {
    await saveRule(user, "reminder", true, {
      ...(reminderRule?.config ?? ruleConfigSchema.parse({})), reminderId,
    });
  }
}

import { supabase } from "../../lib/supabase";
import { deviceZone } from "../summary/calendar";
import { habits, type Widget } from "../summary/layout";
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
  const { error } = await supabase.rpc("initialize_summary_streaks", {
    p_habits: selected,
    p_zone: deviceZone(),
  });
  if (error) throw new Error(error.message);
}

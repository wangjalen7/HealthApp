import type { Period } from "../streaks/engine";
import type { Habit } from "./layout";
import { dayKey, monday, shiftDay } from "./calendar";

/** Calendar-week presentation only; lifetime streak calculation stays in the engine. */
export function streakWeek(habit: Habit, periods: Period[], now: Date) {
  const today = dayKey(now);
  const start = monday(today);
  const week = periods.find((period) => period.day === start);
  return ["M", "T", "W", "T", "F", "S", "S"].map((label, index) => {
    const day = shiftDay(start, index);
    const period =
      habit === "training" ? week : periods.find((p) => p.day === day);
    let state: Period["state"] | "upcoming" | "not_tracked";
    if (day > today) state = "upcoming";
    else if (!period || period.explanation === "before_activation")
      state = "not_tracked";
    else if (habit !== "training") state = period.state;
    else if (period.evidence.includes(day)) state = "met";
    else if (period.state === "unknown" || period.state === "not_scheduled")
      state = period.state;
    else state = day === today ? "open" : "not_met";
    return { day, label, state };
  });
}

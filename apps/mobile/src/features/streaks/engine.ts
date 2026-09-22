import type { VitalSample } from "../../domain/vitals";
import { fluidTotals } from "../hydration/model";
import {
  activeReminderTimes,
  completionAppliesToOccurrence,
  type Reminder,
  type ReminderCompletion,
} from "../reminders/model";
import {
  dayKey,
  dateFromLocalDay,
  monday,
  shiftDay,
} from "../summary/calendar";
import type { Habit } from "../summary/layout";
import {
  validSet,
  type LoggedCardio,
  type LoggedSession,
  type LoggedSet,
} from "../summary/training";
import type { GoalSnapshot, Rule } from "./model";
export type FoodRow = {
  meal_log_id?: string;
  meal_type?: string;
  food_name?: string;
  id: string;
  occurred_at: string;
  calories: number | null;
  protein_grams: number | null;
  entry_method?: string;
  source?: string;
  nutrition_source?: string;
  revision?: number;
};
export type FluidRow = {
  id: string;
  occurred_at: string;
  volume_ml: number;
  counting_policy?: string;
  alcohol_status?: string;
};
export type ScheduleRevision = { effective_day: string; reminders: Reminder[] };
export type Sources = {
  food: FoodRow[];
  fluids: FluidRow[];
  sessions: LoggedSession[];
  sets: LoggedSet[];
  cardio: LoggedCardio[];
  vitals: VitalSample[];
  reminders: ReminderCompletion[];
  schedules: ScheduleRevision[];
  goals: GoalSnapshot[];
  coverage: Partial<
    Record<
      | "food"
      | "fluids"
      | "training"
      | "vitals"
      | "reminders"
      | "goals",
      { from: string; complete: boolean }
    >
  >;
};
export type Period = {
  day: string;
  state:
    "met" | "open" | "not_met" | "unknown" | "not_scheduled";
  count: number;
  target: number;
  explanation: string;
  evidence: string[];
  provisional: boolean;
};
export function pairedReadings(samples: VitalSample[]): VitalSample[] {
  return samples.filter(
    (s) =>
      !s.deletedAt &&
      s.kind === "systolic_bp" &&
      s.value > 0 &&
      samples.some(
        (d) =>
          !d.deletedAt &&
          d.kind === "diastolic_bp" &&
          d.value > 0 &&
          d.source === s.source &&
          (s.correlationId
            ? d.correlationId === s.correlationId
            : !d.correlationId && d.occurredAt === s.occurredAt),
      ),
  );
}
const requirements: Record<Habit, (keyof Sources["coverage"])[]> = {
  daily_logging: ["food", "fluids", "training", "vitals", "reminders"],
  food_logging: ["food"],
  calorie_target: ["food", "goals"],
  protein_target: ["food", "goals"],
  fluid_logging: ["fluids"],
  fluid_target: ["fluids", "goals"],
  training: ["training"],
  weight: ["vitals"],
  bp: ["vitals"],
  reminder: ["reminders"],
};
export function evaluateStreak(
  habit: Habit,
  rules: Rule[],
  data: Sources,
  now: Date,
) {
  const revisions = rules
    .filter((r) => r.habit === habit)
    .sort((a, b) => a.effective_day.localeCompare(b.effective_day));
  const activation = revisions[0]?.activation_day;
  if (!activation)
    return {
      periods: [] as Period[],
      current: 0,
      best: 0,
      unknown: false,
      activation: undefined,
    };
  const weekly = habit === "training",
    today = dayKey(now),
    currentStart = weekly ? monday(today) : today;
  const periods: Period[] = [];
  const usableSets = new Set(
    data.sets.filter(validSet).map((s) => s.session_id),
  );
  const sessions = data.sessions.filter((s) => usableSets.has(s.id));
  const cardio = data.cardio.filter(
    (c) =>
      !c.deleted_at &&
      Number(c.duration_minutes) > 0 &&
      Number.isFinite(Number(c.duration_minutes)),
  );
  const beforeNow = (at: string) =>
    Number.isFinite(Date.parse(at)) && Date.parse(at) <= now.getTime();
  for (
    let key = weekly ? monday(activation) : activation;
    key <= currentStart;
    key = shiftDay(key, weekly ? 7 : 1)
  ) {
    const rule = revisions.filter((r) => r.effective_day <= key).at(-1);
    const period: Period = {
      day: key,
      state: "not_scheduled",
      count: 0,
      target: 1,
      explanation: "before_activation",
      evidence: [],
      provisional: key === currentStart,
    };
    periods.push(period);
    if (!rule || key < activation) continue;
    if (!rule.enabled) {
      period.explanation = "paused";
      continue;
    }
    const weekday = dateFromLocalDay(key).getDay();
    if (habit === "weight" && !rule.config.weekdays.includes(weekday)) {
      period.explanation = "off_day";
      continue;
    }
    const end = shiftDay(key, weekly ? 7 : 1);
    const inPeriod = (at: string) =>
      beforeNow(at) &&
      dayKey(new Date(at)) >= key &&
      dayKey(new Date(at)) < end;
    const foods = data.food.filter((r) => inPeriod(r.occurred_at));
    const fluids = data.fluids.filter(
      (r) => inPeriod(r.occurred_at) && Number(r.volume_ml) > 0,
    );
    const lifts = sessions.filter((s) => inPeriod(s.completed_at)),
      activities = cardio.filter((c) => inPeriod(c.occurred_at));
    const vitals = data.vitals.filter(
      (s) => !s.deletedAt && s.value > 0 && inPeriod(s.occurredAt),
    );
    const readings = vitals.filter(
      (s) =>
        habit === "bp" || rule.config.includeImports || s.source === "manual",
    );
    const reminders = data.reminders.filter(
      (r) => r.localDay === key && beforeNow(r.completedAt),
    );
    const goal = data.goals
      .filter((g) => g.effective_day <= key)
      .sort((a, b) => a.effective_day.localeCompare(b.effective_day))
      .at(-1);
    let available = requirements[habit].every(
      (name) =>
        data.coverage[name]?.complete && data.coverage[name]!.from <= key,
    );
    let met = false;
    if (
      (habit === "calorie_target" ||
        habit === "protein_target" ||
        habit === "fluid_target") &&
      !data.coverage.goals?.complete
    ) {
      period.state = "unknown";
      period.explanation = "incomplete_coverage";
      continue;
    }
    if (habit === "daily_logging") {
      period.evidence = [
        ...foods
          .filter(
            (f) =>
              f.entry_method !== "import" &&
              f.source !== "import" &&
              f.nutrition_source !== "import",
          )
          .map((f) => f.id),
        ...fluids.map((f) => f.id),
        ...lifts.map((s) => s.id),
        ...activities
          .filter((c) => !c.source || c.source === "manual")
          .map((c) => c.id),
        ...vitals
          .filter((s) => s.source === "manual" && s.kind === "weight")
          .map((s) => s.id),
        ...pairedReadings(vitals.filter((s) => s.source === "manual")).map(
          (s) => s.id,
        ),
        ...reminders.map(
          (r) => `${r.reminderId}:${r.scheduledTime ?? "daily"}`,
        ),
      ];
      period.count = new Set(period.evidence).size;
      met = period.count > 0;
      // Positive evidence establishes existential logging even if another source failed.
      if (met) available = true;
    } else if (habit === "food_logging" || habit === "fluid_logging") {
      period.evidence = (habit === "food_logging" ? foods : fluids).map(
        (r) => r.id,
      );
      period.count = period.evidence.length;
      met = period.count > 0;
    } else if (habit === "calorie_target") {
      if (!goal || !(Number(goal.calorie_goal) > 0)) {
        period.state = "unknown";
        period.explanation = "goal_unavailable";
        continue;
      }
      const lower =
        rule.config.calorieMode === "range"
          ? rule.config.lower!
          : Number(goal.calorie_goal) * (1 - rule.config.tolerance);
      const upper =
        rule.config.calorieMode === "range"
          ? rule.config.upper!
          : Number(goal.calorie_goal) * (1 + rule.config.tolerance);
      period.count = foods.reduce((n, f) => n + Number(f.calories ?? 0), 0);
      period.target =
        rule.config.calorieMode === "under" ||
        rule.config.calorieMode === "over"
          ? Number(goal.calorie_goal)
          : upper;
      available &&= foods.every(
        (f) => f.calories !== null && Number.isFinite(Number(f.calories)),
      );
      period.explanation = `inclusive_range:${lower}:${upper}`;
      met =
        foods.length > 0 &&
        (rule.config.calorieMode === "under"
          ? period.count <= period.target
          : rule.config.calorieMode === "over"
            ? period.count >= period.target
            : period.count >= lower && period.count <= upper);
      if (
        rule.config.calorieMode === "under" ||
        rule.config.calorieMode === "over"
      )
        period.explanation = rule.config.calorieMode;
    } else if (habit === "protein_target" || habit === "fluid_target") {
      const target =
        habit === "protein_target" ? goal?.protein_goal : goal?.fluid_goal_ml;
      if (!(Number(target) > 0)) {
        period.state = "unknown";
        period.explanation = "goal_unavailable";
        continue;
      }
      period.target = Number(target);
      period.count =
        habit === "protein_target"
          ? foods.reduce((n, f) => n + Number(f.protein_grams ?? 0), 0)
          : fluidTotals(fluids).countedMl;
      if (habit === "protein_target")
        available &&= foods.every(
          (f) =>
            f.protein_grams !== null &&
            Number.isFinite(Number(f.protein_grams)),
        );
      met = period.count >= period.target;
    } else if (habit === "training") {
      period.evidence = [
        ...new Set([
          ...lifts.map((s) => dayKey(new Date(s.completed_at))),
          ...activities.map((c) => dayKey(new Date(c.occurred_at))),
        ]),
      ];
      period.count = period.evidence.length;
      period.target = rule.config.trainingDays;
      met = period.count >= period.target;
    } else if (habit === "weight" || habit === "bp") {
      period.evidence = (
        habit === "weight"
          ? readings.filter((s) => s.kind === "weight")
          : pairedReadings(readings)
      ).map((s) => s.id);
      period.count = period.evidence.length ? 1 : 0;
      met = period.count > 0;
    } else if (habit === "reminder") {
      const revision = data.schedules
        .filter((s) => s.effective_day <= key)
        .sort((a, b) => a.effective_day.localeCompare(b.effective_day))
        .at(-1);
      const reminder = revision?.reminders.find(
        (r) => r.id === rule.config.reminderId,
      );
      if (!revision) available = false;
      else if (
        !reminder ||
        !reminder.enabled ||
        reminder.repeat === "once" ||
        key < reminder.startDate ||
        ((reminder.repeat === "weekly" || reminder.repeat === "weekdays") &&
          !reminder.weekdays.includes(weekday))
      ) {
        period.explanation = "off_day";
        continue;
      }
      if (reminder) {
        const times = activeReminderTimes(reminder);
        period.target = times.length;
        period.evidence = times.filter((time) =>
          reminders.some((c) =>
            completionAppliesToOccurrence(reminder, c, {
              localDay: key,
              scheduledTime: time,
            }),
          ),
        );
        period.count = period.evidence.length;
        met = period.count === period.target;
      }
    }
    period.state = !available
      ? "unknown"
      : met
        ? "met"
        : period.provisional
          ? "open"
          : "not_met";
    if (period.explanation === "before_activation")
      period.explanation = !available
        ? "incomplete_coverage"
        : met
          ? "qualified"
          : "no_qualifying_log";
  }
  let run = 0,
    best = 0;
  for (const period of periods) {
    if (period.state === "met") {
      run++;
      if (!period.provisional) best = Math.max(best, run);
    } else if (
      period.state !== "not_scheduled" &&
      !(period.provisional && period.state !== "unknown")
    )
      run = 0;
  }
  return {
    periods,
    current: run,
    best,
    unknown: periods.some((p) => p.state === "unknown"),
    activation,
  };
}

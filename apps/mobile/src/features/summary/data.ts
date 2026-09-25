import { supabase } from "../../lib/supabase";
import { type VitalSample } from "../../domain/vitals";
import {
  listReminders,
  listReminderCompletions,
} from "../reminders/repository";
import {
  loadWorkoutDraft,
  workoutDraftHasContent,
} from "../training/workout-draft";
import {
  loadNutritionDraft,
  nutritionDraftHasContent,
} from "../nutrition/draft";
import {
  ensureTracking,
  loadLocalStreaks,
  recordReminderSchedule,
} from "../streaks/repository";
import {
  parseActiveRules,
  type Rule,
  type GoalSnapshot,
} from "../streaks/model";
import { type Sources, type FoodRow, type FluidRow } from "../streaks/engine";
import { dayKey, dayBounds, monday, shiftDay } from "./calendar";
import type { LoggedSession, LoggedSet, LoggedCardio } from "./training";
import type { Widget } from "./layout";
// Stable ID keyset pagination avoids both the 100-session UI cap and PostgREST's
// default row cap. Partial responses are never presented as complete history.
export async function allRows<T>(
  table: string,
  user: string,
  from?: { column: string; at: string },
  matching?: { column: string; ids: string[] },
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (;;) {
    let query = supabase
      .from(table)
      .select("*")
      .eq("user_id", user)
      .order("id")
      .limit(500);
    if (after) query = query.gt("id", after);
    if (from) query = query.gte(from.column, from.at);
    if (matching) query = query.in(matching.column, matching.ids);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data?.length) return rows;
    const next = String(data.at(-1)!.id);
    if (next === after) throw new Error("History pagination did not advance.");
    after = next;
  }
}
async function ownedRows<T>(table: string, user: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", user)
      .order("effective_day")
      .range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data?.length) return rows;
    offset += data.length;
  }
}
export type SummaryData = {
  sources: Sources;
  rules: Rule[];
  errors: string[];
  workoutDraft: boolean;
  mealDraft: boolean;
  reminders: Awaited<ReturnType<typeof listReminders>>;
  loadedAt: string;
  trainingComplete: boolean;
};
export async function loadSummaryData(
  user: string,
  widgets: Widget[],
  now: Date,
  cachedVitals: VitalSample[],
  maintainTracking = false,
): Promise<SummaryData> {
  const errors: string[] = [],
    coverage: Sources["coverage"] = {};
  const streaks = widgets.some((w) => w.type === "streaks");
  const actions = widgets.some((w) => w.type === "actions");
  const meals = widgets.some((w) => w.type === "meals");
  const training = streaks || widgets.some((w) => w.type === "training");
  let rules: Rule[] = [],
    goals: GoalSnapshot[] = [];
  let remindersComplete = true;
  const reminders = await (
    streaks || actions ? listReminders(user, true) : Promise.resolve([])
  ).catch(() => {
    remindersComplete = false;
    errors.push("Reminder schedules unavailable on this device.");
    return [];
  });
  let local: Awaited<ReturnType<typeof loadLocalStreaks>> = {
    rules: [],
    schedules: [],
    reminderCoverage: dayKey(now),
  };
  if (streaks) {
    try {
      if (!remindersComplete) throw new Error("Reminder schedules unavailable");
      if (maintainTracking) await recordReminderSchedule(user, reminders, true);
      local = await loadLocalStreaks(user);
    } catch {
      errors.push("Reminder history is unavailable on this device.");
    }
    if (maintainTracking) {
      try {
        await ensureTracking();
      } catch {
        errors.push("Streak targets could not refresh. Retry when connected.");
      }
    }
    const results = await Promise.allSettled([
      ownedRows<Rule>("streak_rules", user),
      ownedRows<GoalSnapshot>("streak_goal_snapshots", user),
    ]);
    if (results[0].status === "fulfilled")
      rules = parseActiveRules(results[0].value);
    else errors.push("Streak rules unavailable.");
    if (results[1].status === "fulfilled") {
      goals = results[1].value;
      coverage.goals = {
        from: goals.map((g) => g.effective_day).sort()[0] ?? dayKey(now),
        complete: true,
      };
    }
    rules.push(...local.rules);
  }
  if (!streaks && widgets.some((w) => w.type === "training")) {
    try {
      rules = parseActiveRules(await ownedRows<Rule>("streak_rules", user));
    } catch {
      errors.push("Training target is unavailable.");
    }
  }
  const from = [
    monday(dayKey(now)),
    shiftDay(dayKey(now), -6),
    ...rules.map((r) => r.activation_day),
  ].sort()[0];
  const at = dayBounds(from).start.toISOString();
  const read = async <T>(
    table: string,
    name: keyof Sources["coverage"],
    column?: string,
    full = false,
  ): Promise<T[]> => {
    try {
      const rows = await allRows<T>(
        table,
        user,
        !full && column ? { column, at } : undefined,
      );
      coverage[name] = { from: full ? "0000-01-01" : from, complete: true };
      return rows;
    } catch {
      coverage[name] = { from, complete: false };
      errors.push(`${name} history unavailable. Retry to verify results.`);
      return [];
    }
  };
  const sessionsRequest = training
    ? read<LoggedSession>(
        "workout_sessions",
        "training",
        "completed_at",
        streaks,
      )
    : Promise.resolve([]);
  const setsRequest = sessionsRequest
    .then(async (sessions) => {
      if (!training || !sessions.length) return [];

      const result: LoggedSet[] = [];
      for (let i = 0; i < sessions.length; i += 100)
        result.push(
          ...(await allRows<LoggedSet>("workout_sets", user, undefined, {
            column: "session_id",
            ids: sessions.slice(i, i + 100).map((s) => s.id),
          })),
        );
      return result;
    })
    .catch(() => {
      errors.push("Workout sets unavailable.");
      return null;
    });
  const [
    food,
    fluids,
    sessions,
    sets,
    cardio,
    vitalsRaw,
    completions,
    workoutDraft,
    mealDraft,
  ] = await Promise.all([
    streaks || meals
      ? read<FoodRow>("nutrition_entries", "food", "occurred_at", streaks)
      : [],
    streaks
      ? read<FluidRow>("hydration_entries", "fluids", "occurred_at", true)
      : [],
    sessionsRequest,
    // Set creation time changes on edit: fetch by identity, never by that timestamp.
    setsRequest,
    training
      ? allRows<LoggedCardio>(
          "cardio_entries",
          user,
          streaks ? undefined : { column: "occurred_at", at },
        ).catch(() => {
          errors.push("Cardio history unavailable.");
          return null;
        })
      : [],
    streaks
      ? read<Record<string, unknown>>(
          "vital_samples",
          "vitals",
          "occurred_at",
          true,
        )
      : [],
    (streaks ? listReminderCompletions(user, true) : Promise.resolve([])).catch(
      () => {
        remindersComplete = false;
        errors.push("Reminder completions unavailable on this device.");
        return [];
      },
    ),
    actions ? loadWorkoutDraft(user) : undefined,
    actions ? loadNutritionDraft(user) : undefined,
  ]);
  if (sets === null || cardio === null)
    coverage.training = { from, complete: false };
  const vitals = new Map<string, VitalSample>(
    vitalsRaw.map((r) => [
      String(r.id),
      {
        id: String(r.id),
        userId: user,
        kind: r.kind as VitalSample["kind"],
        value: Number(r.value),
        unit: String(r.unit),
        occurredAt: String(r.occurred_at),
        source: r.source as VitalSample["source"],
        createdAt: String(r.created_at),
        correlationId: r.correlation_id ? String(r.correlation_id) : undefined,
        deletedAt: r.deleted_at ? String(r.deleted_at) : undefined,
      },
    ]),
  );
  for (const sample of cachedVitals)
    if (
      sample.userId === user &&
      (!vitals.get(sample.id)?.deletedAt || sample.deletedAt)
    )
      vitals.set(sample.id, sample);
  coverage.reminders = {
    from:
      completions.length >= 800
        ? shiftDay(completions.map((c) => c.localDay).sort()[0], 1)
        : local.reminderCoverage,
    complete: remindersComplete && local.schedules.length > 0,
  };
  return {
    sources: {
      food,
      fluids,
      sessions,
      sets: sets ?? [],
      cardio: cardio ?? [],
      vitals: [...vitals.values()],
      reminders: completions,
      schedules: local.schedules,
      goals,
      coverage,
    },
    rules,
    errors,
    workoutDraft: !!workoutDraft && workoutDraftHasContent(workoutDraft),
    mealDraft: !!mealDraft && nutritionDraftHasContent(mealDraft),
    reminders,
    loadedAt: now.toISOString(),
    trainingComplete: coverage.training?.complete ?? false,
  };
}

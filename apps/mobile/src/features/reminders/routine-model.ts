import { z } from "zod";
import {
  activeReminderTimes,
  dateFromLocalDay,
  formatReminderTime,
  localDay,
  weekdayLabels,
  type Reminder,
} from "./model";

export const routineKinds = [
  "meals",
  "fluids",
  "blood_pressure",
  "weight",
  "workout",
] as const;
export type RoutineKind = (typeof routineKinds)[number];
export const routineLabels: Record<RoutineKind, string> = {
  meals: "Meals",
  fluids: "Fluids",
  blood_pressure: "Blood Pressure",
  weight: "Weight",
  workout: "Workout",
};
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const slot = z.object({
  id: z.string().min(1).max(50),
  label: z.string().min(1).max(40),
  time,
  enabled: z.boolean(),
});
const category = z
  .object({
    enabled: z.boolean(),
    days: z.array(z.number().int().min(0).max(6)).max(7),
    slots: z.array(slot).min(1).max(8),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.days).size !== value.days.length)
      ctx.addIssue({ code: "custom", message: "Weekdays must be unique." });
    if (new Set(value.slots.map((s) => s.id)).size !== value.slots.length)
      ctx.addIssue({
        code: "custom",
        message: "Reminder slots must be unique.",
      });
  });
export const routineSchema = z
  .object({
    version: z.literal(2),
    medicationEnabled: z.boolean().default(true),
    detailedPreviews: z.boolean().default(false),
    userId: z.string().min(1),
    categories: z.object({
      meals: category,
      fluids: category,
      blood_pressure: category,
      weight: category,
      workout: category,
    }),
    restDay: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    replacements: z.array(z.string()).default([]),
    keepBoth: z.array(z.string()).default([]),
  })
  .superRefine((value, ctx) => {
    const expected = {
      meals: ["breakfast", "lunch", "dinner"],
      blood_pressure: ["morning", "evening"],
      weight: ["weight"],
      workout: ["workout"],
    } as const;
    for (const key of [
      "meals",
      "blood_pressure",
      "weight",
      "workout",
    ] as const) {
      const actual = value.categories[key].slots.map((s) => s.id);
      if (
        actual.length !== expected[key].length ||
        expected[key].some((id) => !actual.includes(id))
      )
        ctx.addIssue({
          code: "custom",
          message: `Invalid ${key} reminder slots.`,
        });
    }
  });
export type RoutinePreferences = z.infer<typeof routineSchema>;
export type RoutineCategory = RoutinePreferences["categories"][RoutineKind];
export function defaultRoutines(userId: string): RoutinePreferences {
  const make = (
    items: [string, string, string][],
    days = [0, 1, 2, 3, 4, 5, 6],
  ): RoutineCategory => ({
    enabled: false,
    days,
    slots: items.map(([id, label, time]) => ({
      id,
      label,
      time,
      enabled: true,
    })),
  });
  return {
    version: 2,
    medicationEnabled: true,
    detailedPreviews: false,
    userId,
    replacements: [],
    keepBoth: [],
    categories: {
      meals: make([
        ["breakfast", "Breakfast", "09:00"],
        ["lunch", "Lunch", "13:00"],
        ["dinner", "Dinner", "19:00"],
      ]),
      fluids: make([
        ["fluid-1", "Drink 1", "10:00"],
        ["fluid-2", "Drink 2", "14:00"],
        ["fluid-3", "Drink 3", "17:00"],
        ["fluid-4", "Drink 4", "20:00"],
      ]),
      blood_pressure: make([
        ["morning", "Morning", "08:00"],
        ["evening", "Evening", "20:00"],
      ]),
      weight: make([["weight", "Weight", "08:00"]]),
      workout: make([["workout", "Workout", "17:00"]], []),
    },
  };
}
export function routineIssues(p: RoutinePreferences): string[] {
  const issues: string[] = [];
  for (const kind of routineKinds) {
    const c = p.categories[kind];
    if (!c.enabled) continue;
    if (!c.days.length) issues.push(`Choose days for ${routineLabels[kind]}.`);
    if (!c.slots.some((s) => s.enabled))
      issues.push(`Choose at least one ${routineLabels[kind]} reminder.`);
    const used = new Set<string>();
    for (const s of c.slots.filter((s) => s.enabled)) {
      if (used.has(s.time))
        issues.push(`${routineLabels[kind]} has the same time more than once.`);
      used.add(s.time);
    }
  }
  return issues;
}
export function routineSummary(c: RoutineCategory) {
  const times =
    c.slots
      .filter((s) => s.enabled)
      .map((s) => formatReminderTime(s.time))
      .join(", ") || "No times selected";
  const days =
    c.days.length === 7
      ? "Daily"
      : c.days.length
        ? c.days.map((d) => weekdayLabels[d]).join(", ")
        : "Choose days";
  return `${days} · ${times}`;
}
export function routineOverlaps(p: RoutinePreferences): string[] {
  const notices = new Set<string>();
  for (let i = 0; i < routineKinds.length; i++)
    for (let j = i + 1; j < routineKinds.length; j++) {
      const a = p.categories[routineKinds[i]],
        b = p.categories[routineKinds[j]];
      if (!a.enabled || !b.enabled || !a.days.some((d) => b.days.includes(d)))
        continue;
      for (const s of a.slots.filter((s) => s.enabled))
        if (b.slots.some((t) => t.enabled && s.time === t.time))
          notices.add(
            `${routineLabels[routineKinds[i]]} and ${routineLabels[routineKinds[j]]} share ${formatReminderTime(s.time)}. You can space them out.`,
          );
    }
  return [...notices];
}
export function overlappingCustom(
  p: RoutinePreferences,
  reminders: Reminder[],
) {
  return reminders.filter((r) => {
    if (!r.enabled || (r.kind !== "weight" && r.kind !== "blood_pressure"))
      return false;
    const c = p.categories[r.kind];
    if (!c.enabled) return false;
    const days =
      r.repeat === "daily" || r.repeat === "multiple_daily"
        ? [0, 1, 2, 3, 4, 5, 6]
        : r.repeat === "once"
          ? [dateFromLocalDay(r.startDate).getDay()]
          : r.weekdays;
    if (r.repeat === "once" && r.startDate < localDay()) return false;
    return (
      c.days.some((d) => days.includes(d)) &&
      c.slots.some((s) => s.enabled && activeReminderTimes(r).includes(s.time))
    );
  });
}
export function routineBody(kind: RoutineKind, slotId: string) {
  if (kind === "meals") return `Ready to log ${slotId}?`;
  if (kind === "fluids") return "A little hydration check-in. Log a drink?";
  if (kind === "blood_pressure") return `Time for your ${slotId} BP check-in.`;
  if (kind === "weight") return "Your weight check-in. Ready to log?";
  return "Workout or rest day? Make today work for you.";
}

/** Upgrade legacy master-off settings without unexpectedly enabling notifications. */
export function parseRoutinePreferences(raw: unknown): RoutinePreferences {
  if (raw && typeof raw === "object" && "version" in raw && raw.version === 1) {
    const legacy = z
      .object({
        enabled: z.boolean(),
        categories: z.record(z.string(), category),
      })
      .parse(raw);
    return routineSchema.parse({
      ...raw,
      version: 2,
      categories: Object.fromEntries(
        Object.entries(legacy.categories).map(([key, value]) => [
          key,
          { ...value, enabled: legacy.enabled && value.enabled },
        ]),
      ),
    });
  }
  return routineSchema.parse(raw);
}

/** Pause the medication group without modifying individual choices/history. */
export function effectiveCustomReminders(
  p: RoutinePreferences,
  reminders: Reminder[],
): Reminder[] {
  return reminders.map((r) =>
    !p.medicationEnabled && (r.kind === "medication" || r.kind === "supplement")
      ? { ...r, enabled: false }
      : r,
  );
}

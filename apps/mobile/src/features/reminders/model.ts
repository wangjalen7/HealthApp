import { z } from "zod";

import { createUuid } from "../../lib/id";

export const reminderKinds = [
  "medication",
  "supplement",
  "blood_pressure",
  "weight",
  "custom",
] as const;
export type ReminderKind = (typeof reminderKinds)[number];

export const reminderRepeats = [
  "once",
  "daily",
  "multiple_daily",
  "weekdays",
  "weekly",
] as const;
export type ReminderRepeat = (typeof reminderRepeats)[number];

export const weekdayLabels = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export const reminderSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  kind: z.enum(reminderKinds),
  name: z.string().trim().max(80).optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  additionalTimes: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
    .max(5)
    .default([]),
  repeat: z.enum(reminderRepeats),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  enabled: z.boolean(),
  notificationIds: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const reminderCompletionSchema = z.object({
  reminderId: z.string().min(1),
  localDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completedAt: z.string().datetime(),
});
export type ReminderCompletion = z.infer<typeof reminderCompletionSchema>;

export function localDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function timeParts(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(":").map(Number);
  return { hour, minute };
}

export function timeFromDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export function dateFromLocalDay(value: string, time = "09:00"): Date {
  const [year, month, day] = value.split("-").map(Number);
  const { hour, minute } = timeParts(time);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function formatReminderTime(time: string): string {
  const { hour, minute } = timeParts(time);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hour, minute));
}

export function reminderKindLabel(kind: ReminderKind): string {
  return {
    medication: "Medication",
    supplement: "Supplement",
    blood_pressure: "Blood pressure",
    weight: "Weight",
    custom: "Custom",
  }[kind];
}

export function reminderTitle(
  reminder: Pick<Reminder, "kind" | "name">,
): string {
  const name = reminder.name?.trim();
  return name || reminderKindLabel(reminder.kind);
}

export function reminderTimes(
  reminder: Pick<Reminder, "time" | "additionalTimes">,
): string[] {
  return [...new Set([reminder.time, ...reminder.additionalTimes])].sort();
}

export function repeatSummary(
  reminder: Pick<
    Reminder,
    "repeat" | "weekdays" | "startDate" | "time" | "additionalTimes"
  >,
): string {
  const times = reminderTimes(reminder).map(formatReminderTime).join(", ");
  if (reminder.repeat === "once") {
    return `${new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(dateFromLocalDay(reminder.startDate))} at ${times}`;
  }
  if (reminder.repeat === "daily") return `Every day at ${times}`;
  if (reminder.repeat === "multiple_daily") return `Every day at ${times}`;
  const days = reminder.weekdays.map((day) => weekdayLabels[day]).join(", ");
  return `${days || "Choose a day"} at ${times}`;
}

export function createReminder(
  input: Pick<
    Reminder,
    | "userId"
    | "kind"
    | "name"
    | "time"
    | "additionalTimes"
    | "repeat"
    | "startDate"
    | "weekdays"
  >,
): Reminder {
  const now = new Date().toISOString();
  return reminderSchema.parse({
    ...input,
    id: createUuid(),
    name: input.name?.trim() || undefined,
    enabled: true,
    notificationIds: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function reminderIsComplete(
  reminderId: string,
  completions: ReminderCompletion[],
  day = localDay(),
): boolean {
  return completions.some(
    (completion) =>
      completion.reminderId === reminderId && completion.localDay === day,
  );
}

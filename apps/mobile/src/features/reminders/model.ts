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
  "interval",
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
  intervalDays: z.number().int().min(2).max(365).default(2),
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
  scheduledTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  completedAt: z.string().datetime(),
});
export type ReminderCompletion = z.infer<typeof reminderCompletionSchema>;

export type ReminderOccurrence = {
  reminderId: string;
  localDay: string;
  scheduledTime: string;
  date: Date;
};

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
    custom: "Other",
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

export function activeReminderTimes(
  reminder: Pick<Reminder, "repeat" | "time" | "additionalTimes">,
): string[] {
  return reminder.repeat === "once" ? [reminder.time] : reminderTimes(reminder);
}

export function repeatSummary(
  reminder: Pick<
    Reminder,
    | "repeat"
    | "weekdays"
    | "startDate"
    | "time"
    | "additionalTimes"
    | "intervalDays"
  >,
): string {
  const times = activeReminderTimes(reminder)
    .map(formatReminderTime)
    .join(", ");
  if (reminder.repeat === "once") {
    return `${new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(dateFromLocalDay(reminder.startDate))} at ${times}`;
  }
  if (reminder.repeat === "daily") return `Every day at ${times}`;
  if (reminder.repeat === "multiple_daily") return `Every day at ${times}`;
  if (reminder.repeat === "interval")
    return `Every ${reminder.intervalDays} days at ${times}, starting ${reminder.startDate}`;
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
  > & { intervalDays?: number },
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

export function reminderCompletionTargetTime(
  reminder: Pick<Reminder, "repeat" | "time" | "additionalTimes">,
  at = new Date(),
): string | undefined {
  if (activeReminderTimes(reminder).length < 2) return undefined;
  const times = activeReminderTimes(reminder);
  const currentTime = timeFromDate(at);
  return times.filter((time) => time <= currentTime).at(-1) ?? times[0];
}

function completionScheduledTime(
  reminder: Pick<Reminder, "repeat" | "time" | "additionalTimes">,
  completion: ReminderCompletion,
): string | undefined {
  if (activeReminderTimes(reminder).length < 2) return undefined;
  return (
    completion.scheduledTime ??
    reminderCompletionTargetTime(reminder, new Date(completion.completedAt))
  );
}

export function currentReminderCompletion(
  reminder: Pick<Reminder, "id" | "repeat" | "time" | "additionalTimes">,
  completions: ReminderCompletion[],
  at = new Date(),
): ReminderCompletion | undefined {
  const day = localDay(at);
  const targetTime = reminderCompletionTargetTime(reminder, at);
  return completions.find(
    (completion) =>
      completion.reminderId === reminder.id &&
      completion.localDay === day &&
      (activeReminderTimes(reminder).length < 2 ||
        completionScheduledTime(reminder, completion) === targetTime),
  );
}

export function createReminderCompletion(
  reminder: Pick<Reminder, "id" | "repeat" | "time" | "additionalTimes">,
  at = new Date(),
): ReminderCompletion {
  return reminderCompletionSchema.parse({
    reminderId: reminder.id,
    localDay: localDay(at),
    scheduledTime: reminderCompletionTargetTime(reminder, at),
    completedAt: at.toISOString(),
  });
}

export function completionAppliesToOccurrence(
  reminder: Pick<Reminder, "id" | "repeat" | "time" | "additionalTimes">,
  completion: ReminderCompletion,
  occurrence: Pick<ReminderOccurrence, "localDay" | "scheduledTime">,
): boolean {
  return (
    completion.reminderId === reminder.id &&
    completion.localDay === occurrence.localDay &&
    (activeReminderTimes(reminder).length < 2 ||
      completionScheduledTime(reminder, completion) ===
        occurrence.scheduledTime)
  );
}

export function reminderOccursOnDay(reminder: Reminder, day: Date): boolean {
  if (localDay(day) < reminder.startDate) return false;
  if (reminder.repeat === "interval") {
    const [year, month, date] = reminder.startDate.split("-").map(Number);
    const elapsed =
      (Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) -
        Date.UTC(year, month - 1, date)) /
      86_400_000;
    return elapsed >= 0 && elapsed % reminder.intervalDays === 0;
  }
  if (reminder.repeat === "daily" || reminder.repeat === "multiple_daily") {
    return true;
  }
  if (reminder.repeat === "weekdays" || reminder.repeat === "weekly") {
    return reminder.weekdays.includes(day.getDay());
  }
  return false;
}

export function upcomingReminderOccurrences(
  reminders: Reminder[],
  completions: ReminderCompletion[],
  now = new Date(),
  limit = 60,
): ReminderOccurrence[] {
  const occurrences: ReminderOccurrence[] = [];

  for (const reminder of reminders) {
    if (!reminder.enabled) continue;
    if (reminder.repeat === "once") {
      const date = dateFromLocalDay(reminder.startDate, reminder.time);
      const occurrence = {
        reminderId: reminder.id,
        localDay: reminder.startDate,
        scheduledTime: reminder.time,
        date,
      };
      if (
        date > now &&
        !completions.some((completion) =>
          completionAppliesToOccurrence(reminder, completion, occurrence),
        )
      ) {
        occurrences.push(occurrence);
      }
      continue;
    }

    const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const configuredStart = dateFromLocalDay(reminder.startDate, "00:00");
    if (configuredStart > firstDay) firstDay.setTime(configuredStart.getTime());
    const horizon = new Date(firstDay);
    horizon.setDate(
      horizon.getDate() +
        Math.max(
          400,
          reminder.repeat === "interval"
            ? reminder.intervalDays * (Math.max(0, limit) + 1)
            : 0,
        ),
    );
    let found = 0;
    for (
      const day = new Date(firstDay);
      day <= horizon && found < limit;
      day.setDate(day.getDate() + 1)
    ) {
      if (!reminderOccursOnDay(reminder, day)) continue;
      const dayKey = localDay(day);
      for (const scheduledTime of activeReminderTimes(reminder)) {
        const date = dateFromLocalDay(dayKey, scheduledTime);
        const occurrence = {
          reminderId: reminder.id,
          localDay: dayKey,
          scheduledTime,
          date,
        };
        if (
          date > now &&
          !completions.some((completion) =>
            completionAppliesToOccurrence(reminder, completion, occurrence),
          )
        ) {
          occurrences.push(occurrence);
          found++;
        }
      }
    }
  }

  return occurrences
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .slice(0, Math.max(0, limit));
}

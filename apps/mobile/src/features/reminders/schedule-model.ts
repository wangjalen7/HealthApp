import {
  activeReminderTimes,
  completionAppliesToOccurrence,
  dateFromLocalDay,
  localDay,
  reminderTitle,
  timeFromDate,
  timeParts,
  upcomingReminderOccurrences,
  type Reminder,
  type ReminderCompletion,
} from "./model";
import {
  routineBody,
  routineKinds,
  type RoutinePreferences,
} from "./routine-model";

export type ScheduleRequest = {
  id: string;
  owner: string;
  source: "custom" | "routine";
  group: string;
  title: string;
  body: string;
  data: Record<string, string | number>;
  trigger:
    | { kind: "calendar"; hour: number; minute: number; weekday?: number }
    | { kind: "date"; at: number };
  fingerprint: string;
};
export const requestPrefix = (user: string) => `healthapp.notify.v2:${user}:`;
export const WORKOUT_HORIZON_DAYS = 28;
function request(
  user: string,
  source: ScheduleRequest["source"],
  group: string,
  key: string,
  body: string,
  title: string,
  trigger: ScheduleRequest["trigger"],
  data: Record<string, string | number>,
): ScheduleRequest {
  const id = `${requestPrefix(user)}${source}:${group}:${key}`;
  const content = {
    owner: user,
    source,
    group,
    title,
    body,
    trigger,
    data: { v: 2, userId: user, source, ...data },
  };
  return { id, ...content, fingerprint: JSON.stringify(content) };
}
export function customPlan(
  reminders: Reminder[],
  completions: ReminderCompletion[],
  now = new Date(),
): ScheduleRequest[] {
  const out: ScheduleRequest[] = [];
  for (const r of reminders) {
    if (!r.enabled) continue;
    const title = reminderTitle(r),
      body = ["blood_pressure", "weight"].includes(r.kind)
        ? `Time to track ${title.toLowerCase()}.`
        : `Time for ${title}.`;
    const futureStart = r.startDate > localDay(now);
    const earlyComplete = activeReminderTimes(r).some(
      (t) =>
        dateFromLocalDay(localDay(now), t) > now &&
        completions.some((c) =>
          completionAppliesToOccurrence(r, c, {
            localDay: localDay(now),
            scheduledTime: t,
          }),
        ),
    );
    if (
      r.repeat === "once" ||
      r.repeat === "interval" ||
      futureStart ||
      earlyComplete
    ) {
      // Preserve custom start-date and early-completion behavior with dated requests.
      // This exceptional rolling window is replenished on foreground, as before.
      for (const o of upcomingReminderOccurrences(
        [r],
        completions,
        now,
        r.repeat === "once" ? 1 : 14,
      ))
        out.push(
          request(
            r.userId,
            "custom",
            r.id,
            `${o.localDay}:${o.scheduledTime}`,
            body,
            title,
            { kind: "date", at: o.date.getTime() },
            {
              reminderId: r.id,
              occurrenceDay: o.localDay,
              occurrenceTime: o.scheduledTime,
            },
          ),
        );
    } else {
      const days =
        r.repeat === "daily" || r.repeat === "multiple_daily"
          ? [undefined]
          : [...new Set(r.weekdays)].sort();
      activeReminderTimes(r).forEach((time, index) => {
        for (const day of days) {
          const { hour, minute } = timeParts(time);
          out.push(
            request(
              r.userId,
              "custom",
              r.id,
              `${index}:${day ?? "daily"}`,
              body,
              title,
              {
                kind: "calendar",
                hour,
                minute,
                ...(day === undefined ? {} : { weekday: day + 1 }),
              },
              { reminderId: r.id, occurrenceTime: time },
            ),
          );
        }
      });
    }
  }
  return out;
}
export function routinePlan(
  p: RoutinePreferences,
  now = new Date(),
): ScheduleRequest[] {
  const out: ScheduleRequest[] = [];
  for (const kind of routineKinds) {
    const c = p.categories[kind];
    if (!c.enabled) continue;
    for (const s of c.slots) {
      if (!s.enabled) continue;
      const data = { category: kind, slot: s.id };
      if (kind === "workout") {
        // Dated workout prompts permit Rest Today without muting future weekdays.
        for (let offset = 0; offset < WORKOUT_HORIZON_DAYS; offset++) {
          const day = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate() + offset,
            ),
            key = localDay(day),
            date = dateFromLocalDay(key, s.time);
          if (
            !c.days.includes(day.getDay()) ||
            key === p.restDay ||
            timeFromDate(date) !== s.time ||
            date <= now
          )
            continue;
          out.push(
            request(
              p.userId,
              "routine",
              kind,
              `${s.id}:${key}`,
              routineBody(kind, s.id),
              "HealthApp",
              { kind: "date", at: date.getTime() },
              { ...data, occurrenceDay: key },
            ),
          );
        }
      } else {
        const days =
          c.days.length === 7 ? [undefined] : [...new Set(c.days)].sort();
        for (const day of days) {
          const { hour, minute } = timeParts(s.time);
          out.push(
            request(
              p.userId,
              "routine",
              kind,
              `${s.id}:${day ?? "daily"}`,
              routineBody(kind, s.id),
              "HealthApp",
              {
                kind: "calendar",
                hour,
                minute,
                ...(day === undefined ? {} : { weekday: day + 1 }),
              },
              data,
            ),
          );
        }
      }
    }
  }
  return out;
}
export type PendingRequest = {
  id: string;
  fingerprint?: string;
  data?: Record<string, unknown>;
};
export type ScheduleAdapter = {
  list(): Promise<PendingRequest[]>;
  put(request: ScheduleRequest): Promise<void>;
  remove(id: string): Promise<void>;
};
/** Add/replace first, verify with the OS, then remove obsolete owned requests.
 * Failure leaves existing requests intact and successful replacements retryable. */
export async function reconcileSchedule(
  adapter: ScheduleAdapter,
  user: string,
  desired: ScheduleRequest[],
  legacyIds: string[] = [],
  limit = 60,
) {
  const pending = await adapter.list(),
    legacy = new Set(legacyIds),
    prefix = requestPrefix(user);
  const own = pending.filter(
    (p) => p.id.startsWith(prefix) || legacy.has(p.id),
  );
  const other = pending.filter((p) => !own.includes(p));
  const desiredIds = new Set(desired.map((r) => r.id));
  if (desiredIds.size !== desired.length)
    throw Error("Duplicate reminder schedule. Review the selected times.");
  if (other.length + desired.length > limit)
    throw Error(
      "Notification capacity reached. Existing reminders are preserved. Reduce routine times or selected days, then retry.",
    );
  // Migrate custom groups first. Verified repeats release their old dated slots
  // before adding routines, so a legacy 60-request window can safely shrink.
  const groupOf = (p: PendingRequest) =>
    p.data?.source === "routine"
      ? `routine:${String(p.data.category)}`
      : typeof p.data?.reminderId === "string"
        ? `custom:${p.data.reminderId}`
        : undefined;
  const groups = [
    ...new Set(desired.map((r) => `${r.source}:${r.group}`)),
  ].sort((a, b) => a.localeCompare(b));
  const removed = new Set<string>();
  for (const group of groups) {
    const members = desired.filter((r) => `${r.source}:${r.group}` === group);
    const current = await adapter.list();
    const existing = new Map(current.map((p) => [p.id, p]));
    const additions = members.filter((r) => !existing.has(r.id));
    if (current.length + additions.length > limit + 4)
      throw Error(
        "Not enough room to safely replace this schedule. Disable an unneeded reminder first, then retry.",
      );
    for (const r of members)
      if (existing.get(r.id)?.fingerprint !== r.fingerprint)
        await adapter.put(r);
    const verified = await adapter.list();
    if (
      members.some(
        (r) =>
          !verified.some(
            (p) => p.id === r.id && p.fingerprint === r.fingerprint,
          ),
      )
    )
      throw Error(
        "Some notifications could not be confirmed. Your settings are saved; retry scheduling.",
      );
    for (const old of own)
      if (groupOf(old) === group && !desiredIds.has(old.id)) {
        await adapter.remove(old.id);
        removed.add(old.id);
      }
  }
  for (const old of own)
    if (!desiredIds.has(old.id) && !removed.has(old.id))
      await adapter.remove(old.id);
  const final = await adapter.list();
  if (
    final.some(
      (p) =>
        (p.id.startsWith(prefix) || legacy.has(p.id)) && !desiredIds.has(p.id),
    )
  )
    throw Error(
      "An old reminder could not be removed. Save the reminder again to retry.",
    );
  return desired.map((r) => r.id);
}
export function serializeSchedules() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(work: () => Promise<T>): Promise<T> {
    const next = tail.catch(() => undefined).then(work);
    tail = next;
    return next;
  };
}

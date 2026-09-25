import { observeReminderSignOut } from "./lifecycle";
import { privateNotificationPreviews } from "./preview-privacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { assertAccount } from "../../lib/mutations";
import {
  notificationAdapter,
  notificationPermission,
  clearStartupResponse,
  presentedNotifications,
  dismissNotification,
  type PermissionState,
} from "./device";
import {
  customPlan,
  routinePlan,
  reconcileSchedule,
  requestPrefix,
  serializeSchedules,
} from "./schedule-model";
import { loadRoutines, storeRoutines } from "./routine-storage";
import {
  effectiveCustomReminders,
  routineSchema,
  type RoutinePreferences,
} from "./routine-model";
import {
  listReminders,
  listReminderCompletions,
  saveReminders,
  saveReminderCompletions,
} from "./repository";
import {
  completionAppliesToOccurrence,
  localDay,
  timeFromDate,
  type Reminder,
  type ReminderCompletion,
} from "./model";
import { discardIntent } from "./intent-storage";
export { notificationPermission, deviceNotificationsAvailable } from "./device";
export type ScheduleStatus = {
  permission: PermissionState;
  count: number;
  routineCount?: number;
  error?: string;
  workoutThrough?: string;
};
const statusKey = (user: string) => `healthapp:notification-status:v2:${user}`;
const activeKey = "healthapp:routine-active-account";
const run = serializeSchedules();
const listeners = new Set<() => void>();
export const observeScheduleChanges = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
function notify() {
  for (const l of listeners) l();
}
export async function loadScheduleStatus(
  user: string,
): Promise<ScheduleStatus> {
  const raw = await AsyncStorage.getItem(statusKey(user));
  return raw
    ? JSON.parse(raw)
    : { permission: await notificationPermission(), count: 0 };
}
async function status(user: string, value: ScheduleStatus) {
  await AsyncStorage.setItem(statusKey(user), JSON.stringify(value));
  notify();
  return value;
}

async function reconcile(
  user: string,
  requestPermission = false,
): Promise<ScheduleStatus> {
  const [custom, completions, prefs] = await Promise.all([
    listReminders(user, true),
    listReminderCompletions(user, true),
    loadRoutines(user),
  ]);
  const permission = await notificationPermission(requestPermission);
  const active = await AsyncStorage.getItem(activeKey);
  const routines = active === user ? routinePlan(prefs) : [];
  const effectiveCustom = effectiveCustomReminders(prefs, custom);
  const desired = privateNotificationPreviews([...customPlan(effectiveCustom, completions), ...routines], prefs.detailedPreviews);
  const oldIds = [
    ...custom.flatMap((r) => r.notificationIds),
    ...(JSON.parse(
      (await AsyncStorage.getItem(
        `healthapp:notification-legacy:v2:${user}`,
      )) ?? "[]",
    ) as string[]),
  ];
  try {
    // Explicit off/delete choices must take effect even if an unrelated rebuild
    // later exceeds capacity. Enabled schedules still use verified replacement.
    const enabledCustom = new Set(
      effectiveCustom.filter((r) => r.enabled).map((r) => r.id),
    );
    const retainedLegacy = new Set(
      effectiveCustom
        .filter((r) => r.enabled)
        .flatMap((r) => r.notificationIds),
    );
    for (const n of await notificationAdapter.list()) {
      const owned = n.id.startsWith(requestPrefix(user));
      const category = n.data?.category;
      const disabledRoutine =
        owned &&
        n.data?.source === "routine" &&
        (active !== user ||
          (typeof category === "string" &&
            category in prefs.categories &&
            !prefs.categories[category as keyof typeof prefs.categories]
              .enabled));
      const disabledCustom =
        owned &&
        n.data?.source === "custom" &&
        !enabledCustom.has(String(n.data.reminderId));
      if (
        disabledRoutine ||
        disabledCustom ||
        (oldIds.includes(n.id) && !retainedLegacy.has(n.id))
      )
        await notificationAdapter.remove(n.id);
    }
    if (permission !== "allowed") {
      // Disabling/deleting remains effective even after permission is revoked.
      const customIds = new Set(
        effectiveCustom.filter((r) => r.enabled).map((r) => r.id),
      );
      const routineIds = new Set(routines.map((r) => r.id));
      const retainedLegacy = new Set(
        effectiveCustom
          .filter((r) => r.enabled)
          .flatMap((r) => r.notificationIds),
      );
      for (const p of await notificationAdapter.list())
        if (
          (oldIds.includes(p.id) && !retainedLegacy.has(p.id)) ||
          (p.id.startsWith(requestPrefix(user)) &&
            ((p.data?.source === "routine" && !routineIds.has(p.id)) ||
              (p.data?.source === "custom" &&
                !customIds.has(String(p.data.reminderId)))))
        )
          await notificationAdapter.remove(p.id);
      return status(user, { permission, count: 0 });
    }
    await reconcileSchedule(notificationAdapter, user, desired, oldIds);
    // Replacement never disables a custom reminder before the routine exists.
    const replace = new Set(
      prefs.replacements.filter((id) => {
        const r = custom.find((r) => r.id === id);
        return r && routines.some((s) => s.group === r.kind);
      }),
    );
    const next = custom.map((r) => ({
      ...r,
      enabled: replace.has(r.id) ? false : r.enabled,
      notificationIds: desired
        .filter(
          (n) =>
            n.source === "custom" && n.group === r.id && !replace.has(r.id),
        )
        .map((n) => n.id),
    }));
    if (replace.size) {
      await saveReminders(user, next);
      await storeRoutines({
        ...prefs,
        replacements: prefs.replacements.filter((id) => !replace.has(id)),
      });
      await reconcileSchedule(
        notificationAdapter,
        user,
        privateNotificationPreviews([
          ...customPlan(effectiveCustomReminders(prefs, next), completions),
          ...routines,
        ], prefs.detailedPreviews),
        oldIds,
      );
    } else if (JSON.stringify(next) !== JSON.stringify(custom)) {
      // Identifiers are only a legacy mirror. The OS is authoritative; definition writes
      // and streak snapshots are unnecessary during ordinary foreground reconciliation.
      await storeCustomNotificationIds(user, next);
    }
    const dates = routines.flatMap((r) =>
      r.trigger.kind === "date" ? [r.trigger.at] : [],
    );
    return status(user, {
      permission,
      routineCount: routines.length,
      count: (await notificationAdapter.list()).filter((r) =>
        r.id.startsWith(requestPrefix(user)),
      ).length,
      ...(dates.length
        ? { workoutThrough: localDay(new Date(Math.max(...dates))) }
        : {}),
    });
  } catch (e) {
    await status(user, {
      permission,
      count: 0,
      error:
        e instanceof Error
          ? e.message
          : "Could not update notifications. Save the reminder again to retry.",
    });
    throw e;
  }
}
// Kept separately from user settings; old deletion/export callers can still read the mirror.
async function storeCustomNotificationIds(user: string, reminders: Reminder[]) {
  await AsyncStorage.setItem(
    `healthapp:notification-ids:v2:${user}`,
    JSON.stringify(
      Object.fromEntries(reminders.map((r) => [r.id, r.notificationIds])),
    ),
  );
}
export function refreshReminderSchedules(user: string) {
  return run(async () => {
    await assertAccount(user);
    return reconcile(user);
  });
}
export function activateReminderAccount(user: string) {
  return run(async () => {
    await assertAccount(user);
    for (const p of await notificationAdapter.list())
      if (p.data?.source === "routine" && p.data.userId !== user)
        await notificationAdapter.remove(p.id);
    await AsyncStorage.setItem(activeKey, user);
    return reconcile(user);
  });
}
export function saveRoutinePreferences(
  p: RoutinePreferences,
  requestPermission = false,
) {
  return run(async () => {
    await assertAccount(p.userId);
    await storeRoutines(routineSchema.parse(p));
    await AsyncStorage.setItem(activeKey, p.userId);
    notify();
    return reconcile(p.userId, requestPermission);
  });
}
export function saveCustomConfiguration(
  user: string,
  reminders: Reminder[],
  completions: ReminderCompletion[],
  requestPermission = false,
) {
  return run(async () => {
    await assertAccount(user);
    if (reminders.some((r) => r.userId !== user))
      throw Error("Reminder account changed. Reopen this screen.");
    const previous = await listReminders(user, true);
    const key = `healthapp:notification-legacy:v2:${user}`;
    await AsyncStorage.setItem(
      key,
      JSON.stringify([
        ...new Set([
          ...(JSON.parse(
            (await AsyncStorage.getItem(key)) ?? "[]",
          ) as string[]),
          ...previous.flatMap((r) => r.notificationIds),
        ]),
      ]),
    );
    await saveReminders(user, reminders);
    await saveReminderCompletions(user, completions);
    notify();
    return reconcile(user, requestPermission);
  });
}
export function restToday(user: string) {
  return run(async () => {
    await assertAccount(user);
    const day = localDay(),
      p = await loadRoutines(user);
    await storeRoutines({ ...p, restDay: day });
    for (const n of await notificationAdapter.list())
      if (
        n.data?.userId === user &&
        n.data.source === "routine" &&
        n.data.category === "workout" &&
        n.data.occurrenceDay === day
      )
        await notificationAdapter.remove(n.id);
    notify();
    return reconcile(user);
  });
}
export function cancelOutgoingRoutines(user: string) {
  return run(async () => {
    for (const p of await notificationAdapter.list())
      if (p.id.startsWith(`${requestPrefix(user)}routine:`))
        await notificationAdapter.remove(p.id);
    if ((await AsyncStorage.getItem(activeKey)) === user)
      await AsyncStorage.removeItem(activeKey);
    await discardIntent();
    clearStartupResponse();
  });
}
export function deleteAccountNotifications(user: string) {
  return run(async () => {
    const custom = await listReminders(user, true);
    const legacy = new Set([
      ...custom.flatMap((r) => r.notificationIds),
      ...(JSON.parse(
        (await AsyncStorage.getItem(
          `healthapp:notification-legacy:v2:${user}`,
        )) ?? "[]",
      ) as string[]),
    ]);
    for (const p of await notificationAdapter.list())
      if (p.id.startsWith(requestPrefix(user)) || legacy.has(p.id))
        await notificationAdapter.remove(p.id);
    for (const p of await presentedNotifications())
      if (
        p.request.content.data?.userId === user ||
        legacy.has(p.request.identifier)
      )
        await dismissNotification(p.request.identifier);
    await discardIntent(user);
    clearStartupResponse();
    if ((await AsyncStorage.getItem(activeKey)) === user)
      await AsyncStorage.removeItem(activeKey);
  });
}
export function cancelReminderNotifications(ids: string[] = []) {
  return run(async () => {
    for (const id of ids) await notificationAdapter.remove(id);
  });
}
// Compatibility with existing custom reminder callers; all work shares one queue.
export async function synchronizeReminderNotifications(
  reminders: Reminder[],
  completions: ReminderCompletion[],
  options: { now?: Date; requestPermission?: boolean } = {},
) {
  if (!reminders.length) return reminders;
  await saveCustomConfiguration(
    reminders[0].userId,
    reminders,
    completions,
    options.requestPermission,
  );
  const pending = await notificationAdapter.list();
  return reminders.map((r) => ({
    ...r,
    notificationIds: pending
      .filter((p) => p.data?.userId === r.userId && p.data?.reminderId === r.id)
      .map((p) => p.id),
  }));
}
export async function dismissCompletedReminderNotification(
  reminder: Reminder,
  completion: ReminderCompletion,
) {
  for (const n of await presentedNotifications()) {
    const data = n.request.content.data;
    if (data?.reminderId !== reminder.id) continue;
    const at = new Date(n.date),
      occurrence = {
        localDay:
          typeof data.occurrenceDay === "string"
            ? data.occurrenceDay
            : localDay(at),
        scheduledTime:
          typeof data.occurrenceTime === "string"
            ? data.occurrenceTime
            : timeFromDate(at),
      };
    if (completionAppliesToOccurrence(reminder, completion, occurrence))
      await dismissNotification(n.request.identifier);
  }
}

// Also covers sign-out from the deletion-recovery gate, where navigation is unmounted.
observeReminderSignOut(cancelOutgoingRoutines);

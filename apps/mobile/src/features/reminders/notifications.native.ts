import * as Notifications from "expo-notifications";

import {
  type Reminder,
  type ReminderCompletion,
  completionAppliesToOccurrence,
  localDay,
  reminderTitle,
  timeFromDate,
  upcomingReminderOccurrences,
} from "./model";

// Leave a small buffer below iOS's pending-local-notification ceiling.
const maximumPendingReminderNotifications = 60;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function notificationContent(
  reminder: Reminder,
  occurrence: {
    localDay: string;
    scheduledTime: string;
  },
): Notifications.NotificationContentInput {
  const isTracking = ["blood_pressure", "weight"].includes(reminder.kind);
  return {
    title: reminderTitle(reminder),
    body: isTracking
      ? `Time to track ${reminderTitle(reminder).toLowerCase()}.`
      : `Time for ${reminderTitle(reminder)}.`,
    sound: "default",
    data: {
      url: "/(app)/reminders",
      reminderId: reminder.id,
      occurrenceDay: occurrence.localDay,
      occurrenceTime: occurrence.scheduledTime,
    },
  };
}

function notificationsAllowed(
  settings: Notifications.NotificationPermissionsStatus,
): boolean {
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function notificationPermission(
  shouldRequest: boolean,
): Promise<boolean> {
  let settings = await Notifications.getPermissionsAsync();
  if (!notificationsAllowed(settings) && shouldRequest) {
    settings = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
  }
  if (!notificationsAllowed(settings) && shouldRequest) {
    throw new Error(
      "Allow notifications in iPhone Settings to activate reminders.",
    );
  }
  return notificationsAllowed(settings);
}

export async function synchronizeReminderNotifications(
  reminders: Reminder[],
  completions: ReminderCompletion[],
  options: { now?: Date; requestPermission?: boolean } = {},
): Promise<Reminder[]> {
  if (!reminders.length) return [];
  const allowed = await notificationPermission(
    options.requestPermission ?? false,
  );
  if (!allowed) return reminders;

  await cancelReminderNotifications(
    reminders.flatMap((reminder) => reminder.notificationIds),
  );
  const occurrences = upcomingReminderOccurrences(
    reminders,
    completions,
    options.now,
    maximumPendingReminderNotifications,
  );
  const remindersById = new Map(
    reminders.map((reminder) => [reminder.id, reminder]),
  );
  const idsByReminder = new Map<string, string[]>();
  const scheduledIds: string[] = [];
  try {
    for (const occurrence of occurrences) {
      const reminder = remindersById.get(occurrence.reminderId);
      if (!reminder) continue;
      const id = await Notifications.scheduleNotificationAsync({
        content: notificationContent(reminder, occurrence),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: occurrence.date,
        },
      });
      scheduledIds.push(id);
      idsByReminder.set(reminder.id, [
        ...(idsByReminder.get(reminder.id) ?? []),
        id,
      ]);
    }
  } catch (error) {
    await cancelReminderNotifications(scheduledIds);
    throw error;
  }
  return reminders.map((reminder) => ({
    ...reminder,
    notificationIds: idsByReminder.get(reminder.id) ?? [],
  }));
}

export async function cancelReminderNotifications(ids: string[]) {
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
  );
}

export async function dismissCompletedReminderNotification(
  reminder: Reminder,
  completion: ReminderCompletion,
): Promise<void> {
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    presented.flatMap((notification) => {
      const data = notification.request.content.data;
      if (data?.reminderId !== reminder.id) return [];
      const deliveredAt = new Date(notification.date);
      const occurrence = {
        localDay:
          typeof data.occurrenceDay === "string"
            ? data.occurrenceDay
            : localDay(deliveredAt),
        scheduledTime:
          typeof data.occurrenceTime === "string"
            ? data.occurrenceTime
            : timeFromDate(deliveredAt),
      };
      return completionAppliesToOccurrence(reminder, completion, occurrence)
        ? [
            Notifications.dismissNotificationAsync(
              notification.request.identifier,
            ),
          ]
        : [];
    }),
  );
}

export function observeReminderNotificationResponses(
  onReminderPress: () => void,
) {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      if (data?.url === "/(app)/reminders") onReminderPress();
    },
  );
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    const data = response?.notification.request.content.data;
    if (data?.url === "/(app)/reminders") onReminderPress();
  });
  return () => subscription.remove();
}

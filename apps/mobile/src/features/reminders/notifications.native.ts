import * as Notifications from "expo-notifications";

import {
  type Reminder,
  reminderTimes,
  reminderTitle,
  timeParts,
} from "./model";

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
): Notifications.NotificationContentInput {
  const isTracking = ["blood_pressure", "weight"].includes(reminder.kind);
  return {
    title: reminderTitle(reminder),
    body: isTracking
      ? `Time to track ${reminderTitle(reminder).toLowerCase()}.`
      : `Time for ${reminderTitle(reminder)}.`,
    sound: "default",
    data: { url: "/(app)/reminders", reminderId: reminder.id },
  };
}

async function requestPermission(): Promise<void> {
  let settings = await Notifications.getPermissionsAsync();
  if (!settings.granted) {
    settings = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
  }
  const provisionallyAllowed =
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!settings.granted && !provisionallyAllowed) {
    throw new Error(
      "Allow notifications in iPhone Settings to activate reminders.",
    );
  }
}

export async function scheduleReminderNotifications(
  reminder: Reminder,
): Promise<string[]> {
  await requestPermission();
  const { hour, minute } = timeParts(reminder.time);
  const content = notificationContent(reminder);
  if (reminder.repeat === "once") {
    const [year, month, day] = reminder.startDate.split("-").map(Number);
    const date = new Date(year, month - 1, day, hour, minute);
    if (date <= new Date()) {
      throw new Error("Choose a future date and time for a one-time reminder.");
    }
    return [
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      }),
    ];
  }
  if (reminder.repeat === "daily" || reminder.repeat === "multiple_daily") {
    return Promise.all(
      reminderTimes(reminder).map((time) => {
        const parts = timeParts(time);
        return Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: parts.hour,
            minute: parts.minute,
          },
        });
      }),
    );
  }
  const days = reminder.weekdays.length
    ? reminder.weekdays
    : [new Date().getDay()];
  return Promise.all(
    days.map((day) =>
      Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: day + 1,
          hour,
          minute,
        },
      }),
    ),
  );
}

export async function cancelReminderNotifications(ids: string[]) {
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
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

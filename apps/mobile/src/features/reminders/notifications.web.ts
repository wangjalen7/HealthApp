import type { Reminder, ReminderCompletion } from "./model";

export async function synchronizeReminderNotifications(
  reminders: Reminder[],
  completions: ReminderCompletion[],
): Promise<Reminder[]> {
  void completions;
  return reminders;
}

export async function cancelReminderNotifications() {
  // Browser preview does not schedule device notifications.
}

export async function dismissCompletedReminderNotification() {
  // Browser preview does not present device notifications.
}

export function observeReminderNotificationResponses() {
  return () => undefined;
}

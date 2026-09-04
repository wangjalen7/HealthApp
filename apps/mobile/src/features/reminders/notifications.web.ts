export async function scheduleReminderNotifications(): Promise<string[]> {
  throw new Error("Phone notifications are available in the iPhone app.");
}

export async function cancelReminderNotifications() {
  // Browser preview does not schedule device notifications.
}

export function observeReminderNotificationResponses() {
  return () => undefined;
}

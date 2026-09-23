import type { ScheduleAdapter } from "./schedule-model";
import type { NotificationTap } from "./navigation-model";
export type PermissionState =
  "allowed" | "blocked" | "undetermined" | "unavailable";
export const deviceNotificationsAvailable = false;
export async function notificationPermission(
  _request = false,
): Promise<PermissionState> {
  void _request;
  return "unavailable";
}
export const notificationAdapter: ScheduleAdapter = {
  list: async () => [],
  put: async () => {
    throw Error("Schedule notifications on your iPhone.");
  },
  remove: async () => {},
};
export function observeNotificationTaps(
  _onTap: (tap: NotificationTap) => void,
) {
  void _onTap;
  return () => {};
}
export function clearStartupResponse() {}
export async function presentedNotifications(): Promise<
  {
    date: number;
    request: { identifier: string; content: { data: Record<string, unknown> } };
  }[]
> {
  return [];
}
export async function dismissNotification(_id: string) {
  void _id;
}

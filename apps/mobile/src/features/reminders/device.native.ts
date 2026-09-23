import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { ScheduleAdapter } from "./schedule-model";
import type { NotificationTap } from "./navigation-model";
export type PermissionState =
  "allowed" | "blocked" | "undetermined" | "unavailable";
export const deviceNotificationsAvailable = Platform.OS === "ios";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
export async function notificationPermission(
  request = false,
): Promise<PermissionState> {
  if (!deviceNotificationsAvailable) return "unavailable";
  let p = await Notifications.getPermissionsAsync();
  if (request && p.status === "undetermined" && p.canAskAgain)
    p = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
  return p.granted ||
    p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ? "allowed"
    : p.status === "undetermined"
      ? "undetermined"
      : "blocked";
}
export const notificationAdapter: ScheduleAdapter = {
  list: async () =>
    (await Notifications.getAllScheduledNotificationsAsync()).map((r) => ({
      id: r.identifier,
      data: r.content.data,
      fingerprint:
        typeof r.content.data?.fingerprint === "string"
          ? r.content.data.fingerprint
          : undefined,
    })),
  put: async (r) => {
    const date = r.trigger.kind === "date" ? new Date(r.trigger.at) : undefined;
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: {
        title: r.title,
        body: r.body,
        sound: "default",
        data: { ...r.data, fingerprint: r.fingerprint },
      },
      trigger:
        r.trigger.kind === "date"
          ? {
              type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
              repeats: false,
              year: date!.getFullYear(),
              month: date!.getMonth() + 1,
              day: date!.getDate(),
              hour: date!.getHours(),
              minute: date!.getMinutes(),
              second: 0,
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
              repeats: true,
              hour: r.trigger.hour,
              minute: r.trigger.minute,
              second: 0,
              ...(r.trigger.weekday === undefined
                ? {}
                : { weekday: r.trigger.weekday }),
            },
    });
  },
  remove: (id) => Notifications.cancelScheduledNotificationAsync(id),
};
export function observeNotificationTaps(onTap: (tap: NotificationTap) => void) {
  const receive = (r: Notifications.NotificationResponse | null) => {
    if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
      return;
    onTap({
      key: `${r.notification.request.identifier}:${r.notification.date}:${r.actionIdentifier}`,
      data: r.notification.request.content.data,
    });
  };
  const listener =
    Notifications.addNotificationResponseReceivedListener(receive);
  receive(Notifications.getLastNotificationResponse());
  return () => listener.remove();
}
export function clearStartupResponse() {
  Notifications.clearLastNotificationResponse();
}
export const presentedNotifications = () =>
  Notifications.getPresentedNotificationsAsync();
export const dismissNotification = (id: string) =>
  Notifications.dismissNotificationAsync(id);

import { useEffect } from "react";
import { router } from "expo-router";
import { AppState, Platform } from "react-native";

import { useAuth } from "../auth/auth-provider";
import {
  observeReminderNotificationResponses,
  synchronizeReminderNotifications,
} from "./notifications";
import {
  listReminderCompletions,
  listReminders,
  saveReminders,
} from "./repository";

export function ReminderNotificationObserver() {
  const { session } = useAuth();
  useEffect(
    () =>
      observeReminderNotificationResponses(() =>
        router.push("/(app)/reminders"),
      ),
    [],
  );
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || Platform.OS === "web") return;
    let active = true;
    let refreshing = false;
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const [reminders, completions] = await Promise.all([
          listReminders(userId!),
          listReminderCompletions(userId!),
        ]);
        if (!active || !reminders.length) return;
        const scheduled = await synchronizeReminderNotifications(
          reminders,
          completions,
        );
        if (active) await saveReminders(userId!, scheduled);
      } catch {
        // Existing scheduled notifications remain the fallback if refresh fails.
      } finally {
        refreshing = false;
      }
    }
    void refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [session?.user.id]);
  return null;
}

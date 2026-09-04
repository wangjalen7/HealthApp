import { useEffect } from "react";
import { router } from "expo-router";

import { observeReminderNotificationResponses } from "./notifications";

export function ReminderNotificationObserver() {
  useEffect(
    () =>
      observeReminderNotificationResponses(() =>
        router.push("/(app)/reminders"),
      ),
    [],
  );
  return null;
}

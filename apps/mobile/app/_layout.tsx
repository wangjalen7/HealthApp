import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { AuthProvider, useAuth } from "../src/features/auth/auth-provider";
import { shouldDismissQuickLogForBiometricLock } from "../src/features/auth/biometric-lock-navigation";
import { ReminderNotificationObserver } from "../src/features/reminders/notification-observer";

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { biometricLocked } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (shouldDismissQuickLogForBiometricLock(biometricLocked, pathname)) {
      router.dismiss();
    }
  }, [biometricLocked, pathname]);

  return (
    <>
      <StatusBar style="dark" />
      <ReminderNotificationObserver />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(app)" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="create"
          options={{
            animation: "slide_from_bottom",
            presentation: "formSheet",
            sheetAllowedDetents: [0.62],
            sheetCornerRadius: 26,
            sheetGrabberVisible: true,
          }}
        />
      </Stack>
    </>
  );
}

import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthProvider, useAuth } from "../src/features/auth/auth-provider";
import { shouldDismissQuickLogForBiometricLock } from "../src/features/auth/biometric-lock-navigation";
import { ReminderNotificationObserver } from "../src/features/reminders/notification-observer";
import { MotionProvider, useReducedMotion } from "../src/ui/motion";
import { colors } from "../src/ui/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MotionProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </MotionProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { biometricLocked } = useAuth();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (shouldDismissQuickLogForBiometricLock(biometricLocked, pathname)) {
      if (router.canDismiss()) router.dismiss();
      else router.replace("/(app)");
    }
  }, [biometricLocked, pathname]);

  return (
    <>
      <StatusBar style="dark" />
      <ReminderNotificationObserver />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: reducedMotion ? "none" : "slide_from_right",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(app)" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="create"
          options={{
            animation: reducedMotion ? "none" : "slide_from_bottom",
            presentation: "formSheet",
            sheetAllowedDetents: [0.72, 1],
            sheetCornerRadius: 32,
            sheetGrabberVisible: true,
          }}
        />
      </Stack>
    </>
  );
}

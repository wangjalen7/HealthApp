import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "../src/features/auth/auth-provider";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
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
    </AuthProvider>
  );
}

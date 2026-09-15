import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { Redirect, router, Tabs, usePathname } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAuth } from "../../src/features/auth/auth-provider";
import { biometricPasswordReturnPath } from "../../src/features/auth/biometric-lock-navigation";
import { Icon } from "../../src/ui/icon";
import { useReducedMotion } from "../../src/ui/motion";
import { PrivacyBoundary } from "../../src/ui/privacy-boundary";

function CreateTabButton() {
  return (
    <Pressable
      accessibilityLabel="Create a new health log"
      accessibilityRole="button"
      onPress={() => router.push("/create")}
      style={styles.createTabButton}
    >
      <View style={styles.createCircle}>
        <Icon name="plus" color="#FFFFFF" size={28} />
      </View>
      <Text style={styles.createLabel}>Track</Text>
    </Pressable>
  );
}

export default function AppLayout() {
  const { biometricLocked, session, signOut, unlockWithFaceId } = useAuth();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return (
    <PrivacyBoundary
      locked={biometricLocked}
      lockScreen={
        <FaceIdLockScreen
          returnTo={biometricPasswordReturnPath(pathname)}
          signOut={signOut}
          unlockWithFaceId={unlockWithFaceId}
        />
      }
    >
      <Tabs
        screenOptions={{
          headerShown: false,
          headerShadowVisible: false,
          sceneStyle: { backgroundColor: colors.background },
          tabBarActiveTintColor: colors.blue,
          tabBarInactiveTintColor: colors.tertiary,
          animation: reducedMotion ? "none" : "fade",
          tabBarHideOnKeyboard: true,
          tabBarItemStyle: { minWidth: 0, paddingHorizontal: 0 },
          tabBarLabelStyle: { fontSize: 10, fontWeight: "600", lineHeight: 14 },
          tabBarStyle: {
            borderTopColor: colors.separator,
            backgroundColor: "rgba(255,255,255,0.97)",
            borderTopWidth: StyleSheet.hairlineWidth,
            height: 64 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 7),
            paddingTop: 8,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Summary",
            tabBarIcon: ({ color }) => <Icon name="heart" color={color} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "History",
            tabBarIcon: ({ color }) => <Icon name="history" color={color} />,
          }}
        />
        <Tabs.Screen
          name="track"
          options={{
            title: "Create",
            tabBarButton: () => <CreateTabButton />,
          }}
        />
        <Tabs.Screen name="workout" options={{ href: null }} />
        <Tabs.Screen
          name="history/[id]"
          options={{ href: null, title: "Edit workout" }}
        />
        <Tabs.Screen name="history/edit" options={{ href: null }} />
        <Tabs.Screen name="nutrition" options={{ href: null }} />
        <Tabs.Screen name="water" options={{ href: null }} />
        <Tabs.Screen name="weight" options={{ href: null }} />
        <Tabs.Screen name="reminders" options={{ href: null }} />
        <Tabs.Screen
          name="coach"
          options={{
            title: "AI Coach",
            tabBarIcon: ({ color }) => <Icon name="sparkles" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color }) => <Icon name="person" color={color} />,
          }}
        />
      </Tabs>
    </PrivacyBoundary>
  );
}

function FaceIdLockScreen({
  returnTo,
  signOut,
  unlockWithFaceId,
}: {
  returnTo: string;
  signOut: () => Promise<void>;
  unlockWithFaceId: () => Promise<{ message?: string; success: boolean }>;
}) {
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const autoAttempted = useRef(false);
  const unlock = useCallback(async () => {
    setChecking(true);
    setFeedback("");
    try {
      const result = await unlockWithFaceId();
      if (!result.success && result.message) {
        setFeedback(result.message);
      }
    } finally {
      setChecking(false);
    }
  }, [unlockWithFaceId]);
  useEffect(() => {
    const attemptWhenActive = (state = AppState.currentState) => {
      if (state === "active" && !autoAttempted.current) {
        autoAttempted.current = true;
        void unlock();
      }
    };
    attemptWhenActive();
    const subscription = AppState.addEventListener("change", attemptWhenActive);
    return () => subscription.remove();
  }, [unlock]);
  async function usePassword() {
    setChecking(true);
    setFeedback("");
    try {
      await signOut();
      router.replace({
        pathname: "/(auth)/sign-in",
        params: { returnTo },
      });
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not return to sign in.",
      );
      setChecking(false);
    }
  }
  return (
    <SafeAreaView style={styles.lockPage}>
      <View style={styles.lockControls}>
        {feedback ? (
          <Text accessibilityLiveRegion="polite" style={styles.lockError}>
            {feedback}
          </Text>
        ) : null}
        <Pressable
          accessibilityLabel="Unlock HealthApp with Face ID"
          accessibilityRole="button"
          disabled={checking}
          onPress={() => void unlock()}
          style={({ pressed }) => [
            styles.unlockButton,
            pressed && styles.unlockButtonPressed,
            checking && styles.disabledButton,
          ]}
        >
          {checking ? (
            <ActivityIndicator color="#007AFF" />
          ) : (
            <SymbolView
              fallback={<Text style={styles.unlockButtonFallback}>ID</Text>}
              name="faceid"
              size={32}
              tintColor="#007AFF"
              weight="regular"
            />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={checking}
          onPress={() => void usePassword()}
          style={styles.passwordButton}
        >
          <Text style={styles.passwordButtonText}>Sign in with password</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  createTabButton: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start",
    marginTop: -15,
  },
  createCircle: {
    alignItems: "center",
    backgroundColor: colors.blue,
    borderColor: colors.background,
    borderRadius: 28,
    borderWidth: 4,
    height: 54,
    justifyContent: "center",
    shadowColor: colors.text,
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    width: 54,
  },
  createPlus: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "300",
    lineHeight: 37,
  },
  createLabel: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  lockPage: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  lockControls: {
    alignItems: "center",
    maxWidth: 420,
    width: "100%",
  },
  lockError: {
    backgroundColor: "#FDECEC",
    borderRadius: 10,
    color: "#B42318",
    marginBottom: 12,
    marginTop: 16,
    padding: 11,
    width: "100%",
  },
  unlockButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 29,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  unlockButtonPressed: { backgroundColor: "#E5E5EA", opacity: 0.72 },
  disabledButton: { opacity: 0.65 },
  unlockButtonFallback: { color: "#007AFF", fontSize: 15, fontWeight: "700" },
  passwordButton: { marginTop: 18, padding: 7 },
  passwordButtonText: { color: "#007AFF", fontSize: 15, fontWeight: "600" },
});

import { Redirect, router, Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/features/auth/auth-provider";

function CreateTabButton() {
  return (
    <Pressable
      accessibilityLabel="Create a new health log"
      accessibilityRole="button"
      onPress={() => router.push("/create")}
      style={styles.createTabButton}
    >
      <View style={styles.createCircle}>
        <Text style={styles.createPlus}>+</Text>
      </View>
      <Text style={styles.createLabel}>Track</Text>
    </Pressable>
  );
}

export default function AppLayout() {
  const { biometricLocked, session, signOut, unlockWithFaceId } = useAuth();
  const insets = useSafeAreaInsets();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (biometricLocked) {
    return (
      <FaceIdLockScreen signOut={signOut} unlockWithFaceId={unlockWithFaceId} />
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: "#F7FAFC" },
        tabBarActiveTintColor: "#16776A",
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: { minWidth: 0, paddingHorizontal: 0 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", lineHeight: 13 },
        tabBarStyle: {
          borderTopColor: "#D9E2EC",
          height: 58 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 7),
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Summary" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
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
      <Tabs.Screen name="coach" options={{ title: "AI Coach" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

function FaceIdLockScreen({
  signOut,
  unlockWithFaceId,
}: {
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
      if (!result.success) {
        setFeedback(result.message ?? "Face ID could not verify you.");
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
      router.replace("/(auth)/sign-in");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not return to sign in.",
      );
      setChecking(false);
    }
  }
  return (
    <SafeAreaView style={styles.lockPage}>
      <View style={styles.lockCard}>
        <SymbolView
          fallback={<Text style={styles.faceIdIconFallback}>ID</Text>}
          name="faceid"
          size={54}
          style={styles.faceIdLockSymbol}
          tintColor="#007AFF"
          weight="regular"
        />
        <Text style={styles.lockTitle}>HealthApp is locked</Text>
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
    marginTop: -24,
  },
  createCircle: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderColor: "#F7FAFC",
    borderRadius: 28,
    borderWidth: 5,
    height: 58,
    justifyContent: "center",
    shadowColor: "#102A43",
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    width: 58,
  },
  createPlus: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "300",
    lineHeight: 37,
  },
  createLabel: {
    color: "#16776A",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 1,
  },
  lockPage: {
    alignItems: "center",
    backgroundColor: "#F7FAFC",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  lockCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#E6EEF3",
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 420,
    padding: 24,
    width: "100%",
  },
  faceIdIconFallback: {
    color: "#007AFF",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  faceIdLockSymbol: { marginBottom: 16 },
  lockTitle: { color: "#102A43", fontSize: 24, fontWeight: "800" },
  lockError: {
    backgroundColor: "#FDECEC",
    borderRadius: 10,
    color: "#B42318",
    marginBottom: 12,
    padding: 11,
    width: "100%",
  },
  unlockButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 29,
    height: 58,
    justifyContent: "center",
    marginTop: 20,
    width: 58,
  },
  unlockButtonPressed: { backgroundColor: "#E5E5EA", opacity: 0.72 },
  disabledButton: { opacity: 0.65 },
  unlockButtonFallback: { color: "#007AFF", fontSize: 15, fontWeight: "700" },
  passwordButton: { marginTop: 18, padding: 7 },
  passwordButtonText: { color: "#007AFF", fontSize: 15, fontWeight: "600" },
});

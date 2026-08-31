import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../src/features/auth/auth-provider";
import {
  getDailyGoals,
  saveDailyGoals,
  type DailyGoals,
} from "../../src/features/goals/repository";
import {
  connectHealthKit,
  healthKitAvailability,
  loadHealthKitSyncState,
} from "../../src/features/healthkit/sync";
import type {
  HealthKitAvailability,
  HealthKitSyncState,
} from "../../src/features/healthkit/types";

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingGoals, setLoadingGoals] = useState(true);
  const [calorieGoal, setCalorieGoal] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [weightGoal, setWeightGoal] = useState("");
  const [systolicGoal, setSystolicGoal] = useState("120");
  const [diastolicGoal, setDiastolicGoal] = useState("80");
  const [savingGoals, setSavingGoals] = useState(false);
  const [healthKit, setHealthKit] = useState<HealthKitAvailability>({
    available: false,
  });
  const [healthKitState, setHealthKitState] = useState<HealthKitSyncState>({
    connected: false,
    anchors: {},
  });
  const [healthKitBusy, setHealthKitBusy] = useState(false);
  const [healthKitFeedback, setHealthKitFeedback] = useState("");
  const loadGoals = useCallback(async () => {
    if (!session) return;
    setLoadingGoals(true);
    try {
      const goals = await getDailyGoals(session.user.id);
      setCalorieGoal(
        goals.calorieGoal === undefined ? "" : String(goals.calorieGoal),
      );
      setProteinGoal(
        goals.proteinGoal === undefined ? "" : String(goals.proteinGoal),
      );
      setWeightGoal(
        goals.weightGoalLb === undefined ? "" : String(goals.weightGoalLb),
      );
      setSystolicGoal(String(goals.systolicGoal ?? 120));
      setDiastolicGoal(String(goals.diastolicGoal ?? 80));
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not load goals.",
      );
    } finally {
      setLoadingGoals(false);
    }
  }, [session]);
  const loadAppleHealth = useCallback(async () => {
    const availability = await healthKitAvailability();
    setHealthKit(availability);
    if (session) {
      setHealthKitState(await loadHealthKitSyncState(session.user.id));
    }
  }, [session]);
  useFocusEffect(
    useCallback(() => {
      void loadGoals();
      void loadAppleHealth();
    }, [loadAppleHealth, loadGoals]),
  );
  async function connectAppleHealth() {
    if (!session)
      return setHealthKitFeedback(
        "Please sign in before connecting Apple Health.",
      );
    setHealthKitBusy(true);
    setHealthKitFeedback("");
    try {
      const connectedState = await connectHealthKit(session.user.id);
      setHealthKitState(connectedState);
      setHealthKitFeedback(
        "Apple Health connected. Summary will include it in automatic syncs.",
      );
    } catch (error) {
      setHealthKitFeedback(
        error instanceof Error
          ? error.message
          : "Could not connect Apple Health.",
      );
    } finally {
      setHealthKitBusy(false);
    }
  }
  async function saveGoals() {
    if (!session) return;
    setSavingGoals(true);
    setStatus("");
    try {
      const goals = goalValues(
        calorieGoal,
        proteinGoal,
        weightGoal,
        systolicGoal,
        diastolicGoal,
      );
      await saveDailyGoals(session.user.id, goals);
      setStatus("Goals saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save goals.",
      );
    } finally {
      setSavingGoals(false);
    }
  }
  async function handleSignOut() {
    setBusy(true);
    setStatus("");
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
    >
      <Text style={styles.title}>Profile</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text selectable style={styles.email}>
          {session?.user.email}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Goals</Text>
        <Text style={styles.copy}>
          Set your targets here. Leave protein blank to use 0.7 g per lb of your
          latest logged weight, or enter your own daily protein target.
        </Text>
        {loadingGoals ? (
          <ActivityIndicator color="#16776A" />
        ) : (
          <>
            <View style={styles.row}>
              <GoalField
                label="Calories / day"
                value={calorieGoal}
                onChangeText={setCalorieGoal}
              />
              <GoalField
                label="Protein / day (g)"
                placeholder="Auto: 0.7 g/lb"
                value={proteinGoal}
                onChangeText={setProteinGoal}
              />
            </View>
            <View style={styles.fullGoal}>
              <GoalField
                label="Weight goal (lb)"
                value={weightGoal}
                onChangeText={setWeightGoal}
              />
            </View>
            <View style={styles.row}>
              <GoalField
                label="BP systolic"
                value={systolicGoal}
                onChangeText={setSystolicGoal}
              />
              <GoalField
                label="BP diastolic"
                value={diastolicGoal}
                onChangeText={setDiastolicGoal}
              />
            </View>
            <Text style={styles.defaultHint}>
              Healthy BP default: 120/80 mmHg.
            </Text>
            <Pressable
              disabled={savingGoals}
              onPress={() => void saveGoals()}
              style={styles.saveButton}
            >
              <Text style={styles.saveText}>
                {savingGoals ? "Saving..." : "Save goals"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Apple Health</Text>
        <Text style={styles.copy}>
          Connect once to let Summary automatically import your weight and
          blood-pressure readings. Summary Sync now remains available whenever
          you want to force a sync.
        </Text>
        <Text style={styles.healthKitStatus}>
          {healthKitState.connected
            ? healthKitState.lastImportedAt
              ? `Connected · last synced ${new Date(healthKitState.lastImportedAt).toLocaleString()}`
              : "Connected · Summary will sync Apple Health automatically."
            : (healthKit.reason ?? "Ready to connect on this iPhone.")}
        </Text>
        {healthKitFeedback ? (
          <Text
            style={
              healthKitFeedback.startsWith("Apple Health connected")
                ? styles.success
                : styles.error
            }
          >
            {healthKitFeedback}
          </Text>
        ) : null}
        {!healthKitState.connected ? (
          <Pressable
            accessibilityRole="button"
            disabled={!healthKit.available || healthKitBusy}
            onPress={() => void connectAppleHealth()}
            style={[
              styles.saveButton,
              (!healthKit.available || healthKitBusy) && styles.disabledButton,
            ]}
          >
            {healthKitBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>Connect Apple Health</Text>
            )}
          </Pressable>
        ) : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Privacy first</Text>
        <Text style={styles.copy}>
          HealthApp is a wellness tracker. Your health data is protected per
          account by database row-level security.
        </Text>
      </View>
      {status ? (
        <Text
          style={
            status.startsWith("Goals saved") ? styles.success : styles.error
          }
        >
          {status}
        </Text>
      ) : null}
      <Pressable
        disabled={busy}
        onPress={() => void handleSignOut()}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          {busy ? "Signing out..." : "Sign out"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
function goalValues(
  calories: string,
  protein: string,
  weight: string,
  systolic: string,
  diastolic: string,
): DailyGoals {
  const optional = (value: string) =>
    value.trim() ? Number(value) : undefined;
  return {
    calorieGoal: optional(calories),
    proteinGoal: optional(protein),
    weightGoalLb: optional(weight),
    systolicGoal: optional(systolic),
    diastolicGoal: optional(diastolic),
  };
}
function GoalField({
  label,
  placeholder,
  value,
  onChangeText,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.goalField}>
      <Text style={styles.goalLabel}>{label}</Text>
      <TextInput
        keyboardType="decimal-pad"
        placeholder={placeholder ?? "Optional"}
        placeholderTextColor="#9FB3C8"
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  title: {
    color: "#102A43",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderColor: "#E6EEF3",
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 14,
    padding: 16,
  },
  label: { color: "#627D98", fontSize: 13 },
  email: { color: "#102A43", fontSize: 16, fontWeight: "700", marginTop: 5 },
  cardTitle: { color: "#243B53", fontSize: 16, fontWeight: "800" },
  copy: { color: "#627D98", lineHeight: 21, marginBottom: 13, marginTop: 7 },
  row: { flexDirection: "row", gap: 10 },
  fullGoal: { marginBottom: 0 },
  goalField: { flex: 1 },
  goalLabel: {
    color: "#486581",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 5,
  },
  input: {
    backgroundColor: "#F7FAFC",
    borderColor: "#D9E2EC",
    borderRadius: 9,
    borderWidth: 1,
    color: "#102A43",
    marginBottom: 11,
    padding: 10,
  },
  defaultHint: {
    color: "#16776A",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 11,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 10,
    minHeight: 43,
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "800" },
  healthKitStatus: {
    color: "#7B8794",
    fontSize: 12,
    marginBottom: 12,
    marginTop: -4,
  },
  disabledButton: { opacity: 0.65 },
  success: { color: "#16776A", fontWeight: "700", marginBottom: 6 },
  error: { color: "#B42318", marginBottom: 6 },
  button: {
    alignItems: "center",
    borderColor: "#D64545",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    minHeight: 50,
    justifyContent: "center",
  },
  buttonText: { color: "#B42318", fontWeight: "800" },
});

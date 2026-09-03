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
import {
  hydrationAmountToMl,
  mlToFluidOunces,
} from "../../src/features/hydration/model";
import {
  getProfileName,
  saveProfileName,
} from "../../src/features/profile/repository";

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loadingName, setLoadingName] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [nameFeedback, setNameFeedback] = useState("");
  const [loadingGoals, setLoadingGoals] = useState(true);
  const [calorieGoal, setCalorieGoal] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [waterGoal, setWaterGoal] = useState("");
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
  const loadName = useCallback(async () => {
    if (!session) return;
    setLoadingName(true);
    setNameFeedback("");
    try {
      const saved = await getProfileName(session.user.id);
      const metadata = session.user.user_metadata;
      setFirstName(
        saved.firstName ??
          (typeof metadata.first_name === "string" ? metadata.first_name : ""),
      );
      setLastName(
        saved.lastName ??
          (typeof metadata.last_name === "string" ? metadata.last_name : ""),
      );
    } catch (error) {
      setNameFeedback(
        error instanceof Error ? error.message : "Could not load your name.",
      );
    } finally {
      setLoadingName(false);
    }
  }, [session]);
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
      setWaterGoal(
        goals.waterGoalMl === undefined
          ? ""
          : String(mlToFluidOunces(goals.waterGoalMl)),
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
      void loadName();
      void loadGoals();
      void loadAppleHealth();
    }, [loadAppleHealth, loadGoals, loadName]),
  );
  async function updateName() {
    if (!session) return;
    if (!firstName.trim() || !lastName.trim()) {
      setNameFeedback("Enter your first and last name.");
      return;
    }
    setSavingName(true);
    setNameFeedback("");
    try {
      const saved = await saveProfileName(session.user.id, {
        firstName,
        lastName,
      });
      setFirstName(saved.firstName);
      setLastName(saved.lastName);
      setNameFeedback("Name saved.");
    } catch (error) {
      setNameFeedback(
        error instanceof Error ? error.message : "Could not save your name.",
      );
    } finally {
      setSavingName(false);
    }
  }
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
        waterGoal,
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
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.label}>Signed in as</Text>
        <Text selectable style={styles.email}>
          {session?.user.email}
        </Text>
        {loadingName ? (
          <ActivityIndicator color="#16776A" style={styles.nameLoading} />
        ) : (
          <>
            <View style={styles.nameRow}>
              <NameField
                autoComplete="given-name"
                label="First name"
                onChangeText={setFirstName}
                textContentType="givenName"
                value={firstName}
              />
              <NameField
                autoComplete="family-name"
                label="Last name"
                onChangeText={setLastName}
                textContentType="familyName"
                value={lastName}
              />
            </View>
            {nameFeedback ? (
              <Text
                accessibilityLiveRegion="polite"
                style={
                  nameFeedback === "Name saved." ? styles.success : styles.error
                }
              >
                {nameFeedback}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={savingName}
              onPress={() => void updateName()}
              style={styles.saveButton}
            >
              <Text style={styles.saveText}>
                {savingName ? "Saving..." : "Save name"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Goals</Text>
        <Text style={styles.copy}>
          Set your daily nutrition, hydration, weight, and blood-pressure
          targets here.
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
                placeholder="Default: 0.7 g/lb"
                value={proteinGoal}
                onChangeText={setProteinGoal}
              />
            </View>
            <View style={styles.fullGoal}>
              <GoalField
                label="Water / day (fl oz)"
                value={waterGoal}
                onChangeText={setWaterGoal}
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
                placeholder="Default: 120"
                value={systolicGoal}
                onChangeText={setSystolicGoal}
              />
              <GoalField
                label="BP diastolic"
                placeholder="Default: 80"
                value={diastolicGoal}
                onChangeText={setDiastolicGoal}
              />
            </View>
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
          Connect once to let automatically import your weight and
          blood-pressure readings.
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
  water: string,
  weight: string,
  systolic: string,
  diastolic: string,
): DailyGoals {
  const optional = (value: string) =>
    value.trim() ? Number(value) : undefined;
  const waterOunces = optional(water);
  return {
    calorieGoal: optional(calories),
    proteinGoal: optional(protein),
    waterGoalMl:
      waterOunces === undefined
        ? undefined
        : hydrationAmountToMl(waterOunces, "fl_oz"),
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
function NameField({
  autoComplete,
  label,
  onChangeText,
  textContentType,
  value,
}: {
  autoComplete: "family-name" | "given-name";
  label: string;
  onChangeText: (value: string) => void;
  textContentType: "familyName" | "givenName";
  value: string;
}) {
  return (
    <View style={styles.goalField}>
      <Text style={styles.goalLabel}>{label}</Text>
      <TextInput
        autoCapitalize="words"
        autoComplete={autoComplete}
        maxLength={80}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#9FB3C8"
        style={styles.input}
        textContentType={textContentType}
        value={value}
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
  label: { color: "#627D98", fontSize: 13, marginTop: 10 },
  email: { color: "#102A43", fontSize: 16, fontWeight: "700", marginTop: 5 },
  cardTitle: { color: "#243B53", fontSize: 16, fontWeight: "800" },
  copy: { color: "#627D98", lineHeight: 21, marginBottom: 13, marginTop: 7 },
  row: { flexDirection: "row", gap: 10 },
  nameRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  nameLoading: { marginTop: 16 },
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

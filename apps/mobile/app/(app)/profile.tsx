import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  ActivityIndicator,
  Modal,
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
  const {
    faceIdAvailability,
    faceIdEnabled,
    refreshFaceIdAvailability,
    session,
    setFaceIdEnabled,
    signOut,
  } = useAuth();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savedFirstName, setSavedFirstName] = useState("");
  const [savedLastName, setSavedLastName] = useState("");
  const [loadingName, setLoadingName] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [nameFeedback, setNameFeedback] = useState("");
  const [faceIdBusy, setFaceIdBusy] = useState(false);
  const [faceIdFeedback, setFaceIdFeedback] = useState("");
  const [faceIdPassword, setFaceIdPassword] = useState("");
  const [faceIdPromptOpen, setFaceIdPromptOpen] = useState(false);
  const [loadingGoals, setLoadingGoals] = useState(true);
  const [calorieGoal, setCalorieGoal] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [waterGoal, setWaterGoal] = useState("");
  const [weightGoal, setWeightGoal] = useState("");
  const [systolicGoal, setSystolicGoal] = useState("120");
  const [diastolicGoal, setDiastolicGoal] = useState("80");
  const [savingGoals, setSavingGoals] = useState(false);
  const [goalsFeedback, setGoalsFeedback] = useState("");
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
      const loadedFirstName =
        saved.firstName ??
        (typeof metadata.first_name === "string" ? metadata.first_name : "");
      const loadedLastName =
        saved.lastName ??
        (typeof metadata.last_name === "string" ? metadata.last_name : "");
      setFirstName(loadedFirstName);
      setLastName(loadedLastName);
      setSavedFirstName(loadedFirstName.trim());
      setSavedLastName(loadedLastName.trim());
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
      void refreshFaceIdAvailability();
    }, [loadAppleHealth, loadGoals, loadName, refreshFaceIdAvailability]),
  );
  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim();
  const hasCompleteName = Boolean(cleanFirstName && cleanLastName);
  const nameHasChanges =
    cleanFirstName !== savedFirstName || cleanLastName !== savedLastName;
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
      setSavedFirstName(saved.firstName);
      setSavedLastName(saved.lastName);
      setNameFeedback("Profile name saved.");
    } catch (error) {
      setNameFeedback(
        error instanceof Error ? error.message : "Could not save your name.",
      );
    } finally {
      setSavingName(false);
    }
  }
  function changeFirstName(value: string) {
    setFirstName(value);
    setNameFeedback("");
  }
  function changeLastName(value: string) {
    setLastName(value);
    setNameFeedback("");
  }
  async function toggleFaceId(enabled: boolean) {
    setFaceIdBusy(true);
    setFaceIdFeedback("");
    try {
      const result = await setFaceIdEnabled(enabled, faceIdPassword);
      setFaceIdFeedback(
        result.success
          ? enabled
            ? "Face ID enabled."
            : "Face ID disabled."
          : (result.message ?? "Could not change the Face ID setting."),
      );
      if (result.success) {
        setFaceIdPassword("");
        if (enabled) setFaceIdPromptOpen(false);
      }
    } catch (error) {
      setFaceIdFeedback(
        error instanceof Error
          ? error.message
          : "Could not change the Face ID setting.",
      );
    } finally {
      setFaceIdBusy(false);
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
      setHealthKitFeedback("Apple Health connected.");
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
    setGoalsFeedback("");
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
      setGoalsFeedback("Goals saved.");
    } catch (error) {
      setGoalsFeedback(
        error instanceof Error ? error.message : "Could not save goals.",
      );
    } finally {
      setSavingGoals(false);
    }
  }
  function changeGoal(setter: (value: string) => void, value: string) {
    setter(value);
    setGoalsFeedback("");
  }
  function closeFaceIdPrompt() {
    if (faceIdBusy) return;
    setFaceIdPassword("");
    setFaceIdFeedback("");
    setFaceIdPromptOpen(false);
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
    <>
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
                  onChangeText={changeFirstName}
                  textContentType="givenName"
                  value={firstName}
                />
                <NameField
                  autoComplete="family-name"
                  label="Last name"
                  onChangeText={changeLastName}
                  textContentType="familyName"
                  value={lastName}
                />
              </View>
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.nameStatus,
                  nameFeedback && nameFeedback !== "Profile name saved."
                    ? styles.nameStatusError
                    : !hasCompleteName
                      ? styles.nameStatusRequired
                      : nameHasChanges
                        ? styles.nameStatusUnsaved
                        : styles.nameStatusSaved,
                ]}
              >
                <Text
                  style={[
                    styles.nameStatusText,
                    nameFeedback && nameFeedback !== "Profile name saved."
                      ? styles.nameStatusErrorText
                      : !hasCompleteName
                        ? styles.nameStatusRequiredText
                        : nameHasChanges
                          ? styles.nameStatusUnsavedText
                          : styles.nameStatusSavedText,
                  ]}
                >
                  {nameFeedback ||
                    (!hasCompleteName
                      ? "First and last name are required"
                      : nameHasChanges
                        ? "Unsaved name changes"
                        : "✓ Profile name saved")}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={savingName || !nameHasChanges || !hasCompleteName}
                onPress={() => void updateName()}
                style={[
                  styles.saveButton,
                  (savingName || !nameHasChanges || !hasCompleteName) &&
                    styles.disabledButton,
                ]}
              >
                <Text style={styles.saveText}>
                  {savingName
                    ? "Saving..."
                    : nameHasChanges
                      ? "Save name"
                      : "Name saved"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
        <View style={styles.card}>
          <Pressable
            accessibilityLabel={
              faceIdEnabled ? "Disable Face ID" : "Enable Face ID"
            }
            accessibilityRole="button"
            disabled={
              faceIdBusy || (!faceIdEnabled && !faceIdAvailability.available)
            }
            onPress={() => {
              setFaceIdFeedback("");
              if (faceIdEnabled) {
                void toggleFaceId(false);
              } else {
                setFaceIdPassword("");
                setFaceIdPromptOpen(true);
              }
            }}
            style={({ pressed }) => [
              styles.faceIdSettingsRow,
              pressed && styles.faceIdActionPressed,
            ]}
          >
            <View style={styles.faceIdSettingsIcon}>
              <SymbolView
                fallback={<Text style={styles.faceIdFallback}>ID</Text>}
                name="faceid"
                size={28}
                tintColor="#007AFF"
                weight="regular"
              />
            </View>
            <View style={styles.faceIdSettingsContent}>
              <Text style={styles.securityTitle}>Face ID</Text>
            </View>
            {faceIdBusy ? (
              <ActivityIndicator color="#007AFF" />
            ) : (
              <Text
                style={[
                  styles.faceIdActionText,
                  faceIdEnabled && styles.faceIdDisableText,
                ]}
              >
                {faceIdEnabled ? "Disable" : "Enable"}
              </Text>
            )}
          </Pressable>
          {!faceIdEnabled && !faceIdAvailability.available ? (
            <Text style={styles.faceIdStatus}>
              {faceIdAvailability.reason ?? "Checking Face ID availability…"}
            </Text>
          ) : null}
          {faceIdFeedback ? (
            <Text
              accessibilityLiveRegion="polite"
              style={
                faceIdFeedback.startsWith("Face ID enabled") ||
                faceIdFeedback.startsWith("Face ID disabled")
                  ? styles.success
                  : styles.error
              }
            >
              {faceIdFeedback}
            </Text>
          ) : null}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Goals</Text>
          {loadingGoals ? (
            <ActivityIndicator color="#16776A" />
          ) : (
            <View style={styles.goalsBody}>
              <View style={styles.row}>
                <GoalField
                  label="Calories / day"
                  value={calorieGoal}
                  onChangeText={(value) => changeGoal(setCalorieGoal, value)}
                />
                <GoalField
                  label="Protein / day (g)"
                  placeholder="Default: 0.7 g/lb"
                  value={proteinGoal}
                  onChangeText={(value) => changeGoal(setProteinGoal, value)}
                />
              </View>
              <View style={styles.fullGoal}>
                <GoalField
                  label="Water / day (fl oz)"
                  value={waterGoal}
                  onChangeText={(value) => changeGoal(setWaterGoal, value)}
                />
              </View>
              <View style={styles.fullGoal}>
                <GoalField
                  label="Weight goal (lb)"
                  value={weightGoal}
                  onChangeText={(value) => changeGoal(setWeightGoal, value)}
                />
              </View>
              <View style={styles.row}>
                <GoalField
                  label="BP systolic"
                  placeholder="Default: 120"
                  value={systolicGoal}
                  onChangeText={(value) => changeGoal(setSystolicGoal, value)}
                />
                <GoalField
                  label="BP diastolic"
                  placeholder="Default: 80"
                  value={diastolicGoal}
                  onChangeText={(value) => changeGoal(setDiastolicGoal, value)}
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
              {goalsFeedback ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={
                    goalsFeedback === "Goals saved."
                      ? styles.inlineSuccess
                      : styles.inlineError
                  }
                >
                  {goalsFeedback}
                </Text>
              ) : null}
            </View>
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Apple Health</Text>
          <Text style={styles.healthKitStatus}>
            {healthKitState.connected
              ? healthKitState.lastImportedAt
                ? `Connected · last synced ${new Date(healthKitState.lastImportedAt).toLocaleString()}`
                : "Connected"
              : (healthKit.reason ?? "Not connected")}
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
                (!healthKit.available || healthKitBusy) &&
                  styles.disabledButton,
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
        {status ? <Text style={styles.error}>{status}</Text> : null}
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
      <Modal
        animationType="fade"
        onRequestClose={closeFaceIdPrompt}
        transparent
        visible={faceIdPromptOpen}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enable Face ID</Text>
            <TextInput
              accessibilityLabel="Current password"
              autoCapitalize="none"
              autoComplete="current-password"
              autoFocus
              onChangeText={(value) => {
                setFaceIdPassword(value);
                setFaceIdFeedback("");
              }}
              onSubmitEditing={() => {
                if (faceIdPassword && !faceIdBusy) void toggleFaceId(true);
              }}
              placeholder="Current password"
              placeholderTextColor="#9FB3C8"
              secureTextEntry
              style={styles.modalInput}
              value={faceIdPassword}
            />
            {faceIdFeedback ? (
              <Text accessibilityLiveRegion="polite" style={styles.inlineError}>
                {faceIdFeedback}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={faceIdBusy}
                onPress={closeFaceIdPrompt}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!faceIdPassword || faceIdBusy}
                onPress={() => void toggleFaceId(true)}
                style={[
                  styles.modalEnable,
                  (!faceIdPassword || faceIdBusy) && styles.disabledButton,
                ]}
              >
                {faceIdBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalEnableText}>Enable</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  row: { flexDirection: "row", gap: 10 },
  nameRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  nameLoading: { marginTop: 16 },
  nameStatus: {
    borderRadius: 9,
    marginBottom: 10,
    minHeight: 34,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  nameStatusSaved: { backgroundColor: "#E7F4F1" },
  nameStatusUnsaved: { backgroundColor: "#FFF3D6" },
  nameStatusRequired: { backgroundColor: "#EEF2F6" },
  nameStatusError: { backgroundColor: "#FDECEC" },
  nameStatusText: { fontSize: 13, fontWeight: "800" },
  nameStatusSavedText: { color: "#16776A" },
  nameStatusUnsavedText: { color: "#8A4B00" },
  nameStatusRequiredText: { color: "#52606D" },
  nameStatusErrorText: { color: "#B42318" },
  fullGoal: { marginBottom: 0 },
  goalsBody: { marginTop: 14 },
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
    marginTop: 10,
  },
  securityTitle: {
    color: "#1C1C1E",
    fontSize: 15,
    fontWeight: "600",
  },
  faceIdSettingsRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 44,
  },
  faceIdSettingsIcon: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    height: 42,
    justifyContent: "center",
    marginRight: 12,
    width: 42,
  },
  faceIdSettingsContent: { flex: 1 },
  faceIdStatus: { color: "#8E8E93", fontSize: 12, marginTop: 10 },
  faceIdFallback: { color: "#007AFF", fontSize: 12, fontWeight: "700" },
  faceIdActionPressed: { opacity: 0.45 },
  faceIdActionText: { color: "#007AFF", fontSize: 15, fontWeight: "600" },
  faceIdDisableText: { color: "#FF3B30" },
  disabledButton: { opacity: 0.65 },
  success: { color: "#16776A", fontWeight: "700", marginBottom: 6 },
  error: { color: "#B42318", marginBottom: 6 },
  inlineSuccess: {
    color: "#16776A",
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  inlineError: { color: "#B42318", marginTop: 10, textAlign: "center" },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 35, 48, 0.42)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    maxWidth: 380,
    padding: 18,
    width: "100%",
  },
  modalTitle: {
    color: "#102A43",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 14,
    textAlign: "center",
  },
  modalInput: {
    backgroundColor: "#F7FAFC",
    borderColor: "#D9E2EC",
    borderRadius: 10,
    borderWidth: 1,
    color: "#102A43",
    padding: 12,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalCancel: {
    alignItems: "center",
    borderColor: "#D9E2EC",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  modalCancelText: { color: "#486581", fontWeight: "700" },
  modalEnable: {
    alignItems: "center",
    backgroundColor: "#007AFF",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  modalEnableText: { color: "#fff", fontWeight: "800" },
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

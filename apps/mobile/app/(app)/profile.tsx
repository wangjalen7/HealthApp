import { DeleteAccountSection } from "../../src/features/auth/account-deletion";
import { SyncSettings } from "../../src/features/healthkit/sync-settings";
import { useAccountSetup } from "../../src/features/onboarding/provider";
import { AccountContacts } from "../../src/features/auth/account-contacts";
import { AccountPreferences } from "../../src/features/onboarding/account-preferences";
import { SecuritySettings } from "../../src/features/auth/security-settings";
import { dayKey, shiftDay } from "../../src/features/summary/calendar";
import {
  colors,
  surfaces,
  typography,
  spacing,
  radii,
} from "../../src/ui/profile-theme";
import { Modal } from "../../src/ui/modal";
import { Icon } from "../../src/ui/icon";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Pressable } from "../../src/ui/pressable";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { TextInput } from "../../src/ui/text-input";
import {
  appearancePreferences,
  type AppearancePreference,
  useAppAppearance,
} from "../../src/ui/appearance";

import { useAuth } from "../../src/features/auth/auth-provider";
import {
  getDailyGoals,
  saveDailyGoals,
  type DailyGoals,
} from "../../src/features/goals/repository";
import {
  GoalHelper,
  type GoalHelperMode,
} from "../../src/features/goals/goal-helper";
import {
  connectHealthKit,
  healthKitAvailability,
  loadHealthKitSyncState,
} from "../../src/features/healthkit/sync";
import { shareHealthDataExport } from "../../src/features/data-export/archive";
import { formatBytes } from "../../src/features/data-export/model";
import {
  collectHealthDataExport,
  getProgressPhotoExportSummary,
} from "../../src/features/data-export/repository";
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
import { latestSample } from "../../src/domain/vitals";
import { cachedVitals } from "../../src/features/vitals/storage";

export default function ProfileScreen() {
  const { setup: accountSetup } = useAccountSetup();
  const router = useRouter();
  const [profileSection, setProfileSection] = useState<"profile" | "settings">(
    "profile",
  );
  const { preference: appearance, setPreference: setAppearance } =
    useAppAppearance();
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
  const [savedGoals, setSavedGoals] = useState<DailyGoals>({});
  const [goalHelperMode, setGoalHelperMode] = useState<GoalHelperMode>();
  const [latestWeightLb, setLatestWeightLb] = useState<number>();
  const [latestWeightAt, setLatestWeightAt] = useState<string>();
  const [healthKit, setHealthKit] = useState<HealthKitAvailability>({
    available: false,
  });
  const [healthKitState, setHealthKitState] = useState<HealthKitSyncState>({
    connected: false,
    anchors: {},
  });
  const [healthKitBusy, setHealthKitBusy] = useState(false);
  const [healthKitFeedback, setHealthKitFeedback] = useState("");
  const [exportBusy, setExportBusy] = useState<"records" | "photos">();
  const [exportFeedback, setExportFeedback] = useState("");
  const [exportFailed, setExportFailed] = useState(false);
  const [photoExportSummary, setPhotoExportSummary] = useState<{
    count: number;
    bytes: number;
  }>();
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
      const [goals, samples] = await Promise.all([
        getDailyGoals(session.user.id),
        cachedVitals(session.user.id),
      ]);
      const latestWeight = latestSample(samples, "weight");
      setSavedGoals(goals);
      setLatestWeightLb(
        latestWeight
          ? latestWeight.unit === "kg"
            ? latestWeight.value / 0.45359237
            : latestWeight.value
          : undefined,
      );
      setLatestWeightAt(latestWeight?.occurredAt);
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
  const loadPhotoExportSummary = useCallback(async () => {
    if (!session) return;
    try {
      setPhotoExportSummary(
        await getProgressPhotoExportSummary(session.user.id),
      );
    } catch {
      setPhotoExportSummary(undefined);
    }
  }, [session]);
  useFocusEffect(
    useCallback(() => {
      void loadName();
      void loadGoals();
      void loadAppleHealth();
      void loadPhotoExportSummary();
      void refreshFaceIdAvailability();
    }, [
      loadAppleHealth,
      loadGoals,
      loadName,
      loadPhotoExportSummary,
      refreshFaceIdAvailability,
    ]),
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
      if (goals.calorieGoal === savedGoals.calorieGoal)
        goals.calorieCalculation = savedGoals.calorieCalculation;
      if (
        savedGoals.waterGoalMl !== undefined &&
        waterGoal === String(mlToFluidOunces(savedGoals.waterGoalMl))
      ) {
        goals.waterGoalMl = savedGoals.waterGoalMl;
        goals.fluidCalculation = savedGoals.fluidCalculation;
      }
      const accepted = await saveDailyGoals(session.user.id, goals, savedGoals);
      setSavedGoals(accepted);
      setCalorieGoal(
        accepted.calorieGoal === undefined ? "" : String(accepted.calorieGoal),
      );
      setProteinGoal(
        accepted.proteinGoal === undefined ? "" : String(accepted.proteinGoal),
      );
      setWaterGoal(
        accepted.waterGoalMl === undefined
          ? ""
          : String(mlToFluidOunces(accepted.waterGoalMl)),
      );
      setWeightGoal(
        accepted.weightGoalLb === undefined
          ? ""
          : String(accepted.weightGoalLb),
      );
      setSystolicGoal(
        accepted.systolicGoal === undefined
          ? ""
          : String(accepted.systolicGoal),
      );
      setDiastolicGoal(
        accepted.diastolicGoal === undefined
          ? ""
          : String(accepted.diastolicGoal),
      );
      setGoalsFeedback("Goals saved.");
    } catch (error) {
      setGoalsFeedback(
        error instanceof Error ? error.message : "Could not save goals.",
      );
    } finally {
      setSavingGoals(false);
    }
  }
  async function useCalculatedCalories(
    calories: number,
    calculatedWeightGoal?: number,
    calculation?: Record<string, unknown>,
  ) {
    if (!session) throw new Error("Please sign in to save a target.");
    const goals: DailyGoals = {
      ...savedGoals,
      calorieGoal: calories,
      calorieCalculation: calculation,
      ...(calculatedWeightGoal === undefined
        ? {}
        : { weightGoalLb: calculatedWeightGoal }),
    };
    const accepted = await saveDailyGoals(session.user.id, goals, savedGoals);
    setSavedGoals(accepted);
    setCalorieGoal(String(calories));
    if (calculatedWeightGoal !== undefined)
      setWeightGoal(String(calculatedWeightGoal));
    setGoalsFeedback("Calorie target saved.");
  }
  async function useCalculatedFluid(
    milliliters: number,
    calculation?: Record<string, unknown>,
  ) {
    if (!session) throw new Error("Please sign in to save a goal.");
    const ounces = mlToFluidOunces(milliliters);
    const goals: DailyGoals = {
      ...savedGoals,
      waterGoalMl: milliliters,
      fluidCalculation: calculation,
    };
    const accepted = await saveDailyGoals(session.user.id, goals, savedGoals);
    setSavedGoals(accepted);
    setWaterGoal(String(ounces));
    setGoalsFeedback("Fluid goal saved.");
  }
  async function exportData(includePhotos: boolean) {
    if (!session || exportBusy) return;
    setExportBusy(includePhotos ? "photos" : "records");
    setExportFailed(false);
    setExportFeedback("Collecting your data...");
    try {
      const data = await collectHealthDataExport(session.user);
      await shareHealthDataExport(data, includePhotos, (progress) => {
        if (!progress.totalPhotos) return;
        setExportFeedback(
          `Adding photo ${progress.completedPhotos} of ${progress.totalPhotos}...`,
        );
      });
      setExportFeedback("Export finished.");
    } catch (error) {
      setExportFailed(true);
      setExportFeedback(
        error instanceof Error ? error.message : "Could not export your data.",
      );
    } finally {
      setExportBusy(undefined);
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
      <ScreenScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.page}
      >
        <Text accessibilityRole="header" style={styles.title}>
          {profileSection === "profile" ? "Profile" : "Settings"}
        </Text>
        <View style={styles.profileTabs}>
          {(["profile", "settings"] as const).map((section) => {
            const selected = profileSection === section;
            const label = section === "profile" ? "Profile" : "Settings";
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={section}
                onPress={() => setProfileSection(section)}
                style={[
                  styles.profileTab,
                  selected && styles.profileTabSelected,
                ]}
              >
                <Text
                  style={[
                    styles.profileTabText,
                    selected && styles.profileTabTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {profileSection === "profile" ? (
          <View style={styles.profileHero}>
            <View style={styles.avatar}>
              <Icon name="person" size={29} color={colors.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>
                {[firstName, lastName].filter(Boolean).join(" ") ||
                  "Your profile"}
              </Text>
              <Text style={styles.profileCaption}>
                Your goals. Your daily routine.
              </Text>
            </View>
          </View>
        ) : null}
        {profileSection === "settings" ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Appearance
            </Text>
            <Text style={styles.appearanceDescription}>
              Match your iPhone or keep HealthApp in light or dark mode.
            </Text>
            <View style={styles.appearanceOptions}>
              {appearancePreferences.map((option) => (
                <AppearanceOption
                  key={option}
                  option={option}
                  selected={appearance === option}
                  onSelect={() => void setAppearance(option)}
                />
              ))}
            </View>
          </View>
        ) : null}
        {profileSection === "profile" ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Account
            </Text>
            <Text style={styles.label}>Signed in as</Text>
            <Text selectable style={styles.email}>
              {session?.user.email}
            </Text>
            {loadingName ? (
              <ActivityIndicator
                color={colors.blue}
                style={styles.nameLoading}
              />
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
        ) : null}
        {profileSection === "settings" ? (
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
                  tintColor={colors.blue}
                  weight="regular"
                />
              </View>
              <View style={styles.faceIdSettingsContent}>
                <Text style={styles.securityTitle}>Face ID</Text>
              </View>
              {faceIdBusy ? (
                <ActivityIndicator color={colors.blue} />
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
        ) : null}
        {profileSection === "settings" && session ? (
          <View style={styles.card}>
            <AccountPreferences />
            <AccountContacts key={session.user.id} />
            <SecuritySettings userId={session.user.id} />
          </View>
        ) : null}
        {profileSection === "profile" ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Goals
            </Text>
            {loadingGoals ? (
              <ActivityIndicator color={colors.blue} />
            ) : (
              <View style={styles.goalsBody}>
                <View style={styles.goalHelperActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setGoalHelperMode("calories")}
                    style={styles.goalHelperButton}
                  >
                    <Icon name="food" size={18} color={colors.blue} />
                    <Text style={styles.goalHelperButtonText}>
                      Find my calories
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setGoalHelperMode("fluids")}
                    style={styles.goalHelperButton}
                  >
                    <Icon name="water" size={18} color={colors.blue} />
                    <Text style={styles.goalHelperButtonText}>
                      Find my fluid goal
                    </Text>
                  </Pressable>
                </View>
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
                    label="Weight (lb)"
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
                    onChangeText={(value) =>
                      changeGoal(setDiastolicGoal, value)
                    }
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
            <Text style={styles.healthKitStatus}>
                  Streak targets for changes saved today start{" "}
                  {shiftDay(dayKey(), 1)}.
                </Text>
                {goalsFeedback ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={
                      goalsFeedback.endsWith("saved.")
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
        ) : null}
        {profileSection === "settings" ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Health Data & Sync
            </Text>
            {session ? <SyncSettings user={session.user.id} /> : null}
            <Text style={styles.healthKitStatus}>
              {healthKitState.connected
                ? healthKitState.lastImportedAt
                  ? `Connected · last synced ${new Date(healthKitState.lastImportedAt).toLocaleString()}`
                  : "Connected"
                : (healthKit.reason ?? "Not connected")}
            </Text>
            {healthKitFeedback ? (
              <Text
                accessibilityLiveRegion="polite"
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
        ) : null}
        {profileSection === "settings" ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              Export your data
            </Text>
            <Text style={styles.exportDescription}>
              Create a private ZIP with CSV files for each category and a
              complete JSON copy. Choose Mail, AirDrop, Save to Files, or
              another app from the share sheet.
            </Text>
            <Text style={styles.exportPhotoNote}>
              {photoExportSummary
                ? photoExportSummary.count
                  ? `${photoExportSummary.count} progress ${photoExportSummary.count === 1 ? "photo" : "photos"} use about ${formatBytes(photoExportSummary.bytes)}. Large photo exports may exceed your email provider's attachment limit.`
                  : "You have no progress photos, so both exports will be about the same size."
                : "Progress photos can make the archive too large for some email providers."}
            </Text>
            <View style={styles.exportActions}>
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(exportBusy)}
                onPress={() => void exportData(false)}
                style={[
                  styles.exportSecondaryButton,
                  exportBusy && styles.disabledButton,
                ]}
              >
                {exportBusy === "records" ? (
                  <ActivityIndicator color={colors.blue} />
                ) : (
                  <Text style={styles.exportSecondaryText}>Export records</Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(exportBusy)}
                onPress={() => void exportData(true)}
                style={[
                  styles.exportPrimaryButton,
                  exportBusy && styles.disabledButton,
                ]}
              >
                {exportBusy === "photos" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Export with photos</Text>
                )}
              </Pressable>
            </View>
            {exportFeedback ? (
              <Text
                accessibilityLiveRegion="polite"
                style={exportFailed ? styles.inlineError : styles.inlineSuccess}
              >
                {exportFeedback}
              </Text>
            ) : null}
          </View>
        ) : null}
        {profileSection === "settings" && session ? <DeleteAccountSection user={session.user.id} /> : null}
        {profileSection === "profile" && status ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {status}
          </Text>
        ) : null}
        {profileSection === "profile" ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void handleSignOut()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>
              {busy ? "Signing out..." : "Sign out"}
            </Text>
          </Pressable>
        ) : null}
      </ScreenScrollView>
      <GoalHelper
        defaultUnitSystem={accountSetup?.unit_system}
        defaultFluidUnit={accountSetup?.fluid_unit}
        defaultWeightLb={latestWeightLb}
        defaultWeightOccurredAt={latestWeightAt}
        initialMode={goalHelperMode ?? "calories"}
        onClose={() => setGoalHelperMode(undefined)}
        onUseCalories={useCalculatedCalories}
        onUseFluid={useCalculatedFluid}
        savedWaterGoalMl={savedGoals.waterGoalMl}
        savedWeightGoalLb={savedGoals.weightGoalLb}
        visible={Boolean(goalHelperMode)}
      />
      <Modal
        animationType="fade"
        onRequestClose={closeFaceIdPrompt}
        transparent
        visible={faceIdPromptOpen}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              Enable Face ID
            </Text>
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

function AppearanceOption({
  option,
  selected,
  onSelect,
}: {
  option: AppearancePreference;
  selected: boolean;
  onSelect: () => void;
}) {
  const label =
    option === "system" ? "Device" : option === "light" ? "Light" : "Dark";
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      style={[
        styles.appearanceOption,
        selected && styles.appearanceOptionSelected,
      ]}
    >
      <Text
        style={[
          styles.appearanceOptionText,
          selected && styles.appearanceOptionTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
        accessibilityLabel={label}
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
        accessibilityLabel={label}
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
  profileHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    marginBottom: 24,
  },
  avatar: {
    height: 64,
    width: 64,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.card,
  },
  profileName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  profileCaption: {
    color: colors.secondary,
    fontSize: 13,
    marginTop: 5,
  },
  page: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.page,
  },
  title: {
    ...typography.largeTitle,
    marginBottom: 20,
  },
  card: {
    ...surfaces.card,
    marginBottom: 14,
    padding: spacing.lg,
  },
  label: {
    ...typography.label,
    marginTop: 10,
  },
  email: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 5,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  appearanceDescription: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  appearanceOptions: {
    backgroundColor: colors.fill,
    borderRadius: 11,
    flexDirection: "row",
    gap: 3,
    marginTop: 14,
    padding: 3,
  },
  appearanceOption: {
    alignItems: "center",
    borderRadius: 9,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 8,
  },
  appearanceOptionSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderWidth: StyleSheet.hairlineWidth,
  },
  appearanceOptionText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: "600",
  },
  appearanceOptionTextSelected: { color: colors.text },
  profileTabs: {
    backgroundColor: colors.fill,
    borderRadius: 13,
    flexDirection: "row",
    gap: 4,
    marginBottom: spacing.lg,
    padding: 4,
  },
  profileTab: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 12,
  },
  profileTabSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderWidth: StyleSheet.hairlineWidth,
  },
  profileTabText: {
    color: colors.secondary,
    fontSize: 15,
    fontWeight: "600",
  },
  profileTabTextSelected: { color: colors.text },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  nameRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  nameLoading: {
    marginTop: 16,
  },
  nameStatus: {
    borderRadius: 9,
    marginBottom: 10,
    minHeight: 34,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  nameStatusSaved: {
    backgroundColor: colors.greenSoft,
  },
  nameStatusUnsaved: {
    backgroundColor: colors.orangeSoft,
  },
  nameStatusRequired: {
    backgroundColor: colors.fill,
  },
  nameStatusError: {
    backgroundColor: colors.dangerSoft,
  },
  nameStatusText: {
    fontSize: 13,
    fontWeight: "600",
  },
  nameStatusSavedText: {
    color: colors.green,
  },
  nameStatusUnsavedText: {
    color: colors.orange,
  },
  nameStatusRequiredText: {
    color: colors.secondary,
  },
  nameStatusErrorText: {
    color: colors.danger,
  },
  fullGoal: {
    marginBottom: 0,
  },
  goalsBody: {
    marginTop: 14,
  },
  goalHelperActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 15,
  },
  goalHelperButton: {
    alignItems: "center",
    backgroundColor: colors.blueSoft,
    borderColor: colors.blue,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    flexGrow: 1,
    gap: 7,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 11,
  },
  goalHelperButtonText: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: "700",
  },
  goalField: {
    flex: 1,
  },
  goalLabel: {
    ...typography.label,
    marginBottom: 5,
  },
  input: {
    ...surfaces.input,
    marginBottom: 11,
  },
  saveButton: {
    ...surfaces.button,
  },
  saveText: {
    color: "#fff",
    fontWeight: "600",
  },
  healthKitStatus: {
    color: colors.tertiary,
    marginBottom: 12,
    marginTop: 10,
    fontSize: typography.footnote.fontSize,
  },
  exportDescription: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  exportPhotoNote: {
    color: colors.tertiary,
    lineHeight: 17,
    marginTop: 8,
    fontSize: typography.footnote.fontSize,
  },
  exportActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  exportSecondaryButton: {
    alignItems: "center",
    borderColor: colors.blue,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  exportSecondaryText: {
    color: colors.blue,
    fontWeight: "600",
  },
  exportPrimaryButton: {
    ...surfaces.button,
    flex: 1,
  },
  securityTitle: {
    color: colors.text,
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
    backgroundColor: colors.background,
    borderRadius: 10,
    height: 42,
    justifyContent: "center",
    marginRight: 12,
    width: 42,
  },
  faceIdSettingsContent: {
    flex: 1,
  },
  faceIdStatus: {
    color: colors.tertiary,
    marginTop: 10,
    fontSize: typography.footnote.fontSize,
  },
  faceIdFallback: {
    color: colors.blue,
    fontWeight: "700",
    fontSize: typography.footnote.fontSize,
  },
  faceIdActionPressed: {
    opacity: 0.45,
  },
  faceIdActionText: {
    color: colors.blue,
    fontSize: 15,
    fontWeight: "600",
  },
  faceIdDisableText: {
    color: colors.danger,
  },
  disabledButton: {
    opacity: 0.65,
    minHeight: 44,
    justifyContent: "center",
  },
  success: {
    color: colors.green,
    fontWeight: "700",
    marginBottom: 6,
  },
  error: {
    color: colors.danger,
    marginBottom: 6,
  },
  inlineSuccess: {
    color: colors.green,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  inlineError: {
    color: colors.danger,
    marginTop: 10,
    textAlign: "center",
  },
  modalBackdrop: {
    ...surfaces.backdrop,
  },
  modalCard: {
    ...surfaces.dialog,
    ...surfaces.card,
    alignSelf: "center",
  },
  modalTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "600",
    marginBottom: 14,
    textAlign: "center",
  },
  modalInput: {
    ...surfaces.input,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  modalCancel: {
    alignItems: "center",
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  modalCancelText: {
    color: colors.secondary,
    fontWeight: "700",
  },
  modalEnable: {
    ...surfaces.button,
    flex: 1,
  },
  modalEnableText: {
    color: "#fff",
    fontWeight: "600",
  },
  button: {
    alignItems: "center",
    borderColor: colors.danger,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    minHeight: 50,
    justifyContent: "center",
  },
  buttonText: {
    color: colors.danger,
    fontWeight: "600",
  },
});

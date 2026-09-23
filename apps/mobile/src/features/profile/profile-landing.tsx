import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import { useAuth } from "../auth/auth-provider";
import { useAccountSetup } from "../onboarding/provider";
import { getProfileName } from "./repository";
import { getDailyGoals, type DailyGoals } from "../goals/repository";
import { cachedVitals } from "../vitals/storage";
import { latestSample, type VitalSample } from "../../domain/vitals";
import {
  healthKitAvailability,
  loadHealthKitSyncState,
} from "../healthkit/sync";
import { loadPendingData, syncLabel, type PendingData } from "./sync-status";
import {
  goalKinds,
  goalDisplay,
  goalLabels,
  type GoalKind,
} from "./goal-display";
import { AppearanceSheet, UnitsSheet } from "./preference-sheets";
import {
  SettingsGroup,
  SettingsRow,
  ErrorMessage,
  SettingsButton,
  styles,
} from "./settings-ui";
import { ScreenScrollView } from "../../ui/screen-scroll-view";
import { Pressable } from "../../ui/pressable";
import { Icon, type IconName } from "../../ui/icon";
import { colors } from "../../ui/profile-theme";
import { useAppAppearance } from "../../ui/appearance";
const icons: Record<GoalKind, IconName> = {
  calories: "food",
  protein: "protein",
  fluids: "water",
  weight: "weight",
  "blood-pressure": "heart",
};
export function ProfileLanding() {
  const {
    session,
    faceIdAvailability,
    faceIdEnabled,
    refreshFaceIdAvailability,
    signOut,
  } = useAuth();
  const { setup } = useAccountSetup();
  const { preference } = useAppAppearance();
  const user = session!.user;
  const [name, setName] = useState<string>(),
    [goals, setGoals] = useState<DailyGoals>(),
    [weight, setWeight] = useState<VitalSample>(),
    [pending, setPending] = useState<PendingData>(),
    [health, setHealth] = useState("Checking"),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [sheet, setSheet] = useState<"appearance" | "units">(),
    [revision, setRevision] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.allSettled([
        getProfileName(user.id),
        Promise.all([getDailyGoals(user.id), cachedVitals(user.id)]),
        loadPendingData(user.id),
        Promise.all([healthKitAvailability(), loadHealthKitSyncState(user.id)]),
        refreshFaceIdAvailability(),
      ]).then((results) => {
        if (!live) return;
        const messages: string[] = [];
        const [n, g, p, h, f] = results;
        if (n.status === "fulfilled")
          setName(
            [n.value.firstName, n.value.lastName].filter(Boolean).join(" "),
          );
        else messages.push("Personal details could not be loaded.");
        if (g.status === "fulfilled") {
          setGoals(g.value[0]);
          setWeight(latestSample(g.value[1], "weight"));
        } else
          messages.push("Goals could not be loaded. Retry when connected.");
        if (p.status === "fulfilled") setPending(p.value);
        else messages.push("Sync status is unavailable.");
        if (h.status === "fulfilled")
          setHealth(
            h.value[1].connected
              ? "Connected"
              : h.value[0].available
                ? "Not connected"
                : "Unavailable",
          );
        else {
          setHealth("Unavailable");
          messages.push("Apple Health status could not be loaded.");
        }
        if (f.status === "rejected")
          messages.push("Face ID availability could not be checked.");
        setErrors(messages);
      });
      const timer = setInterval(() => {
        void loadPendingData(user.id)
          .then((data) => {
            if (live) {
              setPending(data);
              setWeight(latestSample(data.readings, "weight"));
            }
          })
          .catch(() => undefined);
      }, 3000);
      return () => {
        live = false;
        clearInterval(timer);
      };
    }, [user.id, refreshFaceIdAvailability, revision]),
  );
  const displayName =
    setup?.preferred_name ||
    name ||
    [user.user_metadata.first_name, user.user_metadata.last_name]
      .filter(Boolean)
      .join(" ") ||
    "Your profile";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <ScreenScrollView
      testID="profile-landing"
      contentContainerStyle={styles.page}
    >
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: 32,
          fontWeight: "700",
          marginBottom: 18,
        }}
      >
        Profile
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Personal Details, ${displayName}`}
        onPress={() => router.push("/profile/personal")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 16,
          marginBottom: 28,
          minHeight: 84,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.blueSoft,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 19, fontWeight: "600", color: colors.blue }}>
            {initials}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 21, fontWeight: "600" }}>
            {displayName}
          </Text>
          <Text style={styles.caption}>Personal Details</Text>
        </View>
        <Icon name="chevron" size={18} color={colors.tertiary} />
      </Pressable>
      {errors.length ? (
        <>
          <ErrorMessage message={errors.join(" ")} />
          <SettingsButton
            label="Retry Profile"
            secondary
            onPress={() => setRevision((n) => n + 1)}
          />
        </>
      ) : null}
      <SettingsGroup title="My Goals">
        {goalKinds.map((kind, index) => (
          <SettingsRow
            key={kind}
            icon={icons[kind]}
            label={goalLabels[kind]}
            value={
              goals
                ? goalDisplay(
                    kind,
                    goals,
                    setup?.unit_system ?? "us",
                    setup?.fluid_unit ?? "fl_oz",
                    weight,
                  )
                : errors.length
                  ? "Unavailable"
                  : "Loading"
            }
            onPress={() =>
              router.push({
                pathname: "/profile/goal/[kind]",
                params: { kind },
              })
            }
            last={index === goalKinds.length - 1}
          />
        ))}
      </SettingsGroup>
      <SettingsGroup title="Preferences">
        <SettingsRow
          icon="sun"
          label="Appearance"
          value={
            preference === "system"
              ? "System"
              : preference === "light"
                ? "Light"
                : "Dark"
          }
          onPress={() => setSheet("appearance")}
        />
        <SettingsRow
          icon="ruler"
          label="Units"
          value={`${setup?.unit_system === "metric" ? "kg, cm" : "lb, ft/in"} · ${setup?.fluid_unit === "ml" ? "mL" : "fl oz"}`}
          onPress={() => setSheet("units")}
          last
        />
      </SettingsGroup>
      <SettingsGroup title="Health Data">
        <SettingsRow
          icon="heart"
          label="Apple Health"
          value={health}
          onPress={() => router.push("/profile/health")}
        />
        <SettingsRow
          icon="sync"
          label="Sync & Pending Changes"
          value={syncLabel(pending)}
          attention={pending?.attention}
          onPress={() => router.push("/profile/sync")}
        />
        <SettingsRow
          icon="export"
          label="Export Data"
          onPress={() => router.push("/profile/export")}
          last
        />
      </SettingsGroup>
      <SettingsGroup title="Account & Security">
        <SettingsRow
          icon="mail"
          label="Sign-in & Contact Info"
          value={
            user.email_confirmed_at || user.phone_confirmed_at
              ? "Verified"
              : "Unverified"
          }
          onPress={() => router.push("/profile/contacts")}
        />
        <SettingsRow
          icon="face-id"
          label="Face ID"
          value={
            faceIdEnabled
              ? "On"
              : faceIdAvailability.available
                ? "Off"
                : "Unavailable"
          }
          onPress={() => router.push("/profile/face-id")}
        />
        <SettingsRow
          icon="device"
          label="Enrolled Devices"
          onPress={() => router.push("/profile/devices")}
          last
        />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow
          icon="sign-out"
          label="Sign Out"
          destructive
          disabled={busy}
          loading={busy}
          onPress={() => {
            setBusy(true);
            setActionError("");
            void signOut()
              .then(() => router.replace("/(auth)/sign-in"))
              .catch((e) =>
                setActionError(
                  e instanceof Error ? e.message : "Could not sign out.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        />
        <SettingsRow
          icon="settings"
          label="Manage Account"
          onPress={() => router.push("/profile/manage")}
          last
        />
      </SettingsGroup>
      <ErrorMessage message={actionError} />
      {Constants.expoConfig?.version ? (
        <Text
          style={[styles.caption, { textAlign: "center", marginBottom: 14 }]}
        >
          HealthApp {Constants.expoConfig.version}
        </Text>
      ) : null}
      {sheet === "appearance" ? (
        <AppearanceSheet onClose={() => setSheet(undefined)} />
      ) : sheet === "units" ? (
        <UnitsSheet onClose={() => setSheet(undefined)} />
      ) : null}
    </ScreenScrollView>
  );
}

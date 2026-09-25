import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { useAuth } from "../auth/auth-provider";
import { assertAccount } from "../../lib/mutations";
import { supabase } from "../../lib/supabase";
import { resetMountedDrafts } from "./draft-reset";
import { loadRoutines } from "../reminders/routine-storage";
import { saveRoutinePreferences } from "../reminders/service";
import type { RoutinePreferences } from "../reminders/routine-model";
import { clearWorkoutDraft } from "../training/workout-draft";
import { clearCardioDraft } from "../training/cardio-draft";
import { clearNutritionDraft } from "../nutrition/draft";
import { storeHelperDraft } from "../goals/helper-draft";
import { SettingsSheet } from "../../ui/settings-sheet";
import {
  DetailScreen,
  SettingsGroup,
  SettingsRow,
  SettingsButton,
  ErrorMessage,
  styles,
} from "../profile/settings-ui";

export function PrivacyControls() {
  const { session } = useAuth();
  const user = session!.user.id;
  const [prefs, setPrefs] = useState<RoutinePreferences>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"drafts" | "ai">();
  useEffect(() => {
    let live = true;
    void loadRoutines(user)
      .then((p) => {
        if (live) setPrefs(p);
      })
      .catch(() => {
        if (live)
          setError(
            "Could not load notification privacy settings. Reopen this screen to retry.",
          );
      });
    return () => {
      live = false;
    };
  }, [user]);
  async function clear() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await assertAccount(user);
      if (confirm === "ai") {
        const { error: failure } = await supabase.rpc("clear_saved_ai_data");
        if (failure)
          throw Error(
            "Saved AI data could not be deleted. The privacy service may need updating; try again later.",
          );
        await assertAccount(user);
        await AsyncStorage.removeItem("healthapp:workout-preferences:" + user);
      } else {
        resetMountedDrafts(user);
        await Promise.all([
          clearWorkoutDraft(user),
          clearCardioDraft(user),
          clearNutritionDraft(user),
          storeHelperDraft(user, "calories", null),
          storeHelperDraft(user, "fluids", null),
        ]);
      }
      await assertAccount(user);
      setNotice(
        confirm === "ai"
          ? "Saved planner data deleted. Previously saved logs, local workout drafts and provider retention are separate."
          : "Unfinished local drafts cleared. Saved records and pending synchronization changes were kept.",
      );
      setConfirm(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <DetailScreen title="Privacy & Legal">
      <SettingsGroup title="Your information">
        <SettingsRow
          icon="shield"
          label="Privacy & Legal documents"
          onPress={() => router.push("/legal")}
        />
        <SettingsRow
          icon="export"
          label="Export Data"
          onPress={() => router.push("/profile/export")}
        />
        <SettingsRow
          icon="heart"
          label="Apple Health permissions"
          onPress={() => router.push("/profile/health")}
        />
        <SettingsRow
          icon="settings"
          label="Manage Account & Deletion"
          last
          onPress={() => router.push("/profile/manage")}
        />
      </SettingsGroup>
      <SettingsGroup title="On this device">
        <SettingsRow
          icon="bell"
          label="Detailed notification previews"
          description="Off uses generic text. On may show medication names and reminder details on your Lock Screen."
          disabled={!prefs || busy}
          toggle={{
            value: prefs?.detailedPreviews ?? false,
            onChange: (value) => {
              if (!prefs) return;
              setBusy(true);
              setError("");
              const next = { ...prefs, detailedPreviews: value };
              void saveRoutinePreferences(next)
                .then(() => setPrefs(next))
                .catch(() =>
                  setError(
                    "Could not finish updating scheduled previews. Reopen this screen and retry; some existing notifications may still use the old text.",
                  ),
                )
                .finally(() => setBusy(false));
            },
          }}
        />
        <SettingsRow
          icon="delete"
          label="Clear unfinished drafts"
          onPress={() => setConfirm("drafts")}
          last
        />
      </SettingsGroup>
      <SettingsGroup title="Optional AI">
        <SettingsRow
          icon="delete"
          label="Delete saved planner data"
          onPress={() => setConfirm("ai")}
          last
        />
      </SettingsGroup>
      <Text style={styles.copy}>
        Each meal or workout AI request requires a new choice before sending to
        OpenAI. Decline it to stop that request; manual tracking remains
        available. Workout history is optional. Deleting saved planner data
        removes saved preferences and conversations, including older chats; it
        does not recall provider processing, remove AI-derived meals or erase
        saved workouts.
      </Text>
      <Text style={styles.copy}>
        Camera, selected photos and notifications can be managed in iOS
        Settings. Face ID and enrolled devices have their own Profile controls.
        No advertising tracking is implemented.
      </Text>
      <ErrorMessage message={error} />
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {notice}
        </Text>
      ) : null}
      <SettingsSheet
        visible={Boolean(confirm)}
        title={
          confirm === "ai"
            ? "Delete saved planner data?"
            : "Clear unfinished drafts?"
        }
        onClose={() => {
          if (!busy) setConfirm(undefined);
        }}
      >
        <Text style={styles.copy}>
          {confirm === "ai"
            ? "This deletes cloud planner preferences, plans and legacy conversations. Saved health records and local drafts remain. Provider retention and minimal consent/usage records are separate."
            : "This removes unfinished meal, lifting, cardio and goal-helper drafts from this device. Saved records and pending writes are kept. This cannot be undone."}
        </Text>
        <ErrorMessage message={error} />
        <SettingsButton
          destructive
          label={busy ? "Removing..." : "Delete"}
          disabled={busy}
          onPress={() => void clear()}
        />
        <SettingsButton
          secondary
          label="Cancel"
          disabled={busy}
          onPress={() => setConfirm(undefined)}
        />
      </SettingsSheet>
    </DetailScreen>
  );
}

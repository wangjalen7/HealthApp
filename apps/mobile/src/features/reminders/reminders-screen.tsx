import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Text,
  Switch,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, router } from "expo-router";
import { useAuth } from "../auth/auth-provider";
import { ScreenScrollView } from "../../ui/screen-scroll-view";
import {
  SettingsGroup,
  SettingsButton,
  ErrorMessage,
  styles,
} from "../profile/settings-ui";
import { Modal } from "../../ui/modal";
import { SettingsSheet } from "../../ui/settings-sheet";
import { IconButton } from "../../ui/icon-button";
import { Icon } from "../../ui/icon";
import { colors } from "../../ui/profile-theme";
import { listReminders, listReminderCompletions } from "./repository";
import { loadRoutines } from "./routine-storage";
import {
  routineKinds,
  routineLabels,
  routineSummary,
  routineIssues,
  overlappingCustom,
  type RoutinePreferences,
  type RoutineKind,
} from "./routine-model";
import {
  activeReminderTimes,
  createReminderCompletion,
  currentReminderCompletion,
  reminderCompletionTargetTime,
  formatReminderTime,
  reminderTitle,
  repeatSummary,
  type Reminder,
  type ReminderCompletion,
} from "./model";
import {
  notificationPermission,
  saveRoutinePreferences,
  saveCustomConfiguration,
  loadScheduleStatus,
  observeScheduleChanges,
  dismissCompletedReminderNotification,
  type ScheduleStatus,
} from "./service";
import { RoutineRow, ToggleRow } from "./routine-controls";
import { RoutineEditor } from "./routine-editor";
import { CustomEditor, type CustomEditorHandle } from "./custom-editor";

type Overlap = {
  prefs: RoutinePreferences;
  request: boolean;
  groups: ("weight" | "blood_pressure")[];
};
export function RemindersScreen() {
  const { session } = useAuth();
  const user = session!.user.id;
  const { reminder } = useLocalSearchParams<{ reminder?: string }>();
  const [prefs, setPrefs] = useState<RoutinePreferences>(),
    [currentTime, setCurrentTime] = useState(() => new Date()),
    [custom, setCustom] = useState<Reminder[]>([]),
    [completions, setCompletions] = useState<ReminderCompletion[]>([]),
    [status, setStatus] = useState<ScheduleStatus>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState<RoutineKind>(),
    [enableOnOpen, setEnableOnOpen] = useState<RoutineKind>(),
    [editor, setEditor] = useState<Reminder | "new" | "new-medication">(),
    [medicationPanel, setMedicationPanel] = useState(false),
    [overlap, setOverlap] = useState<Overlap>();
  const editorRef = useRef<CustomEditorHandle>(null);
  const load = useCallback(async () => {
    const [p, c, h, s, permission] = await Promise.all([
      loadRoutines(user),
      listReminders(user, true),
      listReminderCompletions(user, true),
      loadScheduleStatus(user),
      notificationPermission(),
    ]);
    setPrefs(p);
    setCustom(c);
    setCompletions(h);
    setStatus({ ...s, permission });
    setLoading(false);
  }, [user]);
  useFocusEffect(
    useCallback(() => {
      void load().catch((e) => {
        setError(String(e));
        setLoading(false);
      });
      // This timer only refreshes completion labels; delivery never uses JS timers.
      const timer = setInterval(() => setCurrentTime(new Date()), 30_000);
      const stop = observeScheduleChanges(() => {
        void load().catch((e) => setError(String(e)));
      });
      return () => {
        clearInterval(timer);
        stop();
      };
    }, [load]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void load().catch((e) => setError(String(e)));
    });
    return () => sub.remove();
  }, [load]);
  useEffect(() => {
    if (loading || !reminder) return;
    const r = custom.find((r) => r.id === reminder);
    if (r) setEditor(r);
    else setError("That custom reminder is no longer available.");
    router.setParams({ reminder: "" });
  }, [loading, reminder, custom]);
  async function store(p: RoutinePreferences, request = false) {
    setBusy(true);
    setError("");
    try {
      await saveRoutinePreferences(p, request);
      setMode(undefined);
      setOverlap(undefined);
      await load();
    } catch (e) {
      await load();
      setError(e instanceof Error ? e.message : "Could not update reminders.");
      setMode(undefined);
      setOverlap(undefined);
    } finally {
      setBusy(false);
    }
  }
  async function propose(p: RoutinePreferences, request = false) {
    if (routineIssues(p).length) {
      setError("Review the selected days and times before enabling.");
      return;
    }
    const existing = overlappingCustom(p, custom).filter(
      (r) => !p.keepBoth.includes(r.id) && !p.replacements.includes(r.id),
    );
    if (existing.length) {
      setMode(undefined);
      setOverlap({
        prefs: p,
        request,
        groups: [
          ...new Set(
            existing.map((r) => r.kind as "weight" | "blood_pressure"),
          ),
        ],
      });
      return;
    }
    await store(p, request);
  }
  async function chooseOverlap(choice: "custom" | "replace" | "both") {
    if (!overlap) return;
    const kind = overlap.groups[0],
      matches = overlappingCustom(overlap.prefs, custom)
        .filter((r) => r.kind === kind)
        .map((r) => r.id);
    const p = { ...overlap.prefs };
    if (choice === "custom")
      p.categories = {
        ...p.categories,
        [kind]: { ...p.categories[kind], enabled: false },
      };
    if (choice === "replace")
      p.replacements = [...new Set([...p.replacements, ...matches])];
    if (choice === "both")
      p.keepBoth = [...new Set([...p.keepBoth, ...matches])];
    if (overlap.groups.length > 1)
      setOverlap({ ...overlap, prefs: p, groups: overlap.groups.slice(1) });
    else await store(p, overlap.request);
  }
  async function saveCustom(r: Reminder) {
    try {
      const next = custom.some((c) => c.id === r.id)
        ? custom.map((c) => (c.id === r.id ? r : c))
        : [...custom, r];
      await saveCustomConfiguration(user, next, completions, true);
      setEditor(undefined);
      await load();
    } catch (e) {
      await load();
      throw e;
    }
  }
  async function remove(r: Reminder) {
    try {
      await saveCustomConfiguration(
        user,
        custom.filter((c) => c.id !== r.id),
        completions.filter((c) => c.reminderId !== r.id),
      );
      setEditor(undefined);
      await load();
    } catch (e) {
      await load();
      throw e;
    }
  }
  async function complete(r: Reminder) {
    setBusy(true);
    setError("");
    const old = currentReminderCompletion(r, completions),
      added = old ? undefined : createReminderCompletion(r);
    const next = old
      ? completions.filter((c) => c !== old)
      : [...completions, added!];
    try {
      await saveCustomConfiguration(user, custom, next);
      if (added) await dismissCompletedReminderNotification(r, added);
      await load();
    } catch (e) {
      await load();
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const isMedication = (r: Reminder) =>
    r.kind === "medication" || r.kind === "supplement";
  const medications = custom.filter(isMedication);
  const renderReminder = (r: Reminder) => (
    <View
      key={r.id}
      style={{
        padding: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: "#88888844",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Icon
          name={
            r.kind === "blood_pressure"
              ? "heart"
              : r.kind === "weight"
                ? "weight"
                : "bell"
          }
          color={
            r.kind === "blood_pressure"
              ? colors.pink
              : r.kind === "weight"
                ? colors.purple
                : colors.blue
          }
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{reminderTitle(r)}</Text>
          <Text style={styles.caption}>{repeatSummary(r)}</Text>
          <Text style={styles.caption}>
            {r.enabled ? "Enabled" : "Off"}
            {currentReminderCompletion(r, completions, currentTime)
              ? ` · ${activeReminderTimes(r).length > 1 ? formatReminderTime(reminderCompletionTargetTime(r, currentTime) ?? r.time) : "Today"} completed`
              : ""}
          </Text>
        </View>
        <Switch
          style={{ alignSelf: "center" }}
          accessibilityLabel={reminderTitle(r) + " enabled"}
          value={r.enabled}
          disabled={busy}
          onValueChange={(enabled) => {
            setBusy(true);
            void saveCustom({
              ...r,
              enabled,
              updatedAt: new Date().toISOString(),
            })
              .catch((e) => setError(String(e)))
              .finally(() => setBusy(false));
          }}
        />
        <IconButton
          name="edit"
          label={`Edit ${reminderTitle(r)} reminder`}
          onPress={() => setEditor(r)}
        />
      </View>
      <SettingsButton
        label={`${currentReminderCompletion(r, completions, currentTime) ? "Mark incomplete" : "Mark complete"}: ${reminderTitle(r)}`}
        secondary
        disabled={busy}
        onPress={() => void complete(r)}
      />
    </View>
  );
  return (
    <ScreenScrollView contentContainerStyle={styles.page}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { fontSize: 32, marginBottom: 24 }]}
      >
        Reminders
      </Text>
      {Platform.OS === "web" ? (
        <Text style={styles.copy}>Set reminders on your iPhone</Text>
      ) : null}
      <ErrorMessage message={error} />
      {loading ? (
        <ActivityIndicator />
      ) : !prefs ? (
        <SettingsButton
          label="Retry reminders"
          onPress={() => void load().catch((e) => setError(String(e)))}
        />
      ) : (
        <>
          <SettingsGroup>
            {routineKinds.map((kind) => (
              <RoutineRow
                key={kind}
                kind={kind}
                summary={routineSummary(prefs.categories[kind])}
                enabled={prefs.categories[kind].enabled}
                disabled={busy}
                onOpen={() => {
                  setEnableOnOpen(undefined);
                  setMode(kind);
                }}
                onToggle={(enabled) => {
                  const next = {
                    ...prefs,
                    categories: {
                      ...prefs.categories,
                      [kind]: { ...prefs.categories[kind], enabled },
                    },
                  };
                  if (enabled && routineIssues(next).length) {
                    setEnableOnOpen(kind);
                    setMode(kind);
                    return;
                  }
                  void propose(next, enabled);
                }}
              />
            ))}
            <RoutineRow
              kind="medication"
              summary={
                medications.length
                  ? medications.length + " reminders"
                  : "Add reminders"
              }
              enabled={prefs.medicationEnabled && medications.length > 0}
              disabled={busy}
              onOpen={() => setMedicationPanel(true)}
              onToggle={(enabled) => {
                void store({ ...prefs, medicationEnabled: enabled }, enabled);
                if (enabled && !medications.length) setMedicationPanel(true);
              }}
            />
          </SettingsGroup>
          {status?.permission === "blocked" ? (
            <>
              <Text style={styles.copy}>
                Notifications are blocked. Your settings are saved.
              </Text>
              <SettingsButton
                label="Open Settings"
                secondary
                onPress={() =>
                  void Linking.openSettings().catch((e) => setError(String(e)))
                }
              />
            </>
          ) : null}
          {status?.permission === "unavailable" ? (
            <Text style={styles.copy}>
              This preview can save settings, but it does not schedule
              notifications.
            </Text>
          ) : null}
          <ErrorMessage message={status?.error} />
          <SettingsGroup title="Custom Reminders">
            {custom.filter((r) => !isMedication(r)).map(renderReminder)}
            <SettingsButton
              label="Add Custom Reminder"
              style={{ marginBottom: 0 }}
              secondary
              onPress={() => setEditor("new")}
            />
          </SettingsGroup>
          {mode ? (
            <RoutineEditor
              key={mode}
              initial={prefs}
              mode={mode}
              enableOnOpen={enableOnOpen === mode}
              onClose={() => setMode(undefined)}
              onSave={propose}
            />
          ) : null}
          {medicationPanel || editor ? (
            <Modal
              visible
              presentationStyle="fullScreen"
              animationType="fade"
              onRequestClose={() => {
                if (editor) editorRef.current?.close();
                else setMedicationPanel(false);
              }}
            >
              {editor ? (
                <CustomEditor
                  ref={editorRef}
                  embedded
                  user={user}
                  initial={typeof editor === "string" ? undefined : editor}
                  medication={
                    editor === "new-medication" ||
                    (typeof editor !== "string" && isMedication(editor))
                  }
                  onClose={() => setEditor(undefined)}
                  onSave={saveCustom}
                  onDelete={remove}
                />
              ) : (
                <SettingsSheet
                  embedded
                  fullScreen
                  title="Medication / Supplements"
                  onClose={() => setMedicationPanel(false)}
                >
                  <ToggleRow
                    label="Enable Medication / Supplements"
                    value={prefs.medicationEnabled}
                    disabled={busy}
                    onChange={(medicationEnabled) =>
                      void store(
                        { ...prefs, medicationEnabled },
                        medicationEnabled,
                      )
                    }
                  />
                  <ErrorMessage message={error || status?.error} />
                  {medications.map(renderReminder)}
                  <SettingsButton
                    label="Add Medication / Supplement"
                    onPress={() => setEditor("new-medication")}
                    disabled={busy}
                  />
                </SettingsSheet>
              )}
            </Modal>
          ) : null}
          {overlap ? (
            <SettingsSheet
              fullScreen
              title="Overlapping reminders"
              onClose={() => {
                if (!busy) setOverlap(undefined);
              }}
            >
              <Text style={styles.copy}>
                {routineLabels[overlap.groups[0]]} overlaps an enabled custom
                reminder. Choose which schedule to keep. Its completion history
                will be preserved.
              </Text>
              <SettingsButton
                label="Keep the custom reminder"
                disabled={busy}
                onPress={() => void chooseOverlap("custom")}
              />
              <SettingsButton
                label="Replace it with the routine"
                disabled={busy}
                onPress={() => void chooseOverlap("replace")}
              />
              <SettingsButton
                label="Keep both"
                secondary
                disabled={busy}
                onPress={() => void chooseOverlap("both")}
              />
            </SettingsSheet>
          ) : null}
        </>
      )}
    </ScreenScrollView>
  );
}

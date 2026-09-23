import { useImperativeHandle, useState, type Ref } from "react";
import { Keyboard, StyleSheet, Text, View } from "react-native";
import { ConfirmationActions } from "../../ui/confirmation-actions";
import { colors } from "../../ui/profile-theme";
import { SettingsSheet } from "../../ui/settings-sheet";
import {
  FormField,
  SettingsButton,
  ErrorMessage,
  styles,
} from "../profile/settings-ui";
import { Choices } from "../goals/helper-components";
import {
  createReminder,
  localDay,
  dateFromLocalDay,
  reminderRepeats,
  type Reminder,
} from "./model";
import { TimeField, ReminderDateField } from "./time-field";
import { Days, ToggleRow } from "./routine-controls";
export type CustomEditorHandle = { close: () => void };
export function CustomEditor({
  user,
  initial,
  onClose,
  onSave,
  onDelete,
  medication = false,
  embedded = false,
  ref,
}: {
  user: string;
  initial?: Reminder;
  onClose: () => void;
  onSave: (r: Reminder) => Promise<void>;
  onDelete: (r: Reminder) => Promise<void>;
  medication?: boolean;
  embedded?: boolean;
  ref?: Ref<CustomEditorHandle>;
}) {
  const [baseline] = useState(
    () =>
      initial ??
      createReminder({
        userId: user,
        kind: medication ? "medication" : "custom",
        name: "",
        time: "09:00",
        additionalTimes: [],
        repeat: "daily",
        startDate: localDay(),
        weekdays: [1, 2, 3, 4, 5],
      }),
  );
  const [draft, setDraft] = useState(baseline),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [intervalText, setIntervalText] = useState(
    String(baseline.intervalDays),
  );
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(baseline) ||
    (draft.repeat === "interval" &&
      intervalText !== String(baseline.intervalDays));
  const close = () => {
    if (busy) return;
    if (deleting) {
      setDeleting(false);
      return;
    }
    if (dirty) setDiscard(true);
    else onClose();
  };
  useImperativeHandle(ref, () => ({ close }));
  async function save() {
    if (
      !draft.name?.trim() &&
      !["weight", "blood_pressure"].includes(draft.kind)
    ) {
      setError("Enter a name for this reminder.");
      return;
    }
    if (
      draft.enabled &&
      ["weekly", "weekdays"].includes(draft.repeat) &&
      !draft.weekdays.length
    ) {
      setError("Choose at least one day.");
      return;
    }
    if (
      draft.enabled &&
      draft.repeat === "once" &&
      dateFromLocalDay(draft.startDate, draft.time) <= new Date()
    ) {
      setError("Choose a future date and time.");
      return;
    }
    if (
      draft.repeat === "interval" &&
      (!/^\d+$/.test(intervalText) ||
        Number(intervalText) < 2 ||
        Number(intervalText) > 365)
    ) {
      setError("Choose a whole number from 2 to 365 days.");
      return;
    }
    const times = [...new Set([draft.time, ...draft.additionalTimes])];
    if (
      draft.repeat !== "once" &&
      (times.length !== draft.additionalTimes.length + 1 ||
        (draft.repeat === "multiple_daily" && times.length < 2))
    ) {
      setError("Choose different times for each reminder.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...draft,
        additionalTimes: draft.repeat === "once" ? [] : draft.additionalTimes,
        intervalDays:
          draft.repeat === "interval"
            ? Number(intervalText)
            : draft.intervalDays,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save reminder.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsSheet
      embedded={embedded}
      fullScreen
      title={
        medication
          ? initial
            ? "Edit Medication / Supplement"
            : "New Medication / Supplement"
          : initial
            ? "Edit Custom Reminder"
            : "New Custom Reminder"
      }
      onClose={close}
      overlay={
        deleting ? (
          <View style={deleteStyles.backdrop}>
            <View
              testID="reminder-delete-confirmation"
              accessibilityViewIsModal
              style={deleteStyles.card}
            >
              <Text accessibilityRole="header" style={deleteStyles.title}>
                Delete reminder?
              </Text>
              <Text style={deleteStyles.copy}>
                Delete this reminder and its completion history?
              </Text>
              <ErrorMessage message={error} />
              <ConfirmationActions
                busy={busy}
                onCancel={() => setDeleting(false)}
                confirmAccessibilityLabel="Confirm delete reminder"
                onConfirm={() => {
                  setBusy(true);
                  setError("");
                  void onDelete(draft)
                    .catch((e) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not delete reminder.",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              />
            </View>
          </View>
        ) : null
      }
    >
      {discard ? (
        <>
          <Text style={styles.copy}>
            Discard your unsaved reminder changes?
          </Text>
          <SettingsButton
            label="Keep editing"
            onPress={() => setDiscard(false)}
          />
          <SettingsButton
            label="Discard changes"
            destructive
            onPress={onClose}
          />
        </>
      ) : (
        <>
          {medication ? (
            <Choices
              value={draft.kind as "medication" | "supplement"}
              items={[
                { value: "medication", label: "Medication" },
                { value: "supplement", label: "Supplement" },
              ]}
              onChange={(kind) => setDraft({ ...draft, kind })}
              disabled={busy}
            />
          ) : null}
          <FormField
            label="Reminder name"
            value={draft.name ?? ""}
            onChange={(name) => setDraft({ ...draft, name })}
            disabled={busy}
          />
          <ToggleRow
            label="Reminder enabled"
            value={draft.enabled}
            onChange={(enabled) => setDraft({ ...draft, enabled })}
            disabled={busy}
          />
          <Choices
            value={draft.repeat}
            items={reminderRepeats
              .filter(
                (r) =>
                  r !== "multiple_daily" || draft.repeat === "multiple_daily",
              )
              .map((r) => ({
                value: r,
                label: {
                  once: "Once",
                  daily: "Daily",
                  multiple_daily: "Multiple daily",
                  weekdays: "Selected days",
                  weekly: "Weekly",
                  interval: "Every few days",
                }[r],
              }))}
            disabled={busy}
            onChange={(repeat) =>
              setDraft({
                ...draft,
                repeat,
                weekdays:
                  repeat === "weekly"
                    ? [draft.weekdays[0] ?? 1]
                    : draft.weekdays,
              })
            }
          />
          {["weekdays", "weekly"].includes(draft.repeat) ? (
            <Days
              value={draft.weekdays}
              onChange={(weekdays) =>
                setDraft({
                  ...draft,
                  weekdays:
                    draft.repeat === "weekly"
                      ? [
                          weekdays.find((d) => !draft.weekdays.includes(d)) ??
                            weekdays[0] ??
                            1,
                        ]
                      : weekdays,
                })
              }
              disabled={busy}
            />
          ) : null}
          {draft.repeat === "interval" ? (
            <FormField
              label="Repeat every (days)"
              value={intervalText}
              onChange={setIntervalText}
              number
              disabled={busy}
            />
          ) : null}
          {draft.repeat === "once" || draft.repeat === "interval" ? (
            <ReminderDateField
              value={draft.startDate}
              onChange={(startDate) => setDraft({ ...draft, startDate })}
            />
          ) : null}
          <TimeField
            label="Reminder time"
            value={draft.time}
            onChange={(time) => setDraft({ ...draft, time })}
            disabled={busy}
          />
          {draft.repeat !== "once" ? (
            <>
              {draft.additionalTimes.map((time, i) => (
                <TimeField
                  key={i}
                  label={`Additional time ${i + 1}`}
                  value={time}
                  onChange={(value) =>
                    setDraft({
                      ...draft,
                      additionalTimes: draft.additionalTimes.map((t, j) =>
                        j === i ? value : t,
                      ),
                    })
                  }
                  disabled={busy}
                />
              ))}
              {draft.additionalTimes.length ? (
                <SettingsButton
                  label="Remove last time"
                  secondary
                  disabled={busy}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      additionalTimes: draft.additionalTimes.slice(0, -1),
                    })
                  }
                />
              ) : null}
              <SettingsButton
                label="Add another time"
                secondary
                disabled={busy || draft.additionalTimes.length >= 5}
                onPress={() =>
                  setDraft({
                    ...draft,
                    additionalTimes: [...draft.additionalTimes, "12:00"],
                  })
                }
              />
            </>
          ) : null}
          {draft.repeat === "interval" ? (
            <Text style={styles.copy}>
              Open HealthApp regularly to refresh every-few-days reminders.
            </Text>
          ) : null}
          <ErrorMessage message={error} />
          <SettingsButton
            label={busy ? "Saving..." : "Save reminder"}
            disabled={busy}
            onPress={() => void save()}
          />
          {initial ? (
            <SettingsButton
              label="Delete reminder"
              destructive
              disabled={busy}
              onPress={() => {
                Keyboard.dismiss();
                setError("");
                setDeleting(true);
              }}
            />
          ) : null}
          <SettingsButton
            label="Cancel"
            secondary
            disabled={busy}
            onPress={close}
          />
        </>
      )}
    </SettingsSheet>
  );
}

const deleteStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(16, 42, 67, 0.52)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    maxWidth: 420,
    padding: 20,
    width: "100%",
  },
  title: { color: colors.text, fontSize: 19, fontWeight: "600" },
  copy: { color: colors.secondary, lineHeight: 20, marginTop: 8 },
});

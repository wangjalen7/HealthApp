import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
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
  createReminder,
  dateFromLocalDay,
  localDay,
  reminderIsComplete,
  reminderKindLabel,
  reminderKinds,
  reminderTitle,
  reminderRepeats,
  reminderTimes,
  repeatSummary,
  timeFromDate,
  type Reminder,
  type ReminderKind,
  type ReminderRepeat,
  weekdayLabels,
} from "../../src/features/reminders/model";
import {
  cancelReminderNotifications,
  scheduleReminderNotifications,
} from "../../src/features/reminders/notifications";
import {
  listReminderCompletions,
  listReminders,
  saveReminderCompletions,
  saveReminders,
} from "../../src/features/reminders/repository";

type ReminderDraft = Pick<
  Reminder,
  | "kind"
  | "name"
  | "time"
  | "additionalTimes"
  | "repeat"
  | "startDate"
  | "weekdays"
>;

function blankDraft(): ReminderDraft {
  return {
    kind: "medication",
    name: "",
    time: "09:00",
    additionalTimes: [],
    repeat: "daily",
    startDate: localDay(),
    weekdays: [1, 2, 3, 4, 5],
  };
}

function draftFromReminder(reminder: Reminder): ReminderDraft {
  const { kind, name, time, additionalTimes, repeat, startDate, weekdays } =
    reminder;
  return {
    kind,
    name: name ?? "",
    time,
    additionalTimes,
    repeat,
    startDate,
    weekdays,
  };
}

function kindNeedsName(kind: ReminderKind) {
  return kind === "medication" || kind === "supplement" || kind === "custom";
}

export default function RemindersScreen() {
  const { session } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [completions, setCompletions] = useState<
    { reminderId: string; localDay: string; completedAt: string }[]
  >([]);
  const [editing, setEditing] = useState<Reminder>();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ReminderDraft>(blankDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) {
      setReminders([]);
      setCompletions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [nextReminders, nextCompletions] = await Promise.all([
      listReminders(userId),
      listReminderCompletions(userId),
    ]);
    setReminders(nextReminders);
    setCompletions(nextCompletions);
    setLoading(false);
  }, [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const selectedDate = useMemo(
    () => dateFromLocalDay(draft.startDate, draft.time),
    [draft.startDate, draft.time],
  );

  function openNew() {
    setEditing(undefined);
    setAdding(true);
    setDraft(blankDraft());
    setError("");
    setMessage("");
  }
  function openEdit(reminder: Reminder) {
    setEditing(reminder);
    setAdding(false);
    setDraft(draftFromReminder(reminder));
    setError("");
    setMessage("");
  }
  function closeEditor() {
    setEditing(undefined);
    setAdding(false);
    setError("");
  }
  function updateDraft(change: Partial<ReminderDraft>) {
    setDraft((current) => ({ ...current, ...change }));
    setError("");
    setMessage("");
  }
  function setRepeat(repeat: ReminderRepeat) {
    const today = new Date().getDay();
    updateDraft({
      repeat,
      weekdays:
        repeat === "weekly"
          ? [draft.weekdays[0] ?? today]
          : repeat === "weekdays" && !draft.weekdays.length
            ? [1, 2, 3, 4, 5]
            : draft.weekdays,
    });
  }
  function toggleDay(day: number) {
    if (draft.repeat === "weekly") {
      updateDraft({ weekdays: [day] });
      return;
    }
    const weekdays = draft.weekdays.includes(day)
      ? draft.weekdays.filter((value) => value !== day)
      : [...draft.weekdays, day].sort((left, right) => left - right);
    updateDraft({ weekdays });
  }
  function addAnotherTime() {
    if (draft.additionalTimes.length >= 5) return;
    const next = dateFromLocalDay(draft.startDate, draft.time);
    next.setHours(next.getHours() + draft.additionalTimes.length + 1);
    updateDraft({
      additionalTimes: [...draft.additionalTimes, timeFromDate(next)],
    });
  }
  function updateAdditionalTime(index: number, date: Date) {
    updateDraft({
      additionalTimes: draft.additionalTimes.map((time, timeIndex) =>
        timeIndex === index ? timeFromDate(date) : time,
      ),
    });
  }

  async function save() {
    const userId = session?.user.id;
    if (!userId || saving) return;
    const name = draft.name?.trim() ?? "";
    if (kindNeedsName(draft.kind) && !name) {
      setError("Enter a name for this reminder.");
      return;
    }
    if (draft.repeat === "multiple_daily" && reminderTimes(draft).length < 2) {
      setError("Add at least two times for a multiple-daily reminder.");
      return;
    }
    if (
      (draft.repeat === "weekdays" || draft.repeat === "weekly") &&
      !draft.weekdays.length
    ) {
      setError("Choose at least one day.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const normalizedDraft = {
        ...draft,
        name: name || undefined,
        weekdays:
          draft.repeat === "weekly" ? [draft.weekdays[0]] : draft.weekdays,
      };
      const base = editing
        ? {
            ...editing,
            ...normalizedDraft,
            updatedAt: new Date().toISOString(),
            notificationIds: [],
          }
        : createReminder({ userId, ...normalizedDraft });
      const notificationIds = await scheduleReminderNotifications(base);
      const saved: Reminder = { ...base, notificationIds };
      const next = editing
        ? reminders.map((reminder) =>
            reminder.id === editing.id ? saved : reminder,
          )
        : [...reminders, saved];
      await saveReminders(userId, next);
      if (editing?.notificationIds.length)
        await cancelReminderNotifications(editing.notificationIds);
      setReminders(
        next.sort((left, right) => left.time.localeCompare(right.time)),
      );
      setEditing(undefined);
      setAdding(false);
      setMessage("Reminder saved.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save reminder.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(reminder: Reminder) {
    const userId = session?.user.id;
    if (!userId || saving) return;
    setSaving(true);
    try {
      await cancelReminderNotifications(reminder.notificationIds);
      const next = reminders.filter((item) => item.id !== reminder.id);
      const nextCompletions = completions.filter(
        (completion) => completion.reminderId !== reminder.id,
      );
      await Promise.all([
        saveReminders(userId, next),
        saveReminderCompletions(userId, nextCompletions),
      ]);
      setReminders(next);
      setCompletions(nextCompletions);
      setEditing(undefined);
      setAdding(false);
      setMessage("Reminder deleted.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete reminder.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleCompleted(reminder: Reminder) {
    const userId = session?.user.id;
    if (!userId || saving) return;
    const completed = reminderIsComplete(reminder.id, completions);
    const next = completed
      ? completions.filter(
          (completion) =>
            !(
              completion.reminderId === reminder.id &&
              completion.localDay === localDay()
            ),
        )
      : [
          ...completions,
          {
            reminderId: reminder.id,
            localDay: localDay(),
            completedAt: new Date().toISOString(),
          },
        ];
    setCompletions(next);
    try {
      await saveReminderCompletions(userId, next);
    } catch {
      setCompletions(completions);
      setError("Could not update today's completion.");
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Reminders</Text>
        <Pressable
          accessibilityLabel="Add reminder"
          accessibilityRole="button"
          onPress={openNew}
          style={styles.addButton}
        >
          <SymbolView
            fallback={<Text style={styles.addFallback}>+</Text>}
            name="plus"
            size={18}
            tintColor="#FFFFFF"
            weight="bold"
          />
        </Pressable>
      </View>
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error && !editing ? <Text style={styles.error}>{error}</Text> : null}

      {editing || adding || (!reminders.length && !loading) ? (
        <View style={styles.editor}>
          <View style={styles.editorHeader}>
            <Text style={styles.section}>
              {editing ? "Edit reminder" : "New reminder"}
            </Text>
            {editing ? (
              <Pressable
                accessibilityLabel="Close reminder editor"
                accessibilityRole="button"
                onPress={closeEditor}
                style={styles.textButton}
              >
                <Text style={styles.textButtonText}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.label}>Reminder</Text>
          <View style={styles.chips}>
            {reminderKinds.map((kind) => (
              <Chip
                key={kind}
                label={reminderKindLabel(kind)}
                selected={draft.kind === kind}
                onPress={() => updateDraft({ kind })}
              />
            ))}
          </View>
          {kindNeedsName(draft.kind) ? (
            <>
              <Text style={styles.label}>Name</Text>
              <TextInput
                autoCapitalize="words"
                maxLength={80}
                onChangeText={(name) => updateDraft({ name })}
                placeholder={
                  draft.kind === "medication"
                    ? "Medication name"
                    : draft.kind === "supplement"
                      ? "Supplement name"
                      : "Reminder name"
                }
                placeholderTextColor="#9FB3C8"
                style={styles.input}
                value={draft.name}
              />
            </>
          ) : null}
          <Text style={styles.label}>Repeat</Text>
          <View style={styles.chips}>
            {reminderRepeats.map((repeat) => (
              <Chip
                key={repeat}
                label={
                  repeat === "once"
                    ? "Once"
                    : repeat === "daily"
                      ? "Daily"
                      : repeat === "multiple_daily"
                        ? "Multiple daily"
                        : repeat === "weekdays"
                          ? "Weekdays"
                          : "Weekly"
                }
                selected={draft.repeat === repeat}
                onPress={() => setRepeat(repeat)}
              />
            ))}
          </View>
          {!(["daily", "multiple_daily", "once"] as ReminderRepeat[]).includes(
            draft.repeat,
          ) ? (
            <>
              <Text style={styles.label}>
                {draft.repeat === "weekly" ? "Day" : "Days"}
              </Text>
              <View style={styles.days}>
                {weekdayLabels.map((label, day) => (
                  <Pressable
                    accessibilityLabel={`${label} ${draft.weekdays.includes(day) ? "selected" : "not selected"}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: draft.weekdays.includes(day),
                    }}
                    key={label}
                    onPress={() => toggleDay(day)}
                    style={[
                      styles.day,
                      draft.weekdays.includes(day) && styles.daySelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        draft.weekdays.includes(day) && styles.dayTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {draft.repeat === "once" ? (
            <>
              <Text style={styles.label}>Date</Text>
              <DateTimePicker
                display="compact"
                mode="date"
                onValueChange={(_, date) =>
                  updateDraft({ startDate: localDay(date) })
                }
                value={selectedDate}
              />
            </>
          ) : null}
          <Text style={styles.label}>
            {draft.repeat === "multiple_daily" ? "Times" : "Time"}
          </Text>
          <DateTimePicker
            display="compact"
            mode="time"
            onValueChange={(_, date) =>
              updateDraft({ time: timeFromDate(date) })
            }
            value={selectedDate}
          />
          {draft.repeat === "multiple_daily"
            ? draft.additionalTimes.map((time, index) => (
                <View key={`${time}-${index}`} style={styles.additionalTime}>
                  <DateTimePicker
                    display="compact"
                    mode="time"
                    onValueChange={(_, date) =>
                      updateAdditionalTime(index, date)
                    }
                    value={dateFromLocalDay(draft.startDate, time)}
                  />
                  <Pressable
                    accessibilityLabel={`Remove reminder time ${index + 2}`}
                    accessibilityRole="button"
                    onPress={() =>
                      updateDraft({
                        additionalTimes: draft.additionalTimes.filter(
                          (_, timeIndex) => timeIndex !== index,
                        ),
                      })
                    }
                    style={styles.removeTimeButton}
                  >
                    <Text style={styles.removeTimeText}>Remove</Text>
                  </Pressable>
                </View>
              ))
            : null}
          {draft.repeat === "multiple_daily" ? (
            <Pressable
              accessibilityLabel="Add another reminder time"
              accessibilityRole="button"
              disabled={draft.additionalTimes.length >= 5}
              onPress={addAnotherTime}
              style={[
                styles.addTimeButton,
                draft.additionalTimes.length >= 5 && styles.disabled,
              ]}
            >
              <Text style={styles.addTimeText}>+ Add another time</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.editorActions}>
            {editing ? (
              <Pressable
                accessibilityLabel="Delete reminder"
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void remove(editing)}
                style={[styles.deleteButton, saving && styles.disabled]}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel="Save reminder"
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void save()}
              style={[styles.saveButton, saving && styles.disabled]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>Save reminder</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color="#16776A" style={styles.loading} />
      ) : reminders.length ? (
        <>
          <Text style={styles.section}>Today</Text>
          {reminders.map((reminder) => {
            const complete = reminderIsComplete(reminder.id, completions);
            return (
              <View key={reminder.id} style={styles.card}>
                <Pressable
                  accessibilityLabel={`${complete ? "Mark incomplete" : "Mark complete"}: ${reminderTitle(reminder)}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: complete }}
                  disabled={saving}
                  onPress={() => void toggleCompleted(reminder)}
                  style={[
                    styles.completeButton,
                    complete && styles.completeButtonDone,
                  ]}
                >
                  <SymbolView
                    fallback={
                      <Text style={styles.checkFallback}>
                        {complete ? "✓" : ""}
                      </Text>
                    }
                    name={complete ? "checkmark" : "circle"}
                    size={17}
                    tintColor={complete ? "#FFFFFF" : "#16776A"}
                    weight="bold"
                  />
                </Pressable>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>
                    {reminderTitle(reminder)}
                  </Text>
                  <Text style={styles.cardCopy}>{repeatSummary(reminder)}</Text>
                  <Text style={complete ? styles.done : styles.active}>
                    {complete
                      ? "Completed today"
                      : reminder.notificationIds.length
                        ? "Notifications on"
                        : "Notifications unavailable"}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={`Edit ${reminderTitle(reminder)} reminder`}
                  accessibilityRole="button"
                  onPress={() => openEdit(reminder)}
                  style={styles.editButton}
                >
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
              </View>
            );
          })}
        </>
      ) : null}
    </ScrollView>
  );
}

function Chip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#F7FAFC",
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800" },
  addButton: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  addFallback: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 25,
  },
  success: { color: "#16776A", fontSize: 14, fontWeight: "700", marginTop: 12 },
  error: { color: "#B42318", fontSize: 13, fontWeight: "700", marginTop: 12 },
  section: {
    color: "#243B53",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
    marginTop: 22,
  },
  editor: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 20,
    padding: 16,
  },
  editorHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  textButton: { paddingVertical: 5 },
  textButtonText: { color: "#16776A", fontSize: 14, fontWeight: "800" },
  label: {
    color: "#486581",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 7,
    marginTop: 17,
  },
  input: {
    backgroundColor: "#F7FAFC",
    borderColor: "#C5D1DD",
    borderRadius: 11,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#F1F5F9",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: "#E6F7F3", borderColor: "#16776A" },
  chipText: { color: "#486581", fontSize: 13, fontWeight: "700" },
  chipTextSelected: { color: "#12685D" },
  days: { flexDirection: "row", justifyContent: "space-between" },
  day: {
    alignItems: "center",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  daySelected: { backgroundColor: "#16776A", borderColor: "#16776A" },
  dayText: { color: "#486581", fontSize: 11, fontWeight: "800" },
  dayTextSelected: { color: "#FFFFFF" },
  additionalTime: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  removeTimeButton: { paddingHorizontal: 8, paddingVertical: 7 },
  removeTimeText: { color: "#B42318", fontSize: 13, fontWeight: "800" },
  addTimeButton: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 7 },
  addTimeText: { color: "#16776A", fontSize: 13, fontWeight: "800" },
  editorActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  deleteButton: {
    alignItems: "center",
    borderColor: "#E5A7A1",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  deleteText: { color: "#B42318", fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.6 },
  loading: { marginTop: 36 },
  card: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
    padding: 14,
  },
  completeButton: {
    alignItems: "center",
    borderColor: "#16776A",
    borderRadius: 17,
    borderWidth: 1.5,
    height: 34,
    justifyContent: "center",
    marginRight: 12,
    width: 34,
  },
  completeButtonDone: { backgroundColor: "#16776A" },
  checkFallback: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  cardContent: { flex: 1 },
  cardTitle: { color: "#102A43", fontSize: 16, fontWeight: "800" },
  cardCopy: { color: "#627D98", fontSize: 13, marginTop: 2 },
  active: { color: "#16776A", fontSize: 12, fontWeight: "700", marginTop: 4 },
  done: { color: "#486581", fontSize: 12, fontWeight: "700", marginTop: 4 },
  editButton: { paddingBottom: 9, paddingLeft: 10, paddingTop: 9 },
  editText: { color: "#16776A", fontSize: 13, fontWeight: "800" },
});

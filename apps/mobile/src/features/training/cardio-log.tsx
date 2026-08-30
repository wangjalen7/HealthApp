import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "../auth/auth-provider";
import { saveCardio, type CardioInput } from "./repository";

const activities: CardioInput["activityType"][] = [
  "walk",
  "run",
  "swim",
  "tennis",
  "cycle",
  "other",
];
const cardioStyles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
  },
  headerCopy: { color: "#627D98", lineHeight: 19, marginTop: 3 },
  headerText: { flex: 1, paddingRight: 12 },
  toggle: { alignItems: "center", flexDirection: "row", gap: 5 },
  toggleLabel: { color: "#16776A", fontSize: 13, fontWeight: "800" },
  chevron: {
    color: "#16776A",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 19,
  },
  form: {
    borderTopColor: "#E6EEF3",
    borderTopWidth: 1,
    marginTop: 13,
    paddingTop: 14,
  },
  buttonDisabled: { opacity: 0.65 },
});

export function CardioLog() {
  const { session } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [activityType, setActivityType] =
    useState<CardioInput["activityType"]>();
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  function toggleCardio() {
    setExpanded(Boolean(expanded) === false);
  }

  async function save() {
    if (!session) return setFeedback("Please sign in before saving.");
    const durationMinutes = Number(duration);
    const distanceMiles = distance ? Number(distance) : undefined;
    if (
      !activityType ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      (distance &&
        (typeof distanceMiles !== "number" ||
          !Number.isFinite(distanceMiles) ||
          distanceMiles < 0))
    )
      return setFeedback(
        "Choose an activity, enter a whole-minute duration, and an optional valid distance.",
      );
    setSaving(true);
    setFeedback("");
    try {
      await saveCardio(session.user.id, {
        activityType,
        durationMinutes,
        distanceMiles,
        notes,
      });
      setActivityType(undefined);
      setDuration("");
      setDistance("");
      setNotes("");
      setFeedback("Cardio activity saved.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save cardio.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <View style={styles.card}>
      <Pressable onPress={toggleCardio} style={cardioStyles.header}>
        <Text style={styles.title}>Cardio</Text>
        <Text style={styles.copy}>Tap to add a manual cardio session.</Text>
      </Pressable>
      {expanded && (
        <View style={cardioStyles.form}>
          <View style={styles.chips}>
            {activities.map((item) => (
              <Pressable
                key={item}
                onPress={() => setActivityType(item)}
                style={[
                  styles.chip,
                  activityType === item && styles.chipActive,
                ]}
              >
                <Text
                  style={
                    activityType === item
                      ? styles.chipTextActive
                      : styles.chipText
                  }
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <Field
              label="Minutes"
              value={duration}
              onChangeText={setDuration}
            />
            <Field
              label="Miles (optional)"
              value={distance}
              onChangeText={setDistance}
            />
          </View>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            multiline
            placeholder="Easy walk, laps, court session..."
            placeholderTextColor="#9FB3C8"
            style={[styles.input, styles.notes]}
            value={notes}
            onChangeText={setNotes}
          />
          {feedback ? (
            <Text
              style={feedback.includes("saved") ? styles.success : styles.error}
            >
              {feedback}
            </Text>
          ) : null}
          <Pressable
            disabled={saving}
            onPress={() => void save()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>
              {saving ? "Saving..." : "Save cardio"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="#9FB3C8"
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    padding: 15,
  },
  title: { color: "#243B53", fontSize: 19, fontWeight: "800" },
  copy: { color: "#627D98", lineHeight: 19, marginBottom: 13, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  chip: {
    backgroundColor: "#E6EEF3",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#16776A" },
  chipText: {
    color: "#486581",
    fontWeight: "700",
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: "#fff",
    fontWeight: "800",
    textTransform: "capitalize",
  },
  row: { flexDirection: "row", gap: 10 },
  field: { flex: 1 },
  label: { color: "#486581", fontSize: 12, fontWeight: "700", marginBottom: 5 },
  input: {
    backgroundColor: "#F7FAFC",
    borderColor: "#D9E2EC",
    borderRadius: 10,
    borderWidth: 1,
    color: "#102A43",
    marginBottom: 12,
    padding: 11,
  },
  notes: { minHeight: 65, textAlignVertical: "top" },
  success: {
    color: "#16776A",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  error: { color: "#B42318", fontSize: 13, marginBottom: 8 },
  button: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 11,
    minHeight: 46,
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontWeight: "800" },
});

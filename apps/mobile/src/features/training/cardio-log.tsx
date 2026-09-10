import { trackingStyles } from "../../ui/tracking-styles";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

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
export function CardioLog() {
  const { session } = useAuth();
  const [activityType, setActivityType] =
    useState<CardioInput["activityType"]>();
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

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
    <View>
      <Text style={styles.label}>Activity</Text>
      <View style={styles.chips}>
        {activities.map((item) => (
          <Pressable
            key={item}
            accessibilityState={{ selected: activityType === item }}
            onPress={() => setActivityType(item)}
            style={[styles.chip, activityType === item && styles.chipActive]}
          >
            <Text
              style={
                activityType === item ? styles.chipTextActive : styles.chipText
              }
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Field label="Minutes" value={duration} onChangeText={setDuration} />
        <Field
          label="Miles (optional)"
          value={distance}
          onChangeText={setDistance}
        />
      </View>
      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        accessibilityLabel="Cardio notes (optional)"
        multiline
        placeholder="Easy walk, laps, court session..."
        placeholderTextColor={colors.tertiary}
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
        style={[styles.button, saving && { opacity: 0.65 }]}
      >
        <Text style={styles.buttonText}>
          {saving ? "Saving..." : "Save cardio"}
        </Text>
      </Pressable>
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
        accessibilityLabel={label}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.tertiary}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  chip: trackingStyles.chip,
  chipActive: trackingStyles.chipActive,
  chipText: { ...trackingStyles.chipText, textTransform: "capitalize" },
  chipTextActive: {
    ...trackingStyles.chipTextActive,
    textTransform: "capitalize",
  },
  row: { flexDirection: "row", gap: 10 },
  field: { flex: 1 },
  label: trackingStyles.label,
  input: { ...trackingStyles.input, marginBottom: 16 },
  notes: { minHeight: 82, textAlignVertical: "top" },
  success: trackingStyles.success,
  error: trackingStyles.error,
  button: trackingStyles.button,
  buttonText: trackingStyles.buttonText,
});

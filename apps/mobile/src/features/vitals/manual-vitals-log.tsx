import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { type VitalKind, type VitalSample, unitFor } from "../../domain/vitals";
import { useAuth } from "../auth/auth-provider";
import { createId } from "./storage";
import { queueLocalVitals, syncVitals } from "./sync";

export type ManualVitalsLogMode = "weight" | "blood_pressure";

function isPositiveNumber(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
}

function sample(
  userId: string,
  kind: VitalKind,
  value: string,
  occurredAt: string,
  correlationId?: string,
): VitalSample {
  return {
    id: createId(),
    userId,
    kind,
    value: Number(value),
    unit: unitFor(kind),
    occurredAt,
    correlationId,
    source: "manual",
    createdAt: occurredAt,
  };
}

export function ManualVitalsLog({ mode }: { mode: ManualVitalsLogMode }) {
  const { session, configured } = useAuth();
  const [weight, setWeight] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const isWeight = mode === "weight";

  async function save() {
    if (!session) return setFeedback("Please sign in before saving.");
    if (isWeight && !isPositiveNumber(weight)) {
      return setFeedback("Enter a positive weight.");
    }
    if (
      !isWeight &&
      (!isPositiveNumber(systolic) ||
        !isPositiveNumber(diastolic) ||
        (pulse.trim() !== "" && !isPositiveNumber(pulse)))
    ) {
      return setFeedback("Enter positive systolic and diastolic readings. Pulse is optional.");
    }

    const occurredAt = new Date().toISOString();
    const correlationId = isWeight ? undefined : createId();
    const samples = isWeight
      ? [sample(session.user.id, "weight", weight, occurredAt)]
      : [
          sample(
            session.user.id,
            "systolic_bp",
            systolic,
            occurredAt,
            correlationId,
          ),
          sample(
            session.user.id,
            "diastolic_bp",
            diastolic,
            occurredAt,
            correlationId,
          ),
          ...(pulse.trim()
            ? [
                sample(
                  session.user.id,
                  "pulse",
                  pulse,
                  occurredAt,
                  correlationId,
                ),
              ]
            : []),
        ];

    setSaving(true);
    setFeedback("");
    try {
      await queueLocalVitals(samples);
      const result = configured ? await syncVitals(session.user.id) : undefined;
      if (isWeight) setWeight("");
      else {
        setSystolic("");
        setDiastolic("");
        setPulse("");
      }
      setFeedback(
        result?.error
          ? `Saved on this device. Sync is waiting: ${result.error}`
          : "Saved and synced to Supabase.",
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? `Could not save: ${error.message}`
          : "Could not save this entry.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{isWeight ? "Weight" : "Blood pressure"}</Text>
      <Text style={styles.copy}>
        {isWeight
          ? "Record your current body weight. It remains part of the same private health timeline as your other readings."
          : "Record systolic and diastolic together. Apple Health connection and permissions are managed in Profile."}
      </Text>
      {isWeight ? (
        <Field label="Weight (lb)" value={weight} onChangeText={setWeight} />
      ) : (
        <>
          <Text style={styles.section}>Blood pressure (mmHg)</Text>
          <View style={styles.row}>
            <Field compact label="Systolic" value={systolic} onChangeText={setSystolic} />
            <Field compact label="Diastolic" value={diastolic} onChangeText={setDiastolic} />
          </View>
          <Field label="Pulse (bpm, optional)" value={pulse} onChangeText={setPulse} />
        </>
      )}
      {feedback ? (
        <Text style={feedback.startsWith("Saved") ? styles.success : styles.error}>
          {feedback}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={() => void save()}
        style={[styles.button, saving && styles.disabledButton]}
      >
        <Text style={styles.buttonText}>
          {saving ? "Saving..." : isWeight ? "Save weight" : "Save blood pressure"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  compact,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <View style={compact ? styles.compact : undefined}>
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
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800" },
  copy: { color: "#627D98", lineHeight: 21, marginBottom: 18, marginTop: 7 },
  section: {
    color: "#243B53",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 10,
    marginTop: 8,
  },
  label: { color: "#486581", fontSize: 14, fontWeight: "600", marginBottom: 7 },
  input: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 12,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 18,
    marginBottom: 16,
    padding: 14,
  },
  row: { flexDirection: "row", gap: 12 },
  compact: { flex: 1 },
  success: { color: "#16776A", fontWeight: "700", marginBottom: 8 },
  error: { color: "#B42318", lineHeight: 20, marginBottom: 8 },
  button: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 13,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 54,
  },
  disabledButton: { opacity: 0.65 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});

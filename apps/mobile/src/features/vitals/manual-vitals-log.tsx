import { useState } from "react";
import { SymbolView } from "expo-symbols";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { type VitalKind, type VitalSample, unitFor } from "../../domain/vitals";
import { useAuth } from "../auth/auth-provider";
import {
  prepareProgressPhoto,
  selectProgressPhoto,
  type SelectedProgressPhoto,
} from "../progress-photos/image";
import { uploadProgressPhoto } from "../progress-photos/repository";
import { createId } from "./storage";
import { queueLocalVitals, syncVitals } from "./sync";

export type ManualVitalsLogMode = "weight" | "blood_pressure";

function isPositiveNumber(value: string): boolean {
  return (
    value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) > 0
  );
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
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedProgressPhoto>();
  const [photoBusy, setPhotoBusy] = useState(false);
  const isWeight = mode === "weight";

  async function choosePhoto(source: "camera" | "library") {
    setPhotoBusy(true);
    setFeedback("");
    try {
      const photo = await selectProgressPhoto(source);
      if (photo) setSelectedPhoto(photo);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not select photo.",
      );
    } finally {
      setPhotoBusy(false);
    }
  }

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
      return setFeedback(
        "Enter positive systolic and diastolic readings. Pulse is optional.",
      );
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
      let photoUploaded = false;
      let photoError = "";
      if (isWeight && selectedPhoto && configured) {
        try {
          const prepared = await prepareProgressPhoto(selectedPhoto);
          await uploadProgressPhoto(session.user.id, prepared, samples[0].id);
          photoUploaded = true;
          setSelectedPhoto(undefined);
        } catch (error) {
          photoError =
            error instanceof Error ? error.message : "Could not upload photo.";
        }
      }
      if (isWeight) setWeight("");
      else {
        setSystolic("");
        setDiastolic("");
        setPulse("");
      }
      setFeedback(
        photoError
          ? `Weight saved. Photo upload failed: ${photoError}`
          : result?.error
            ? `Saved on this device. Sync is waiting: ${result.error}`
            : photoUploaded
              ? "Saved with progress photo."
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
      {isWeight ? (
        <>
          <Field label="Weight (lb)" value={weight} onChangeText={setWeight} />
          <View style={styles.photoCard}>
            <Text style={styles.photoTitle}>Progress photo</Text>
            {selectedPhoto ? (
              <Image
                accessibilityLabel="Selected progress photo"
                resizeMode="cover"
                source={{ uri: selectedPhoto.uri }}
                style={styles.photoPreview}
              />
            ) : null}
            <View style={styles.photoActions}>
              <PhotoButton
                disabled={saving || photoBusy}
                label="Camera"
                name="camera.fill"
                onPress={() => void choosePhoto("camera")}
              />
              <PhotoButton
                disabled={saving || photoBusy}
                label="Library"
                name="photo.on.rectangle"
                onPress={() => void choosePhoto("library")}
              />
              {selectedPhoto ? (
                <Pressable
                  accessibilityLabel="Remove selected progress photo"
                  accessibilityRole="button"
                  disabled={saving || photoBusy}
                  onPress={() => setSelectedPhoto(undefined)}
                  style={styles.removePhotoButton}
                >
                  <Text style={styles.removePhotoText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
            {photoBusy ? <ActivityIndicator color="#16776A" /> : null}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.section}>Blood pressure (mmHg)</Text>
          <View style={styles.row}>
            <Field
              compact
              label="Systolic"
              value={systolic}
              onChangeText={setSystolic}
            />
            <Field
              compact
              label="Diastolic"
              value={diastolic}
              onChangeText={setDiastolic}
            />
          </View>
          <Field
            label="Pulse (bpm, optional)"
            value={pulse}
            onChangeText={setPulse}
          />
        </>
      )}
      {feedback ? (
        <Text
          style={feedback.startsWith("Saved") ? styles.success : styles.error}
        >
          {feedback}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={saving || photoBusy}
        onPress={() => void save()}
        style={[styles.button, (saving || photoBusy) && styles.disabledButton]}
      >
        <Text style={styles.buttonText}>
          {saving
            ? "Saving..."
            : isWeight
              ? "Save weight"
              : "Save blood pressure"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function PhotoButton({
  disabled,
  label,
  name,
  onPress,
}: {
  disabled: boolean;
  label: string;
  name: "camera.fill" | "photo.on.rectangle";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.photoButton, disabled && styles.disabledButton]}
    >
      <SymbolView
        fallback={<Text style={styles.photoFallback}>+</Text>}
        name={name}
        size={20}
        tintColor="#16776A"
        weight="regular"
      />
      <Text style={styles.photoButtonText}>{label}</Text>
    </Pressable>
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
  title: {
    color: "#102A43",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 18,
  },
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
  photoCard: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    padding: 13,
  },
  photoTitle: { color: "#243B53", fontSize: 14, fontWeight: "800" },
  photoPreview: {
    borderRadius: 10,
    height: 180,
    marginTop: 11,
    width: "100%",
  },
  photoActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 11,
  },
  photoButton: {
    alignItems: "center",
    backgroundColor: "#F0F8F6",
    borderRadius: 9,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 11,
  },
  photoButtonText: { color: "#16776A", fontSize: 13, fontWeight: "800" },
  photoFallback: { color: "#16776A", fontSize: 18, fontWeight: "800" },
  removePhotoButton: { marginLeft: "auto", padding: 9 },
  removePhotoText: { color: "#B42318", fontSize: 13, fontWeight: "800" },
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

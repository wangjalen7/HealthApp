import { trackingStyles } from "../../ui/tracking-styles";
import { ScreenScrollView } from "../../ui/screen-scroll-view";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { Icon } from "../../ui/icon";
import { useState } from "react";
import { SymbolView } from "expo-symbols";
import {
  ActivityIndicator,
  Image,
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
              : configured
                ? "Saved and synced."
                : "Saved on this device.",
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
    <ScreenScrollView
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
            {photoBusy ? <ActivityIndicator color={colors.blue} /> : null}
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
    </ScreenScrollView>
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
        fallback={
          <Icon
            name={name === "camera.fill" ? "camera" : "image"}
            size={20}
            color={colors.blue}
          />
        }
        name={name}
        size={20}
        tintColor={colors.blue}
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
  page: trackingStyles.page,
  title: trackingStyles.title,
  section: trackingStyles.section,
  label: trackingStyles.label,
  input: { ...trackingStyles.input, marginBottom: 16 },
  row: { flexDirection: "row", gap: 12 },
  compact: { flex: 1 },
  photoCard: { ...trackingStyles.card, marginBottom: 16 },
  photoTitle: trackingStyles.section,
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
    ...trackingStyles.addButton,
    minHeight: 44,
    marginBottom: 0,
    paddingVertical: 10,
  },
  photoButtonText: trackingStyles.addButtonText,
  photoFallback: { color: colors.blue, fontSize: 18, fontWeight: "600" },
  removePhotoButton: { marginLeft: "auto", padding: 9 },
  removePhotoText: { color: "#B42318", fontSize: 13, fontWeight: "600" },
  success: trackingStyles.success,
  error: trackingStyles.error,
  button: trackingStyles.button,
  disabledButton: { opacity: 0.65 },
  buttonText: trackingStyles.buttonText,
});

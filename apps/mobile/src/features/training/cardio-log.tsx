import { completePendingDraftSave } from "../../lib/mutations";
import { observeDraftReset } from "../privacy/draft-reset";
import { trackingStyles } from "../../ui/tracking-styles";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { useAuth } from "../auth/auth-provider";
import {
  cardioDraftHasContent,
  clearCardioDraft,
  loadCardioDraft,
  saveCardioDraft,
} from "./cardio-draft";
import { saveCardio, type CardioInput } from "./repository";

const activities: CardioInput["activityType"][] = [
  "walk",
  "run",
  "swim",
  "tennis",
  "cycle",
  "other",
];
export function useCardioLog() {
  const { session } = useAuth();
  const [activityType, setActivityType] =
    useState<CardioInput["activityType"]>();
  const [entryDay, setEntryDay] = useState<string>();
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const editVersion = useRef(0);
  const saveInFlight = useRef(false);
  const loadedAccount = useRef<string | undefined>(undefined);
  useEffect(() => observeDraftReset(session?.user.id, () => {
    editVersion.current++;
    setActivityType(undefined); setEntryDay(undefined); setDuration(""); setDistance(""); setNotes(""); setFeedback("");
  }), [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const userId = session?.user.id;
      if (loadedAccount.current !== userId) {
        loadedAccount.current = userId;
        setDraftLoaded(false);
        setActivityType(undefined);
        setEntryDay(undefined);
        setDuration("");
        setDistance("");
        setNotes("");
        setFeedback("");
        editVersion.current++;
      }
      const version = editVersion.current;
      if (!userId) return () => undefined;
      void loadCardioDraft(userId)
        .then((draft) => {
          if (!active) return;
          if (draft && version === editVersion.current) {
            setActivityType(draft.activityType);
            setEntryDay(draft.entryDay);
            setDuration(
              draft.durationMinutes === undefined
                ? ""
                : String(draft.durationMinutes),
            );
            setDistance(
              draft.distanceMiles === undefined
                ? ""
                : String(draft.distanceMiles),
            );
            setNotes(draft.notes);
          }
          setDraftLoaded(true);
        })
        .catch(() => {
          if (active) {
            setFeedback(
              "Could not restore your saved draft. Return to this screen to retry.",
            );
          }
        });
      return () => {
        active = false;
      };
    }, [session?.user.id]),
  );

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !draftLoaded || saving) return;
    const durationMinutes = Number(duration);
    const distanceMiles = Number(distance);
    const draft = {
      entryDay,
      activityType,
      durationMinutes:
        Number.isInteger(durationMinutes) && durationMinutes >= 1
          ? durationMinutes
          : undefined,
      distanceMiles:
        distance.trim() && Number.isFinite(distanceMiles) && distanceMiles >= 0
          ? distanceMiles
          : undefined,
      notes,
    };
    void (cardioDraftHasContent(draft)
      ? saveCardioDraft(userId, draft)
      : clearCardioDraft(userId));
  }, [
    activityType,
    entryDay,
    distance,
    draftLoaded,
    duration,
    notes,
    saving,
    session?.user.id,
  ]);

  async function save() {
    if (saveInFlight.current || !draftLoaded) return;
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
    saveInFlight.current = true;
    setSaving(true);
    setFeedback("");
    try {
      await saveCardio(session.user.id, {
        entryDay,
        activityType,
        durationMinutes,
        distanceMiles,
        notes,
      });
      await clearCardioDraft(session.user.id);
      await completePendingDraftSave(session.user.id, "cardio:create");
      setActivityType(undefined);
      setEntryDay(undefined);
      setDuration("");
      setDistance("");
      setNotes("");
      setFeedback("Cardio activity saved.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save cardio.",
      );
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }
  return {
    activityType,
    setActivityType: (value: CardioInput["activityType"] | undefined) => {
      editVersion.current++;
      setActivityType(value);
    },
    entryDay,
    setEntryDay: (value: string | undefined) => {
      editVersion.current++;
      setEntryDay(value);
    },
    duration,
    setDuration: (value: string) => {
      editVersion.current++;
      setDuration(value);
    },
    distance,
    setDistance: (value: string) => {
      editVersion.current++;
      setDistance(value);
    },
    notes,
    setNotes: (value: string) => {
      editVersion.current++;
      setNotes(value);
    },
    feedback,
    saving,
    draftLoaded,
    save,
  };
}

export function CardioLog({ log }: { log: ReturnType<typeof useCardioLog> }) {
  const {
    activityType,
    setActivityType,
    entryDay,
    duration,
    setDuration,
    distance,
    setDistance,
    notes,
    setNotes,
    feedback,
    saving,
    draftLoaded,
    save,
  } = log;
  return (
    <View>
      {draftLoaded &&
      cardioDraftHasContent({
        entryDay,
        activityType,
        durationMinutes: Number(duration) || undefined,
        distanceMiles: distance.trim() ? Number(distance) : undefined,
        notes,
      }) ? (
        <Text style={styles.draftStatus}>
          Unfinished cardio saved on this device.
        </Text>
      ) : null}
      <Text style={styles.label}>Activity</Text>
      <View style={styles.chips}>
        {activities.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="radio"
            accessibilityState={{ checked: activityType === item }}
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
        disabled={saving || !draftLoaded}
        onPress={() => void save()}
        style={[styles.button, saving && { opacity: 0.65 }]}
      >
        <Text style={styles.buttonText}>
          {saving ? "Saving..." : "Save cardio"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={saving || !draftLoaded}
        onPress={() =>
          router.push({
            pathname: "/(app)/history",
            params: { view: "exercise", from: "cardio" },
          })
        }
        style={{
          minHeight: 48,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        <Text style={{ color: colors.blue, fontSize: 15, fontWeight: "600" }}>
          View workout history
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
  draftStatus: { color: colors.secondary, fontSize: 13, marginBottom: 14 },
});

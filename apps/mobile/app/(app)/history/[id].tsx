import { ExerciseSetFields } from "../../../src/features/training/exercise-set-fields";
import { IconButton } from "../../../src/ui/icon-button";
import { ScreenScrollView } from "../../../src/ui/screen-scroll-view";
import { Pressable } from "../../../src/ui/pressable";
import { colors } from "../../../src/ui/theme";
import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../../src/features/auth/auth-provider";
import {
  getWorkoutById,
  replaceWorkout,
  type WorkoutHistorySet,
  type WorkoutSetInput,
} from "../../../src/features/training/repository";
import {
  isUnilateralExerciseName,
  muscleGroupLabel,
  muscleGroups,
  moveWorkoutEntry,
  type MuscleGroup,
} from "../../../src/features/training/workout-draft";
import { createId } from "../../../src/features/vitals/storage";

type Entry = {
  id: string;
  name: string;
  muscleGroup?: MuscleGroup;
  reps: number[];
  weight?: number;
  sideMode: "bilateral" | "unilateral";
  rightReps: number[];
  rightWeight?: number;
};
const blank = (selectedGroups: MuscleGroup[]): Entry => ({
  id: createId(),
  name: "",
  muscleGroup: selectedGroups.length === 1 ? selectedGroups[0] : undefined,
  reps: [],
  sideMode: "bilateral",
  rightReps: [],
});
function groupedEntries(sets: WorkoutHistorySet[]): Entry[] {
  const byExercise = new Map<string, WorkoutHistorySet[]>();
  for (const set of sets) {
    const current = byExercise.get(set.exerciseName) ?? [];
    current.push(set);
    byExercise.set(set.exerciseName, current);
  }
  return [...byExercise.entries()].map(([name, values]) => ({
    id: createId(),
    name,
    muscleGroup: values[0].muscleGroup,
    weight: values[0].weight,
    sideMode: values[0].sideMode,
    rightWeight: values[0].rightWeight,
    reps: values
      .sort((left, right) => left.setNumber - right.setNumber)
      .map((set) => set.reps),
    rightReps: values
      .sort((left, right) => left.setNumber - right.setNumber)
      .flatMap((set) =>
        set.sideMode === "unilateral" && set.rightReps !== undefined
          ? [set.rightReps]
          : [],
      ),
  }));
}
function legacyGroups(title: string): MuscleGroup[] {
  return title
    .replace(/\s+lift$/i, "")
    .split(",")
    .map((part) => part.trim() as MuscleGroup)
    .filter((group): group is MuscleGroup => muscleGroups.includes(group));
}

export default function EditWorkoutScreen() {
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedGroups, setSelectedGroups] = useState<MuscleGroup[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const load = useCallback(async () => {
    if (!session || !id) return;
    setLoading(true);
    try {
      const workout = await getWorkoutById(session.user.id, id);
      if (!workout) {
        setFeedback("This workout is no longer available.");
        return;
      }
      const savedGroups = (
        workout.muscleGroups.length
          ? workout.muscleGroups
          : legacyGroups(workout.title)
      ).filter((group): group is MuscleGroup =>
        muscleGroups.includes(group as MuscleGroup),
      ) as MuscleGroup[];
      setVersion(workout.version);
      setSelectedGroups(savedGroups);
      setEntries(
        groupedEntries(workout.sets).map((entry) => ({
          ...entry,
          muscleGroup:
            entry.muscleGroup ??
            (savedGroups.length === 1 ? savedGroups[0] : undefined),
        })),
      );
      setLocation(workout.location ?? "");
      setNotes(workout.notes ?? "");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not load this workout.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  function toggleGroup(group: MuscleGroup) {
    setSelectedGroups((current) => {
      const next = current.includes(group)
        ? current.filter((item) => item !== group)
        : [...current, group];
      setEntries((currentEntries) =>
        currentEntries.map((entry) => ({
          ...entry,
          muscleGroup:
            entry.muscleGroup && next.includes(entry.muscleGroup)
              ? entry.muscleGroup
              : next.length === 1
                ? next[0]
                : undefined,
        })),
      );
      return next;
    });
  }
  function updateEntry(entryId: string, patch: Partial<Entry>) {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId ? { ...entry, ...patch } : entry,
      ),
    );
  }
  function moveEntry(entryId: string, direction: -1 | 1) {
    setEntries((current) => moveWorkoutEntry(current, entryId, direction));
  }
  function updateCount(entryId: string, raw: string) {
    const count = Number(raw);
    const safeCount =
      Number.isInteger(count) && count > 0 ? Math.min(count, 12) : 0;
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              reps: Array.from(
                { length: safeCount },
                (_, index) => entry.reps[index] ?? 0,
              ),
              rightReps: Array.from(
                { length: safeCount },
                (_, index) => entry.rightReps[index] ?? entry.reps[index] ?? 0,
              ),
            }
          : entry,
      ),
    );
  }
  function updateRep(entryId: string, index: number, raw: string) {
    const value = Number(raw);
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              reps: entry.reps.map((rep, repIndex) =>
                repIndex === index ? (Number.isFinite(value) ? value : 0) : rep,
              ),
            }
          : entry,
      ),
    );
  }
  function updateWeight(entryId: string, raw: string) {
    if (!raw.trim()) return updateEntry(entryId, { weight: undefined });
    const value = Number(raw.replace(",", "."));
    updateEntry(entryId, {
      weight: Number.isFinite(value) ? value : undefined,
    });
  }
  function updateRightRep(entryId: string, index: number, raw: string) {
    const value = Number(raw);
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              rightReps: entry.rightReps.map((rep, repIndex) =>
                repIndex === index ? (Number.isFinite(value) ? value : 0) : rep,
              ),
            }
          : entry,
      ),
    );
  }
  function updateRightWeight(entryId: string, raw: string) {
    if (!raw.trim()) return updateEntry(entryId, { rightWeight: undefined });
    const value = Number(raw.replace(",", "."));
    updateEntry(entryId, {
      rightWeight: Number.isFinite(value) ? value : undefined,
    });
  }
  async function save() {
    if (!session || !id) return;
    if (!selectedGroups.length)
      return setFeedback("Choose one or more muscle groups.");
    const valid = entries.filter(
      (entry) =>
        entry.name.trim() &&
        entry.muscleGroup !== undefined &&
        selectedGroups.includes(entry.muscleGroup) &&
        entry.reps.length &&
        entry.reps.every((reps) => Number.isInteger(reps) && reps > 0) &&
        entry.weight !== undefined &&
        entry.weight >= 0 &&
        (entry.sideMode !== "unilateral" ||
          (entry.rightReps.length === entry.reps.length &&
            entry.rightReps.every(
              (reps) => Number.isInteger(reps) && reps > 0,
            ) &&
            entry.rightWeight !== undefined &&
            entry.rightWeight >= 0)),
    );
    if (!valid.length || valid.length !== entries.length)
      return setFeedback(
        "Finish each exercise and choose its muscle group, or remove it.",
      );
    const sets: WorkoutSetInput[] = valid.flatMap((entry, exerciseIndex) =>
      entry.reps.map((reps, setIndex) => ({
        exerciseName: entry.name.trim(),
        exerciseOrder: exerciseIndex + 1,
        muscleGroup: entry.muscleGroup!,
        weight: entry.weight!,
        reps,
        sideMode: entry.sideMode,
        rightReps:
          entry.sideMode === "unilateral"
            ? entry.rightReps[setIndex]
            : undefined,
        rightWeight:
          entry.sideMode === "unilateral" ? entry.rightWeight : undefined,
      })),
    );
    setSaving(true);
    setFeedback("");
    try {
      await replaceWorkout(session.user.id, id, version, {
        title: `${selectedGroups.join(", ")} lift`,
        muscleGroups: selectedGroups,
        location,
        notes,
        sets,
      });
      router.replace({
        pathname: "/(app)/history",
        params: { view: "exercise" },
      });
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save changes.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  return (
    <ScreenScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={styles.title}>
        Edit workout
      </Text>
      <Text style={styles.label}>Muscle groups</Text>
      <View style={styles.groups}>
        {muscleGroups.map((group) => (
          <Pressable
            key={group}
            onPress={() => toggleGroup(group)}
            style={[
              styles.chip,
              selectedGroups.includes(group) && styles.chipActive,
            ]}
          >
            <Text
              style={
                selectedGroups.includes(group)
                  ? styles.chipTextActive
                  : styles.chipText
              }
            >
              {muscleGroupLabel(group)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Gym location (optional)</Text>
      <TextInput
        accessibilityLabel="Gym location"
        placeholder="Gym, studio, or home"
        placeholderTextColor="#9FB3C8"
        style={[styles.input, styles.location]}
        value={location}
        onChangeText={setLocation}
      />
      {entries.map((entry, index) => (
        <View key={entry.id} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.entryLabel}>EXERCISE {index + 1}</Text>
            <View style={styles.cardActions}>
              <View style={styles.reorderActions}>
                <Pressable
                  accessibilityLabel={`Move ${entry.name || `exercise ${index + 1}`} up`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: index === 0 }}
                  disabled={index === 0}
                  hitSlop={5}
                  onPress={() => moveEntry(entry.id, -1)}
                  style={[
                    styles.reorderButton,
                    index === 0 && styles.reorderButtonDisabled,
                  ]}
                >
                  <Text style={styles.reorderButtonText}>↑</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Move ${entry.name || `exercise ${index + 1}`} down`}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: index === entries.length - 1,
                  }}
                  disabled={index === entries.length - 1}
                  hitSlop={5}
                  onPress={() => moveEntry(entry.id, 1)}
                  style={[
                    styles.reorderButton,
                    index === entries.length - 1 &&
                      styles.reorderButtonDisabled,
                  ]}
                >
                  <Text style={styles.reorderButtonText}>↓</Text>
                </Pressable>
              </View>
              <IconButton
                name="delete"
                label="Remove"
                onPress={() =>
                  setEntries((current) =>
                    current.filter((item) => item.id !== entry.id),
                  )
                }
                destructive
              />
            </View>
          </View>
          <TextInput
            placeholder="Exercise name"
            placeholderTextColor="#9FB3C8"
            style={styles.input}
            value={entry.name}
            onChangeText={(name) => {
              const unilateral = isUnilateralExerciseName(name);
              updateEntry(entry.id, {
                name,
                sideMode: unilateral ? "unilateral" : "bilateral",
                rightReps: unilateral
                  ? entry.reps.map(
                      (reps, setIndex) => entry.rightReps[setIndex] ?? reps,
                    )
                  : [],
                rightWeight: unilateral
                  ? (entry.rightWeight ?? entry.weight)
                  : undefined,
              });
            }}
          />
          {selectedGroups.length > 1 ? (
            <>
              <Text style={styles.exerciseGroupLabel}>Muscle group</Text>
              <View style={styles.exerciseGroups}>
                {selectedGroups.map((group) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: entry.muscleGroup === group,
                    }}
                    key={group}
                    onPress={() =>
                      updateEntry(entry.id, { muscleGroup: group })
                    }
                    style={[
                      styles.exerciseGroupChip,
                      entry.muscleGroup === group &&
                        styles.exerciseGroupChipActive,
                    ]}
                  >
                    <Text
                      style={
                        entry.muscleGroup === group
                          ? styles.exerciseGroupTextActive
                          : styles.exerciseGroupText
                      }
                    >
                      {muscleGroupLabel(group)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <ExerciseSetFields
            setCount={entry.reps.length}
            reps={entry.reps}
            rightReps={entry.rightReps}
            weight={entry.weight}
            rightWeight={entry.rightWeight}
            unilateral={entry.sideMode === "unilateral"}
            onSetCountChange={(value) => updateCount(entry.id, value)}
            onRepChange={(index, value, side) =>
              side === "left"
                ? updateRep(entry.id, index, value)
                : updateRightRep(entry.id, index, value)
            }
            onWeightChange={(value, side) =>
              side === "left"
                ? updateWeight(entry.id, value)
                : updateRightWeight(entry.id, value)
            }
          />
        </View>
      ))}
      <Pressable
        onPress={() =>
          setEntries((current) => [...current, blank(selectedGroups)])
        }
        style={styles.add}
      >
        <Text style={styles.addText}>+ Add exercise</Text>
      </Pressable>
      <Text style={styles.label}>Notes</Text>
      <TextInput
        multiline
        placeholder="Notes"
        placeholderTextColor="#9FB3C8"
        style={[styles.input, styles.notes]}
        value={notes}
        onChangeText={setNotes}
      />
      {feedback ? <Text style={styles.error}>{feedback}</Text> : null}
      <Pressable
        disabled={saving}
        onPress={() => void save()}
        style={styles.save}
      >
        <Text style={styles.saveText}>
          {saving ? "Saving..." : "Save changes"}
        </Text>
      </Pressable>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 20 },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1,
    marginBottom: 20,
  },
  label: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  groups: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: {
    backgroundColor: colors.fill,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: { backgroundColor: colors.blue },
  chipText: { color: colors.secondary, fontWeight: "600" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    padding: 14,
  },
  cardHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardActions: { alignItems: "center", flexDirection: "row", gap: 7 },
  reorderActions: { flexDirection: "row", gap: 5 },
  reorderButton: {
    alignItems: "center",
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  reorderButtonDisabled: { opacity: 0.3 },
  reorderButtonText: {
    color: colors.blue,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 20,
  },
  entryLabel: {
    color: colors.tertiary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
  remove: { color: "#B42318", fontWeight: "600" },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.separator,
    borderRadius: 11,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    padding: 12,
  },
  location: { marginBottom: 18 },
  exerciseGroupLabel: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 10,
  },
  exerciseGroups: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  exerciseGroupChip: {
    backgroundColor: colors.fill,
    borderRadius: 22,
    borderCurve: "continuous",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  exerciseGroupChipActive: { backgroundColor: colors.blue },
  exerciseGroupText: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "700",
  },
  exerciseGroupTextActive: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  add: {
    alignItems: "center",
    borderColor: colors.blue,
    borderRadius: 11,
    borderStyle: "dashed",
    borderWidth: 1,
    marginBottom: 18,
    padding: 13,
  },
  addText: { color: colors.blue, fontWeight: "600" },
  notes: { minHeight: 80, textAlignVertical: "top" },
  error: { color: "#B42318", marginTop: 10 },
  save: {
    alignItems: "center",
    backgroundColor: colors.blue,
    borderRadius: 13,
    marginTop: 16,
    minHeight: 54,
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

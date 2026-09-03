import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../src/features/auth/auth-provider";
import { CardioLog } from "../../src/features/training/cardio-log";
import { ExerciseDragHandle } from "../../src/features/training/exercise-drag-handle";
import {
  getExerciseGuidance,
  getExerciseSuggestions,
  saveWorkout,
  type ExerciseGuidance,
  type WorkoutSetInput,
} from "../../src/features/training/repository";
import {
  clearWorkoutDraft,
  loadWorkoutDraft,
  muscleGroupLabel,
  muscleGroups,
  moveWorkoutEntry,
  saveWorkoutDraft,
  type MuscleGroup,
  type WorkoutDraft,
  workoutDraftHasContent,
} from "../../src/features/training/workout-draft";
import { createId } from "../../src/features/vitals/storage";

type ExerciseEntry = {
  id: string;
  name: string;
  muscleGroup?: MuscleGroup;
  setCount: number;
  reps: number[];
  weight?: number;
  guidance?: ExerciseGuidance;
  guidanceState: "idle" | "loading" | "loaded";
};
const blankExercise = (selectedGroups: MuscleGroup[]): ExerciseEntry => ({
  id: createId(),
  name: "",
  muscleGroup: selectedGroups.length === 1 ? selectedGroups[0] : undefined,
  setCount: 0,
  reps: [],
  guidanceState: "idle",
});
const normalizedExerciseName = (value: string) =>
  value.trim().toLocaleLowerCase();

function persistWorkoutDraft(
  userId: string,
  draft: WorkoutDraft,
): Promise<void> {
  return workoutDraftHasContent(draft)
    ? saveWorkoutDraft(userId, draft)
    : clearWorkoutDraft(userId);
}

export default function WorkoutScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [section, setSection] = useState<"lifting" | "cardio">("lifting");
  const [selectedGroups, setSelectedGroups] = useState<MuscleGroup[]>([]);
  const [entries, setEntries] = useState<ExerciseEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<string>();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const searchRequest = useRef(0);
  const guidanceRequests = useRef(new Map<string, number>());
  const entryNames = useRef(new Map<string, string>());
  const draftRef = useRef<WorkoutDraft>({
    muscleGroups: [],
    entries: [],
    location: "",
    notes: "",
  });
  const draft = useMemo<WorkoutDraft>(
    () => ({
      muscleGroups: selectedGroups,
      entries: entries.map(
        ({ id, name, muscleGroup, setCount, reps, weight }) => ({
          id,
          name,
          muscleGroup,
          setCount,
          reps,
          weight,
        }),
      ),
      location,
      notes,
    }),
    [entries, location, notes, selectedGroups],
  );
  draftRef.current = draft;

  useEffect(() => {
    let active = true;
    setDraftLoaded(false);
    setSelectedGroups([]);
    setEntries([]);
    setLocation("");
    setNotes("");
    setFeedback("");
    entryNames.current.clear();
    guidanceRequests.current.clear();
    if (!userId)
      return () => {
        active = false;
      };

    void loadWorkoutDraft(userId).then((savedDraft) => {
      if (!active) return;
      if (savedDraft) {
        setSelectedGroups(savedDraft.muscleGroups);
        setEntries(
          savedDraft.entries.map((entry) => ({
            ...entry,
            muscleGroup:
              entry.muscleGroup ??
              (savedDraft.muscleGroups.length === 1
                ? savedDraft.muscleGroups[0]
                : undefined),
            guidanceState: "idle",
          })),
        );
        for (const entry of savedDraft.entries) {
          entryNames.current.set(entry.id, entry.name);
        }
        setLocation(savedDraft.location);
      }
      setDraftLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !draftLoaded) return;
    void persistWorkoutDraft(userId, draft).catch(() => undefined);
  }, [draft, draftLoaded, userId]);

  useEffect(() => {
    if (!userId || !draftLoaded) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        const latest = draftRef.current;
        void persistWorkoutDraft(userId, latest).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [draftLoaded, userId]);
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
    setFeedback("");
  }
  function addExercise() {
    const entry = blankExercise(selectedGroups);
    entryNames.current.set(entry.id, "");
    setEntries((current) => [...current, entry]);
    setActiveEntry(entry.id);
    setFeedback("");
  }
  function removeExercise(id: string) {
    entryNames.current.delete(id);
    guidanceRequests.current.delete(id);
    setEntries((current) => current.filter((entry) => entry.id !== id));
    if (activeEntry === id) {
      setActiveEntry(undefined);
      setSuggestions([]);
    }
  }
  function moveExercise(id: string, direction: -1 | 1) {
    setEntries((current) => moveWorkoutEntry(current, id, direction));
    setFeedback("");
  }
  function updateEntry(id: string, patch: Partial<ExerciseEntry>) {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  }
  function updateSetCount(id: string, raw: string) {
    const count = Number(raw);
    const safeCount =
      Number.isInteger(count) && count > 0 ? Math.min(count, 12) : 0;
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              setCount: safeCount,
              reps: Array.from(
                { length: safeCount },
                (_, index) => entry.reps[index] ?? 0,
              ),
            }
          : entry,
      ),
    );
  }
  function updateRep(id: string, index: number, raw: string) {
    const value = Number(raw);
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id
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
  function updateWeight(id: string, raw: string) {
    if (!raw.trim()) return updateEntry(id, { weight: undefined });
    const value = Number(raw.replace(",", "."));
    updateEntry(id, { weight: Number.isFinite(value) ? value : undefined });
  }
  async function searchSavedExercises(query: string) {
    if (!session || !query.trim()) {
      setSuggestions([]);
      return;
    }
    const request = ++searchRequest.current;
    try {
      const matches = await getExerciseSuggestions(session.user.id, query);
      if (request === searchRequest.current) setSuggestions(matches);
    } catch {
      if (request === searchRequest.current) setSuggestions([]);
    }
  }
  async function loadGuidance(id: string, name: string) {
    if (!session || !name.trim()) return;
    const requestedName = normalizedExerciseName(name);
    const request = (guidanceRequests.current.get(id) ?? 0) + 1;
    guidanceRequests.current.set(id, request);
    updateEntry(id, { guidance: undefined, guidanceState: "loading" });
    try {
      const guidance = await getExerciseGuidance(session.user.id, name.trim());
      setEntries((current) =>
        current.map((entry) =>
          entry.id === id &&
          normalizedExerciseName(entry.name) === requestedName &&
          guidanceRequests.current.get(id) === request
            ? { ...entry, guidance, guidanceState: "loaded" }
            : entry,
        ),
      );
    } catch {
      setEntries((current) =>
        current.map((entry) =>
          entry.id === id &&
          normalizedExerciseName(entry.name) === requestedName &&
          guidanceRequests.current.get(id) === request
            ? { ...entry, guidance: undefined, guidanceState: "loaded" }
            : entry,
        ),
      );
    }
  }
  function chooseExercise(entryId: string, name: string) {
    entryNames.current.set(entryId, name);
    updateEntry(entryId, { name, guidance: undefined, guidanceState: "idle" });
    setSuggestions([]);
    setActiveEntry(undefined);
    void loadGuidance(entryId, name);
  }
  async function save() {
    if (!session) return setFeedback("Please sign in before saving.");
    if (!selectedGroups.length)
      return setFeedback("Choose one or more muscle groups first.");
    const validEntries = entries.filter(
      (entry) =>
        entry.name.trim() &&
        entry.muscleGroup !== undefined &&
        selectedGroups.includes(entry.muscleGroup) &&
        entry.setCount > 0 &&
        entry.reps.length === entry.setCount &&
        entry.reps.every((reps) => Number.isInteger(reps) && reps > 0) &&
        entry.weight !== undefined &&
        entry.weight >= 0,
    );
    if (!validEntries.length)
      return setFeedback(
        "Add an exercise, choose its muscle group, set count, every rep target, and a working weight.",
      );
    if (validEntries.length !== entries.length)
      return setFeedback(
        "Finish or remove incomplete exercises before saving.",
      );
    const sets: WorkoutSetInput[] = validEntries.flatMap(
      (entry, exerciseIndex) =>
        entry.reps.map((reps) => ({
          exerciseName: entry.name.trim(),
          exerciseOrder: exerciseIndex + 1,
          muscleGroup: entry.muscleGroup!,
          weight: entry.weight!,
          reps,
        })),
    );
    setSaving(true);
    setFeedback("");
    try {
      await saveWorkout(session.user.id, {
        title: `${selectedGroups.join(", ")} lift`,
        muscleGroups: selectedGroups,
        location,
        notes,
        sets,
      });
      await clearWorkoutDraft(session.user.id);
      setFeedback(
        "Workout saved. New exercise names will be suggested next time.",
      );
      entryNames.current.clear();
      guidanceRequests.current.clear();
      setEntries([]);
      setLocation("");
      setNotes("");
      setSelectedGroups([]);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save workout.",
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
      <Text style={styles.title}>Workout</Text>
      <Text style={styles.copy}>
        Log lifting and cardio in separate, focused sections.
      </Text>
      <View style={styles.tabs}>
        <SectionTab
          active={section === "lifting"}
          label="Lifting"
          onPress={() => setSection("lifting")}
        />
        <SectionTab
          active={section === "cardio"}
          label="Cardio"
          onPress={() => setSection("cardio")}
        />
      </View>
      {draftLoaded && workoutDraftHasContent(draft) ? (
        <Text style={styles.draftStatus}>
          Unfinished workout saved on this device.
        </Text>
      ) : null}
      {section === "lifting" ? (
        <>
          <Text style={styles.label}>1. Muscle groups</Text>
          <View style={styles.groups}>
            {muscleGroups.map((group) => (
              <Pressable
                key={group}
                accessibilityRole="button"
                accessibilityState={{
                  selected: selectedGroups.includes(group),
                }}
                onPress={() => toggleGroup(group)}
                style={[
                  styles.groupChip,
                  selectedGroups.includes(group) && styles.groupChipActive,
                ]}
              >
                <Text
                  style={
                    selectedGroups.includes(group)
                      ? styles.groupTextActive
                      : styles.groupText
                  }
                >
                  {muscleGroupLabel(group)}
                </Text>
              </Pressable>
            ))}
          </View>
          {selectedGroups.length ? (
            <>
              <Text style={styles.label}>2. Gym location (optional)</Text>
              <TextInput
                accessibilityLabel="Gym location"
                placeholder="Gym, studio, or home"
                placeholderTextColor="#9FB3C8"
                style={[styles.exerciseInput, styles.locationInput]}
                value={location}
                onChangeText={setLocation}
              />
              <View style={styles.exerciseBar}>
                <Text style={styles.label}>3. Lifting exercises</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={addExercise}
                  style={styles.addButton}
                >
                  <Text style={styles.addButtonText}>+ Add exercise</Text>
                </Pressable>
              </View>
              {entries.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>Build this workout</Text>
                  <Text style={styles.emptyCopy}>
                    Tap Add exercise to enter the first one.
                  </Text>
                </View>
              ) : null}
              {entries.map((entry, index) => (
                <View key={entry.id} style={styles.exerciseCard}>
                  <View style={styles.exerciseHeader}>
                    <Text style={styles.exerciseNumber}>
                      EXERCISE {index + 1}
                    </Text>
                    <View style={styles.exerciseHeaderActions}>
                      <ExerciseDragHandle
                        index={index}
                        itemCount={entries.length}
                        onMove={(direction) =>
                          moveExercise(entry.id, direction)
                        }
                      />
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => removeExercise(entry.id)}
                        hitSlop={8}
                      >
                        <Text style={styles.remove}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                  <TextInput
                    accessibilityLabel="Exercise name"
                    placeholder="Search your saved exercises or enter a new one"
                    placeholderTextColor="#9FB3C8"
                    style={styles.exerciseInput}
                    value={entry.name}
                    onFocus={() => {
                      setActiveEntry(entry.id);
                      void searchSavedExercises(entry.name);
                    }}
                    onBlur={() => {
                      if (activeEntry === entry.id)
                        setTimeout(() => {
                          setActiveEntry(undefined);
                          setSuggestions([]);
                          void loadGuidance(
                            entry.id,
                            entryNames.current.get(entry.id) ?? entry.name,
                          );
                        }, 120);
                    }}
                    onChangeText={(name) => {
                      entryNames.current.set(entry.id, name);
                      guidanceRequests.current.set(
                        entry.id,
                        (guidanceRequests.current.get(entry.id) ?? 0) + 1,
                      );
                      updateEntry(entry.id, {
                        name,
                        guidance: undefined,
                        guidanceState: "idle",
                      });
                      setActiveEntry(entry.id);
                      void searchSavedExercises(name);
                    }}
                  />
                  {activeEntry === entry.id &&
                    suggestions.map((name) => (
                      <Pressable
                        key={name}
                        onPress={() => chooseExercise(entry.id, name)}
                        style={styles.suggestion}
                      >
                        <Text style={styles.suggestionName}>{name}</Text>
                      </Pressable>
                    ))}
                  {selectedGroups.length > 1 ? (
                    <>
                      <Text style={styles.exerciseGroupLabel}>
                        Muscle group
                      </Text>
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
                  <View style={styles.prescriptionLabel}>
                    <Text style={styles.subLabel}>Number of sets</Text>
                    <Text style={styles.subLabel}>Reps per set</Text>
                    <Text style={styles.subLabel}>Working weight</Text>
                  </View>
                  <View style={styles.prescription}>
                    <TextInput
                      accessibilityLabel="Number of sets"
                      keyboardType="number-pad"
                      placeholder="#"
                      placeholderTextColor="#9FB3C8"
                      style={styles.countInput}
                      value={entry.setCount ? String(entry.setCount) : ""}
                      onChangeText={(value) => updateSetCount(entry.id, value)}
                    />
                    <Text style={styles.times}>x</Text>
                    <View style={styles.repRow}>
                      {entry.reps.map((reps, index) => (
                        <TextInput
                          key={index}
                          accessibilityLabel={`Set ${index + 1} reps`}
                          keyboardType="number-pad"
                          placeholder="_"
                          placeholderTextColor="#9FB3C8"
                          style={styles.repInput}
                          value={reps ? String(reps) : ""}
                          onChangeText={(value) =>
                            updateRep(entry.id, index, value)
                          }
                        />
                      ))}
                    </View>
                    <TextInput
                      accessibilityLabel="Working weight in pounds"
                      keyboardType="decimal-pad"
                      placeholder="lb"
                      placeholderTextColor="#9FB3C8"
                      style={styles.weightInput}
                      value={
                        entry.weight === undefined ? "" : String(entry.weight)
                      }
                      onChangeText={(value) => updateWeight(entry.id, value)}
                    />
                    <Text style={styles.lb}>lb</Text>
                  </View>
                  {entry.guidanceState === "loading" ? (
                    <Text style={styles.memoryMuted}>
                      Checking your last 90 days...
                    </Text>
                  ) : entry.guidance ? (
                    <>
                      <Text style={styles.memory}>
                        Best in last 90 days:{" "}
                        {entry.guidance.memory.reps.length} x{" "}
                        {entry.guidance.memory.reps.join(", ")} at{" "}
                        {entry.guidance.memory.weight}{" "}
                        {entry.guidance.memory.unit}
                      </Text>
                      <Text
                        style={
                          entry.guidance.shouldIncrease
                            ? styles.progressFlag
                            : styles.progressHold
                        }
                      >
                        {entry.guidance.recommendation}
                      </Text>
                    </>
                  ) : entry.guidanceState === "loaded" ? (
                    <Text style={styles.memoryMuted}>
                      No saved performance in the last 90 days
                    </Text>
                  ) : (
                    <Text style={styles.memoryMuted}>
                      Select a saved exercise or finish typing to check your
                      history.
                    </Text>
                  )}
                </View>
              ))}
              {entries.length ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={addExercise}
                  style={styles.bottomAddButton}
                >
                  <Text style={styles.bottomAddButtonText}>
                    + Add another exercise
                  </Text>
                </Pressable>
              ) : null}
              <Text style={styles.label}>4. Notes (optional)</Text>
              <TextInput
                multiline
                placeholder="Energy, form cues, PR..."
                placeholderTextColor="#9FB3C8"
                style={[styles.exerciseInput, styles.notes]}
                value={notes}
                onChangeText={setNotes}
              />
              {feedback ? (
                <Text
                  style={
                    feedback.startsWith("Workout saved")
                      ? styles.success
                      : styles.error
                  }
                >
                  {feedback}
                </Text>
              ) : null}
              <Pressable
                disabled={saving}
                onPress={() => void save()}
                style={styles.finishButton}
              >
                <Text style={styles.finishText}>
                  {saving ? "Saving..." : "Finish workout"}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Choose muscle groups</Text>
              <Text style={styles.emptyCopy}>
                You can select more than one for the same workout.
              </Text>
            </View>
          )}
        </>
      ) : (
        <CardioLog expandedByDefault />
      )}
    </ScrollView>
  );
}

function SectionTab({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={active ? styles.tabTextActive : styles.tabText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800" },
  copy: { color: "#627D98", lineHeight: 21, marginBottom: 20, marginTop: 7 },
  tabs: { flexDirection: "row", gap: 7, marginBottom: 20 },
  tab: {
    backgroundColor: "#E6EEF3",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  tabActive: { backgroundColor: "#102A43" },
  tabText: { color: "#486581", fontSize: 13, fontWeight: "800" },
  tabTextActive: { color: "#fff", fontSize: 13, fontWeight: "800" },
  draftStatus: {
    color: "#16776A",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 16,
    marginTop: -10,
  },
  label: { color: "#486581", fontSize: 14, fontWeight: "800", marginBottom: 8 },
  groups: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 22 },
  groupChip: {
    backgroundColor: "#E6EEF3",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  groupChipActive: { backgroundColor: "#16776A" },
  groupText: { color: "#486581", fontWeight: "800" },
  groupTextActive: { color: "#fff", fontWeight: "800" },
  exerciseBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  addButton: {
    backgroundColor: "#D8F3EB",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  addButtonText: { color: "#16776A", fontSize: 13, fontWeight: "800" },
  empty: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
    padding: 18,
  },
  emptyTitle: { color: "#243B53", fontWeight: "800" },
  emptyCopy: { color: "#627D98", marginTop: 5 },
  exerciseCard: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 13,
    padding: 14,
  },
  exerciseHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  exerciseHeaderActions: { alignItems: "center", flexDirection: "row", gap: 7 },
  exerciseNumber: {
    color: "#7B8794",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  remove: { color: "#B42318", fontSize: 13, fontWeight: "800" },
  exerciseInput: {
    backgroundColor: "#F7FAFC",
    borderColor: "#D9E2EC",
    borderRadius: 11,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 16,
    padding: 12,
  },
  exerciseGroupLabel: {
    color: "#486581",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 4,
  },
  exerciseGroups: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  exerciseGroupChip: {
    backgroundColor: "#E6EEF3",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  exerciseGroupChipActive: { backgroundColor: "#16776A" },
  exerciseGroupText: { color: "#486581", fontSize: 12, fontWeight: "700" },
  exerciseGroupTextActive: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  locationInput: { marginBottom: 20 },
  bottomAddButton: {
    alignItems: "center",
    borderColor: "#16776A",
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    marginBottom: 20,
    padding: 13,
  },
  bottomAddButtonText: { color: "#16776A", fontWeight: "800" },
  suggestion: {
    borderBottomColor: "#E6EEF3",
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 11,
  },
  suggestionName: { color: "#243B53", fontWeight: "700" },
  prescriptionLabel: { flexDirection: "row", marginTop: 15 },
  subLabel: { color: "#7B8794", flex: 1, fontSize: 11, fontWeight: "700" },
  prescription: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
  },
  countInput: {
    backgroundColor: "#F7FAFC",
    borderColor: "#D9E2EC",
    borderRadius: 9,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 16,
    padding: 9,
    textAlign: "center",
    width: 42,
  },
  times: { color: "#486581", fontSize: 18, fontWeight: "800" },
  repRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5 },
  repInput: {
    backgroundColor: "#F7FAFC",
    borderColor: "#D9E2EC",
    borderRadius: 9,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 16,
    minWidth: 38,
    padding: 9,
    textAlign: "center",
    width: 45,
  },
  weightInput: {
    backgroundColor: "#F7FAFC",
    borderColor: "#D9E2EC",
    borderRadius: 9,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 16,
    padding: 9,
    textAlign: "center",
    width: 56,
  },
  lb: { color: "#486581", fontSize: 13, fontWeight: "800" },
  memory: { color: "#16776A", fontSize: 13, fontWeight: "700", marginTop: 13 },
  memoryMuted: { color: "#7B8794", fontSize: 13, marginTop: 13 },
  progressFlag: {
    backgroundColor: "#E6F7F3",
    borderRadius: 9,
    color: "#12685D",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 9,
    padding: 9,
  },
  progressHold: {
    backgroundColor: "#F1F5F9",
    borderRadius: 9,
    color: "#486581",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 9,
    padding: 9,
  },
  notes: { marginBottom: 13, minHeight: 82, textAlignVertical: "top" },
  success: { color: "#16776A", fontWeight: "700", marginBottom: 10 },
  error: { color: "#B42318", marginBottom: 10 },
  finishButton: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 13,
    marginBottom: 20,
    minHeight: 54,
    justifyContent: "center",
  },
  finishText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});

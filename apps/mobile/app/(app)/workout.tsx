import { trackingStyles } from "../../src/ui/tracking-styles";
import { SegmentedControl } from "../../src/ui/segmented-control";
import DraggableFlatList, {
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../../src/ui/motion";
import { applyExerciseOrder } from "../../src/features/training/exercise-reorder";
import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { Icon } from "../../src/ui/icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "../../src/features/auth/auth-provider";
import { CardioLog } from "../../src/features/training/cardio-log";
import { ExerciseDragHandle } from "../../src/features/training/exercise-drag-handle";
import { suggestGymLocations } from "../../src/features/training/catalog";
import {
  getExerciseGuidance,
  getExerciseSuggestions,
  getGymLocationSuggestions,
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
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [section, setSection] = useState<"lifting" | "cardio">("lifting");
  const [selectedGroups, setSelectedGroups] = useState<MuscleGroup[]>([]);
  const [entries, setEntries] = useState<ExerciseEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<string>();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [locationFocused, setLocationFocused] = useState(false);
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
    if (!userId) {
      setLocationSuggestions([]);
      return;
    }
    let active = true;
    void getGymLocationSuggestions(userId)
      .then((locations) => {
        if (active) setLocationSuggestions(locations);
      })
      .catch(() => {
        if (active) setLocationSuggestions([]);
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
  const matchingLocations = locationSuggestions.filter((suggestion) =>
    suggestion
      .toLocaleLowerCase()
      .includes(location.trim().toLocaleLowerCase()),
  );
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
    const savedLocation = location.trim();
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
      if (savedLocation) {
        setLocationSuggestions((current) =>
          suggestGymLocations([savedLocation, ...current], ""),
        );
      }
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
    <DraggableFlatList
      testID="workout-exercise-list"
      containerStyle={{ flex: 1 }}
      data={section === "lifting" && selectedGroups.length ? entries : []}
      keyExtractor={(entry) => entry.id}
      onDragEnd={({ data }) =>
        setEntries((current) =>
          applyExerciseOrder(
            current,
            data.map((entry) => entry.id),
          ),
        )
      }
      activationDistance={6}
      autoscrollThreshold={80}
      autoscrollSpeed={220}
      animationConfig={{
        damping: 28,
        stiffness: 240,
        mass: 0.6,
        overshootClamping: true,
        reduceMotion: reducedMotion ? ReduceMotion.Always : ReduceMotion.System,
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={false}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.page,
        {
          alignSelf: "center",
          maxWidth: 760,
          width: "100%",
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 32,
        },
      ]}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Workout</Text>
          <View>
            <SegmentedControl
              label="Workout type"
              options={[
                { value: "lifting", label: "Lifting" },
                { value: "cardio", label: "Cardio" },
              ]}
              value={section}
              onChange={setSection}
            />
          </View>
          {draftLoaded && workoutDraftHasContent(draft) ? (
            <Text style={styles.draftStatus}>
              Unfinished workout saved on this device.
            </Text>
          ) : null}
          {section === "lifting" ? (
            <>
              {feedback ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={
                    feedback.startsWith("Workout saved")
                      ? styles.success
                      : styles.error
                  }
                >
                  {feedback}
                </Text>
              ) : null}
              <Text style={styles.label}>Muscle groups</Text>
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
                  <Text style={styles.label}>Gym location (optional)</Text>
                  <TextInput
                    accessibilityLabel="Gym location"
                    placeholder="Gym, studio, or home"
                    placeholderTextColor={colors.tertiary}
                    style={[styles.exerciseInput, styles.locationInput]}
                    value={location}
                    onBlur={() =>
                      setTimeout(() => setLocationFocused(false), 150)
                    }
                    onFocus={() => setLocationFocused(true)}
                    onChangeText={(value) => {
                      setLocation(value);
                      setLocationFocused(true);
                    }}
                  />
                  {locationFocused && matchingLocations.length ? (
                    <View style={styles.locationSuggestions}>
                      {matchingLocations.map((suggestion) => (
                        <Pressable
                          key={suggestion}
                          accessibilityRole="button"
                          onPress={() => {
                            setLocation(suggestion);
                            setLocationFocused(false);
                          }}
                          style={styles.locationSuggestion}
                        >
                          <Text style={styles.locationSuggestionText}>
                            {suggestion}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <Text style={styles.label}>Lifting exercises</Text>
                </>
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>Choose muscle groups</Text>
                </View>
              )}
            </>
          ) : (
            <CardioLog />
          )}
        </>
      }
      renderItem={({ item: entry, getIndex, drag, isActive }) => {
        const index = getIndex() ?? 0;
        return (
          <ScaleDecorator activeScale={reducedMotion ? 1 : 1.015}>
            <View
              testID={`exercise-card-${entry.id}`}
              style={[styles.exerciseCard, isActive && styles.activeExercise]}
            >
              <View style={styles.exerciseHeader}>
                <Text style={styles.exerciseNumber}>EXERCISE {index + 1}</Text>
                <View style={styles.exerciseHeaderActions}>
                  <ExerciseDragHandle
                    index={index}
                    dragging={isActive}
                    onDrag={drag}
                    itemCount={entries.length}
                    onMove={(direction) => moveExercise(entry.id, direction)}
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
                placeholder="Enter exercise name"
                placeholderTextColor={colors.tertiary}
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
                  placeholderTextColor={colors.tertiary}
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
                      placeholderTextColor={colors.tertiary}
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
                  placeholderTextColor={colors.tertiary}
                  style={styles.weightInput}
                  value={entry.weight === undefined ? "" : String(entry.weight)}
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
                    Best in last 90 days: {entry.guidance.memory.reps.length} x{" "}
                    {entry.guidance.memory.reps.join(", ")} at{" "}
                    {entry.guidance.memory.weight} {entry.guidance.memory.unit}
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
              ) : null}
            </View>
          </ScaleDecorator>
        );
      }}
      ListFooterComponent={
        section === "lifting" && selectedGroups.length ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={addExercise}
              style={styles.bottomAddButton}
            >
              <Icon name="plus" size={20} color={colors.surface} />
              <Text style={styles.bottomAddButtonText}>Add exercise</Text>
            </Pressable>
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              multiline
              placeholder="Energy, form cues, PR..."
              placeholderTextColor={colors.tertiary}
              style={[styles.exerciseInput, styles.notes]}
              value={notes}
              onChangeText={setNotes}
            />
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
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  page: trackingStyles.page,
  title: trackingStyles.title,
  draftStatus: { color: colors.secondary, fontSize: 13, marginBottom: 16 },
  label: trackingStyles.label,
  groups: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 22 },
  groupChip: trackingStyles.chip,
  groupChipActive: trackingStyles.chipActive,
  groupText: trackingStyles.chipText,
  groupTextActive: trackingStyles.chipTextActive,

  empty: {
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
    padding: 18,
  },
  emptyTitle: { color: colors.text, fontWeight: "600" },
  exerciseCard: { ...trackingStyles.card, marginBottom: 12 },
  activeExercise: {
    borderColor: colors.blue,
    shadowColor: colors.text,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  exerciseHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  exerciseHeaderActions: { alignItems: "center", flexDirection: "row", gap: 7 },
  exerciseNumber: {
    color: colors.tertiary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
  remove: { color: "#B42318", fontSize: 13, fontWeight: "600" },
  exerciseInput: trackingStyles.input,
  exerciseGroupLabel: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "600",
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
  locationInput: { marginBottom: 8 },
  locationSuggestions: {
    backgroundColor: "#FFFFFF",
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
    overflow: "hidden",
  },
  locationSuggestion: { paddingHorizontal: 13, paddingVertical: 11 },
  locationSuggestionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  bottomAddButton: trackingStyles.listAddButton,
  bottomAddButtonText: trackingStyles.listAddButtonText,
  suggestion: {
    borderBottomColor: colors.fill,
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 11,
  },
  suggestionName: { color: colors.text, fontWeight: "700" },
  prescriptionLabel: { flexDirection: "row", marginTop: 15 },
  subLabel: {
    color: colors.tertiary,
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  prescription: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
  },
  countInput: {
    ...trackingStyles.input,
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 8,
    textAlign: "center",
    width: 44,
  },
  times: { color: colors.secondary, fontSize: 18, fontWeight: "600" },
  repRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5 },
  repInput: {
    ...trackingStyles.input,
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 8,
    textAlign: "center",
    width: 45,
  },
  weightInput: {
    ...trackingStyles.input,
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 8,
    textAlign: "center",
    width: 56,
  },
  lb: { color: colors.secondary, fontSize: 13, fontWeight: "600" },
  memory: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 13,
  },
  memoryMuted: { color: colors.tertiary, fontSize: 13, marginTop: 13 },
  progressFlag: {
    backgroundColor: colors.blueSoft,
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
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 9,
    padding: 9,
  },
  notes: { marginBottom: 13, minHeight: 82, textAlignVertical: "top" },
  success: trackingStyles.success,
  error: trackingStyles.error,
  finishButton: trackingStyles.button,
  finishText: trackingStyles.buttonText,
});

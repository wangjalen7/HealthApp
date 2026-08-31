import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type VitalSample } from "../../src/domain/vitals";
import { useAuth } from "../../src/features/auth/auth-provider";
import {
  deleteCardio,
  deleteFood,
  deleteWorkout,
  getCardioHistory,
  getFoodHistory,
  getWorkoutHistory,
  type CardioHistoryEntry,
  type FoodHistoryEntry,
  type WorkoutHistorySession,
  type WorkoutHistorySet,
} from "../../src/features/training/repository";
import {
  loadCachedVitals,
  markVitalsDeleted,
  syncVitals,
} from "../../src/features/vitals/sync";

type HistoryView = "exercise" | "blood_pressure" | "weight" | "food";
type DeletionRequest = {
  title: string;
  message: string;
  confirm: () => void;
};
function historyView(
  value: string | string[] | undefined,
): HistoryView | undefined {
  if (
    value === "exercise" ||
    value === "blood_pressure" ||
    value === "weight" ||
    value === "food"
  ) {
    return value;
  }
  return undefined;
}
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
function groupSets(
  sets: WorkoutHistorySet[],
): { name: string; sets: WorkoutHistorySet[] }[] {
  const groups = new Map<string, WorkoutHistorySet[]>();
  for (const set of sets) {
    const current = groups.get(set.exerciseName) ?? [];
    current.push(set);
    groups.set(set.exerciseName, current);
  }
  return [...groups.entries()].map(([name, values]) => ({
    name,
    sets: values,
  }));
}
function muscleGroups(session: WorkoutHistorySession): string {
  return session.muscleGroups.length
    ? session.muscleGroups.join(", ")
    : session.title.replace(/\s+lift$/i, "") || "Mixed";
}
function cleanSourceName(value: string | undefined): string | undefined {
  const sourceName = value?.trim();
  if (
    !sourceName ||
    sourceName === "SourceProxy" ||
    sourceName.endsWith(".SourceProxy")
  )
    return undefined;
  return sourceName;
}
function vitalSourceName(sample: VitalSample): string {
  const cleanName = cleanSourceName(sample.sourceName);
  const cleanSource =
    sample.source === "healthkit"
      ? "Apple Health"
      : sample.source.replace("_", " ");
  if (!cleanName) return cleanSource;
  return `${cleanSource} \u00b7 ${cleanName}`;
}
function bloodPressureReadings(
  samples: VitalSample[],
): { systolic: VitalSample; diastolic?: VitalSample }[] {
  const diastolic = samples.filter((sample) => sample.kind === "diastolic_bp");
  return samples
    .filter((sample) => sample.kind === "systolic_bp")
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .map((systolic) => ({
      systolic,
      diastolic: diastolic.find((item) =>
        systolic.correlationId
          ? item.correlationId === systolic.correlationId
          : item.occurredAt === systolic.occurredAt,
      ),
    }));
}

function samplesForBloodPressureReading(
  reading: { systolic: VitalSample; diastolic?: VitalSample },
  samples: VitalSample[],
): VitalSample[] {
  const correlationId = reading.systolic.correlationId;
  if (correlationId) {
    return samples.filter((sample) => sample.correlationId === correlationId);
  }
  return [reading.systolic, reading.diastolic].filter(
    (sample): sample is VitalSample => Boolean(sample),
  );
}

export default function HistoryScreen() {
  const { view: requestedView } = useLocalSearchParams<{ view?: string }>();
  const { session, configured } = useAuth();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<HistoryView>("exercise");
  const [history, setHistory] = useState<WorkoutHistorySession[]>([]);
  const [cardio, setCardio] = useState<CardioHistoryEntry[]>([]);
  const [food, setFood] = useState<FoodHistoryEntry[]>([]);
  const [vitals, setVitals] = useState<VitalSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<DeletionRequest>();
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      if (configured) await syncVitals(session.user.id);
      const [workouts, cardioEntries, foodEntries, readings] =
        await Promise.all([
          getWorkoutHistory(session.user.id),
          getCardioHistory(session.user.id),
          getFoodHistory(session.user.id),
          loadCachedVitals(session.user.id),
        ]);
      setHistory(workouts);
      setCardio(cardioEntries);
      setFood(foodEntries);
      setVitals(readings);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load history.",
      );
    } finally {
      setLoading(false);
    }
  }, [configured, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    const nextView = historyView(requestedView);
    if (nextView) setView(nextView);
  }, [requestedView]);
  async function removeCardio(cardioId: string) {
    if (!session) return;
    try {
      await deleteCardio(session.user.id, cardioId);
      setCardio((current) => current.filter((entry) => entry.id !== cardioId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete cardio.",
      );
    }
  }
  function confirmRemoveCardio(cardioId: string) {
    setPendingDeletion({
      title: "Delete cardio activity?",
      message: "This removes it from your history and today's total.",
      confirm: () => void removeCardio(cardioId),
    });
  }
  async function removeWorkout(sessionId: string) {
    if (!session) return;
    try {
      await deleteWorkout(session.user.id, sessionId);
      setHistory((current) =>
        current.filter((entry) => entry.id !== sessionId),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete workout.",
      );
    }
  }
  function confirmRemoveWorkout(sessionId: string) {
    setPendingDeletion({
      title: "Delete workout?",
      message:
        "This removes the workout and every set in it from your history.",
      confirm: () => void removeWorkout(sessionId),
    });
  }
  async function removeFood(foodId: string) {
    if (!session) return;
    try {
      await deleteFood(session.user.id, foodId);
      setFood((current) => current.filter((entry) => entry.id !== foodId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete food.",
      );
    }
  }
  function confirmRemoveFood(foodId: string) {
    setPendingDeletion({
      title: "Delete food entry?",
      message: "This removes the food from its meal and daily totals.",
      confirm: () => void removeFood(foodId),
    });
  }
  async function removeVitals(samples: VitalSample[]) {
    if (!samples.length) return;
    try {
      const tombstones = await markVitalsDeleted(samples);
      const deletedIds = new Set(tombstones.map((sample) => sample.id));
      setVitals((current) =>
        current.filter((sample) => !deletedIds.has(sample.id)),
      );
      if (configured && session) {
        const result = await syncVitals(session.user.id);
        setError(
          result.error
            ? "Deleted on this device. Sync will retry when available."
            : "",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete reading.",
      );
    }
  }
  function confirmRemoveVitals(title: string, samples: VitalSample[]) {
    setPendingDeletion({
      title,
      message:
        "This removes the reading from your history and syncs that deletion.",
      confirm: () => void removeVitals(samples),
    });
  }
  const activeVitals = vitals.filter((sample) => !sample.deletedAt);
  const weights = activeVitals
    .filter((sample) => sample.kind === "weight")
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const bloodPressure = bloodPressureReadings(activeVitals);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} />
      }
    >
      <Text style={styles.title}>History</Text>
      <Text style={styles.copy}>
        Your complete exercise and health-record history.
      </Text>
      <View style={styles.tabs}>
        <HistoryTab
          label="Exercise"
          active={view === "exercise"}
          onPress={() => setView("exercise")}
        />
        <HistoryTab
          label="Blood pressure"
          active={view === "blood_pressure"}
          onPress={() => setView("blood_pressure")}
        />
        <HistoryTab
          label="Weight"
          active={view === "weight"}
          onPress={() => setView("weight")}
        />
        <HistoryTab
          label="Food"
          active={view === "food"}
          onPress={() => setView("food")}
        />
      </View>
      {loading &&
      !history.length &&
      !cardio.length &&
      !food.length &&
      !vitals.length ? (
        <ActivityIndicator color="#16776A" />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {view === "exercise" ? (
        <ExerciseHistory
          cardio={cardio}
          history={history}
          loading={loading}
          onDeleteCardio={confirmRemoveCardio}
          onDeleteWorkout={confirmRemoveWorkout}
        />
      ) : null}
      {view === "blood_pressure" ? (
        <BloodPressureHistory
          readings={bloodPressure}
          loading={loading}
          onDelete={(reading) =>
            confirmRemoveVitals(
              "Delete blood-pressure reading?",
              samplesForBloodPressureReading(reading, activeVitals),
            )
          }
        />
      ) : null}
      {view === "weight" ? (
        <WeightHistory
          readings={weights}
          loading={loading}
          onDelete={(reading) =>
            confirmRemoveVitals("Delete weight reading?", [reading])
          }
        />
      ) : null}
      {view === "food" ? (
        <FoodHistory
          entries={food}
          loading={loading}
          onDelete={confirmRemoveFood}
        />
      ) : null}
      <DeleteConfirmation
        request={pendingDeletion}
        onCancel={() => setPendingDeletion(undefined)}
        onConfirm={() => {
          const request = pendingDeletion;
          setPendingDeletion(undefined);
          request?.confirm();
        }}
      />
    </ScrollView>
  );
}

function DeleteConfirmation({
  request,
  onCancel,
  onConfirm,
}: {
  request?: DeletionRequest;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={Boolean(request)}
    >
      <View style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <Text style={styles.modalTitle}>{request?.title}</Text>
          <Text style={styles.modalCopy}>{request?.message}</Text>
          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.modalCancel}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={styles.modalDelete}
            >
              <Text style={styles.modalDeleteText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
function HistoryTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
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
type ExerciseTimelineItem =
  | { kind: "workout"; occurredAt: string; session: WorkoutHistorySession }
  | { kind: "cardio"; occurredAt: string; entry: CardioHistoryEntry };

function ExerciseHistory({
  cardio,
  history,
  loading,
  onDeleteCardio,
  onDeleteWorkout,
}: {
  cardio: CardioHistoryEntry[];
  history: WorkoutHistorySession[];
  loading: boolean;
  onDeleteCardio: (cardioId: string) => void;
  onDeleteWorkout: (sessionId: string) => void;
}) {
  const timeline: ExerciseTimelineItem[] = [
    ...history.map((session) => ({
      kind: "workout" as const,
      occurredAt: session.completedAt,
      session,
    })),
    ...cardio.map((entry) => ({
      kind: "cardio" as const,
      occurredAt: entry.occurredAt,
      entry,
    })),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  if (!loading && !timeline.length)
    return (
      <Empty
        title="No exercise saved yet"
        copy="Completed lifts and cardio activities will appear here."
      />
    );
  return (
    <>
      {timeline.map((item) =>
        item.kind === "workout" ? (
          <WorkoutHistoryCard
            key={item.session.id}
            session={item.session}
            onDelete={onDeleteWorkout}
          />
        ) : (
          <CardioHistoryCard
            key={item.entry.id}
            entry={item.entry}
            onDelete={onDeleteCardio}
          />
        ),
      )}
    </>
  );
}

function WorkoutHistoryCard({
  session,
  onDelete,
}: {
  session: WorkoutHistorySession;
  onDelete: (sessionId: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.date}>{formatDateTime(session.completedAt)}</Text>
          <Text style={styles.group}>
            Muscle groups: {muscleGroups(session)}
          </Text>
        </View>
        <Text style={styles.setTotal}>{session.sets.length} sets</Text>
      </View>
      {groupSets(session.sets).map((exercise) => (
        <View key={exercise.name} style={styles.exercise}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <Text style={styles.detail}>
            {exercise.sets.length} x{" "}
            {exercise.sets.map((set) => set.reps).join(", ")} at{" "}
            {exercise.sets[0].weight} {exercise.sets[0].unit}
          </Text>
        </View>
      ))}
      {session.notes ? (
        <Text style={styles.notes}>Notes: {session.notes}</Text>
      ) : null}
      <View style={styles.cardActions}>
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/(app)/history/[id]",
              params: { id: session.id },
            })
          }
          style={styles.editButton}
        >
          <Text style={styles.editText}>Edit workout</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onDelete(session.id)}
          style={[styles.deleteButton, styles.compactDeleteButton]}
        >
          <Text style={styles.deleteText}>Delete workout</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CardioHistoryCard({
  entry,
  onDelete,
}: {
  entry: CardioHistoryEntry;
  onDelete: (cardioId: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.date}>{formatDateTime(entry.occurredAt)}</Text>
          <Text style={styles.cardioBadge}>CARDIO</Text>
        </View>
        <Text style={styles.setTotal}>{entry.durationMinutes} min</Text>
      </View>
      <Text style={styles.cardioTitle}>
        {entry.activityName ?? entry.activityType}
      </Text>
      {entry.distanceMiles !== undefined ? (
        <Text style={styles.detail}>{entry.distanceMiles} miles</Text>
      ) : null}
      <Text style={styles.readingSource}>
        {entry.source === "healthkit" ? "Apple Health" : entry.source}
        {cleanSourceName(entry.sourceName)
          ? ` \u00b7 ${cleanSourceName(entry.sourceName)}`
          : ""}
      </Text>
      {entry.notes ? (
        <Text style={styles.notes}>Notes: {entry.notes}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => onDelete(entry.id)}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteText}>
          {entry.source === "healthkit"
            ? "Remove from HealthApp"
            : "Delete cardio"}
        </Text>
      </Pressable>
    </View>
  );
}
function BloodPressureHistory({
  readings,
  loading,
  onDelete,
}: {
  readings: { systolic: VitalSample; diastolic?: VitalSample }[];
  loading: boolean;
  onDelete: (reading: {
    systolic: VitalSample;
    diastolic?: VitalSample;
  }) => void;
}) {
  if (!loading && !readings.length)
    return (
      <Empty
        title="No blood-pressure readings"
        copy="Log a blood-pressure reading in Health Log."
      />
    );
  return (
    <>
      {readings.map(({ systolic, diastolic }) => (
        <View key={systolic.id} style={styles.readingCard}>
          <Text style={styles.readingValue}>
            {systolic.value}/{diastolic?.value ?? "--"} mmHg
          </Text>
          <Text style={styles.readingTime}>
            {formatDateTime(systolic.occurredAt)}
          </Text>
          <Text style={styles.readingSource}>{vitalSourceName(systolic)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onDelete({ systolic, diastolic })}
            style={styles.deleteButton}
          >
            <Text style={styles.deleteText}>Delete reading</Text>
          </Pressable>
        </View>
      ))}
    </>
  );
}
function WeightHistory({
  readings,
  loading,
  onDelete,
}: {
  readings: VitalSample[];
  loading: boolean;
  onDelete: (reading: VitalSample) => void;
}) {
  if (!loading && !readings.length)
    return (
      <Empty
        title="No weight readings"
        copy="Log a weight reading in Health Log."
      />
    );
  return (
    <>
      {readings.map((reading) => (
        <View key={reading.id} style={styles.readingCard}>
          <Text style={styles.readingValue}>
            {reading.value} {reading.unit}
          </Text>
          <Text style={styles.readingTime}>
            {formatDateTime(reading.occurredAt)}
          </Text>
          <Text style={styles.readingSource}>{vitalSourceName(reading)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onDelete(reading)}
            style={styles.deleteButton}
          >
            <Text style={styles.deleteText}>Delete reading</Text>
          </Pressable>
        </View>
      ))}
    </>
  );
}
type FoodHistoryDay = {
  key: string;
  occurredAt: string;
  entries: FoodHistoryEntry[];
};
function groupFoodByDay(entries: FoodHistoryEntry[]): FoodHistoryDay[] {
  const days = new Map<string, FoodHistoryDay>();
  for (const entry of entries) {
    const date = new Date(entry.occurredAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const day = days.get(key) ?? {
      key,
      occurredAt: entry.occurredAt,
      entries: [],
    };
    day.entries.push(entry);
    days.set(key, day);
  }
  return [...days.values()];
}
function FoodHistory({
  entries,
  loading,
  onDelete,
}: {
  entries: FoodHistoryEntry[];
  loading: boolean;
  onDelete: (foodId: string) => void;
}) {
  if (!loading && !entries.length)
    return (
      <Empty
        title="No meals saved yet"
        copy="Foods logged from the Food tab will be grouped here by date and meal."
      />
    );
  const mealOrder: FoodHistoryEntry["mealType"][] = [
    "breakfast",
    "lunch",
    "dinner",
    "snack",
    "meal",
  ];
  return (
    <>
      {groupFoodByDay(entries).map((day) => {
        const calories = day.entries.reduce(
          (total, entry) => total + entry.calories,
          0,
        );
        const protein = day.entries.reduce(
          (total, entry) => total + entry.proteinGrams,
          0,
        );
        return (
          <View key={day.key} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.date}>
                {new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(day.occurredAt))}
              </Text>
              <Text style={styles.setTotal}>
                {calories} cal · {Math.round(protein * 10) / 10}g protein
              </Text>
            </View>
            {mealOrder.map((meal) => {
              const foods = day.entries.filter(
                (entry) => entry.mealType === meal,
              );
              if (!foods.length) return null;
              return (
                <View key={meal} style={styles.mealGroup}>
                  <Text style={styles.mealTitle}>{meal}</Text>
                  {foods.map((food) => (
                    <View key={food.id} style={styles.foodRow}>
                      <View style={styles.foodDetails}>
                        <Text style={styles.exerciseName}>{food.foodName}</Text>
                        <Text style={styles.detail}>
                          {food.calories} cal · {food.proteinGrams}g protein ·{" "}
                          {new Intl.DateTimeFormat(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(food.occurredAt))}
                        </Text>
                        <Pressable
                          accessibilityLabel={`Delete ${food.foodName}`}
                          accessibilityRole="button"
                          onPress={() => onDelete(food.id)}
                          style={styles.deleteButton}
                        >
                          <Text style={styles.deleteText}>Delete food</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        );
      })}
    </>
  );
}
function Empty({ title, copy }: { title: string; copy: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800" },
  copy: { color: "#627D98", marginBottom: 16, marginTop: 7 },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 18,
  },
  tab: {
    backgroundColor: "#E6EEF3",
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  tabActive: { backgroundColor: "#102A43" },
  tabText: { color: "#486581", fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: "#fff", fontSize: 12, fontWeight: "800" },
  card: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 13,
    padding: 15,
  },
  cardHeader: {
    alignItems: "flex-start",
    borderBottomColor: "#E6EEF3",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 11,
    paddingBottom: 11,
  },
  date: { color: "#243B53", fontSize: 16, fontWeight: "800" },
  group: { color: "#16776A", fontSize: 13, fontWeight: "700", marginTop: 3 },
  cardioBadge: {
    color: "#7B8794",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  setTotal: { color: "#627D98", fontSize: 13, fontWeight: "700" },
  exercise: { marginTop: 10 },
  exerciseName: { color: "#243B53", fontWeight: "800" },
  cardioTitle: {
    color: "#243B53",
    fontSize: 17,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  detail: { color: "#486581", marginTop: 3 },
  mealGroup: { marginTop: 10 },
  mealTitle: {
    color: "#16776A",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  foodRow: {
    borderBottomColor: "#E6EEF3",
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  foodDetails: { flex: 1 },
  notes: {
    borderTopColor: "#E6EEF3",
    borderTopWidth: 1,
    color: "#627D98",
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 12,
    paddingTop: 10,
  },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  editButton: {
    alignSelf: "flex-start",
    backgroundColor: "#E6F7F3",
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  editText: { color: "#16776A", fontSize: 13, fontWeight: "800" },
  deleteButton: {
    alignSelf: "flex-start",
    borderColor: "#F1AEB5",
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  compactDeleteButton: { marginTop: 0 },
  deleteText: { color: "#B42318", fontSize: 13, fontWeight: "800" },
  readingCard: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  readingValue: { color: "#102A43", fontSize: 18, fontWeight: "800" },
  readingTime: { color: "#486581", marginTop: 4 },
  readingSource: {
    color: "#7B8794",
    fontSize: 12,
    marginTop: 4,
    textTransform: "capitalize",
  },
  empty: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: { color: "#243B53", fontWeight: "800" },
  emptyCopy: { color: "#627D98", marginTop: 5 },
  error: { color: "#B42318", marginBottom: 12 },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(16, 42, 67, 0.52)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    maxWidth: 420,
    padding: 20,
    width: "100%",
  },
  modalTitle: { color: "#102A43", fontSize: 19, fontWeight: "800" },
  modalCopy: { color: "#486581", lineHeight: 20, marginTop: 8 },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 20,
  },
  modalCancel: {
    alignItems: "center",
    borderColor: "#D9E2EC",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 15,
  },
  modalCancelText: { color: "#486581", fontWeight: "800" },
  modalDelete: {
    alignItems: "center",
    backgroundColor: "#B42318",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 16,
  },
  modalDeleteText: { color: "#fff", fontWeight: "800" },
});

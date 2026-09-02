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
import { mlToFluidOunces } from "../../src/features/hydration/model";
import {
  getHydrationHistory,
  type HydrationHistoryEntry,
} from "../../src/features/hydration/repository";
import { foodAmountDescription } from "../../src/features/nutrition/model";
import {
  dailyNutritionTotals,
  type DailyNutritionTotals,
  type OptionalNutritionTotal,
} from "../../src/features/nutrition/history-totals";
import {
  deleteFood,
  getFoodHistory,
  type FoodHistoryEntry,
} from "../../src/features/nutrition/repository";
import {
  deleteCardio,
  deleteWorkout,
  getCardioHistory,
  getWorkoutHistory,
  type CardioHistoryEntry,
  type WorkoutHistorySession,
  type WorkoutHistorySet,
} from "../../src/features/training/repository";
import { workoutSetBreakdown } from "../../src/features/training/workout-history";
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
function muscleGroupSetBreakdown(session: WorkoutHistorySession): string {
  return workoutSetBreakdown(session.sets, session.muscleGroups)
    .map(({ muscleGroup, setCount }) => `${muscleGroup} ${setCount}`)
    .join(" · ");
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
  const [hydration, setHydration] = useState<HydrationHistoryEntry[]>([]);
  const [vitals, setVitals] = useState<VitalSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<DeletionRequest>();
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      if (configured) await syncVitals(session.user.id);
      const [workouts, cardioEntries, foodEntries, hydrationEntries, readings] =
        await Promise.all([
          getWorkoutHistory(session.user.id),
          getCardioHistory(session.user.id),
          getFoodHistory(session.user.id),
          getHydrationHistory(session.user.id),
          loadCachedVitals(session.user.id),
        ]);
      setHistory(workouts);
      setCardio(cardioEntries);
      setFood(foodEntries);
      setHydration(hydrationEntries);
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
        Your complete workout and health-record history.
      </Text>
      <View style={styles.tabs}>
        <HistoryTab
          label="Workout"
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
      !hydration.length &&
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
          hydration={hydration}
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
        title="No workouts saved yet"
        copy="Completed lifting and cardio activities will appear here."
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
          <Text style={styles.groupBreakdown}>
            Sets by muscle: {muscleGroupSetBreakdown(session)}
          </Text>
        </View>
        <Text style={styles.setTotal}>{session.sets.length} sets</Text>
      </View>
      {groupSets(session.sets).map((exercise) => (
        <View key={exercise.name} style={styles.exercise}>
          <View style={styles.exerciseSummary}>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            <Text style={styles.exerciseSetTotal}>
              {exercise.sets.length}{" "}
              {exercise.sets.length === 1 ? "set" : "sets"}
            </Text>
          </View>
          <Text style={styles.detail}>
            Reps {exercise.sets.map((set) => set.reps).join(", ")} at{" "}
            {exercise.sets[0].weight} {exercise.sets[0].unit}
          </Text>
          <Text style={styles.exerciseGroup}>
            Muscle group:{" "}
            {exercise.sets[0].muscleGroup ??
              (session.muscleGroups.length === 1
                ? session.muscleGroups[0]
                : "Unassigned")}
          </Text>
        </View>
      ))}
      {session.notes ? (
        <Text style={styles.notes}>Notes: {session.notes}</Text>
      ) : null}
      {session.location ? (
        <Text style={styles.location}>Gym: {session.location}</Text>
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
      <View style={styles.cardActions}>
        {entry.source === "manual" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/(app)/history/edit",
                params: { id: entry.id, kind: "cardio" },
              })
            }
            style={styles.editButton}
          >
            <Text style={styles.editText}>Edit cardio</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => onDelete(entry.id)}
          style={[styles.deleteButton, styles.compactDeleteButton]}
        >
          <Text style={styles.deleteText}>
            {entry.source === "healthkit"
              ? "Remove from HealthApp"
              : "Delete cardio"}
          </Text>
        </Pressable>
      </View>
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
          <View style={styles.cardActions}>
            {systolic.source === "manual" && diastolic?.source === "manual" ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/(app)/history/edit",
                    params: { id: systolic.id, kind: "blood_pressure" },
                  })
                }
                style={styles.editButton}
              >
                <Text style={styles.editText}>Edit reading</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => onDelete({ systolic, diastolic })}
              style={[styles.deleteButton, styles.compactDeleteButton]}
            >
              <Text style={styles.deleteText}>Delete reading</Text>
            </Pressable>
          </View>
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
          <View style={styles.cardActions}>
            {reading.source === "manual" ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/(app)/history/edit",
                    params: { id: reading.id, kind: "weight" },
                  })
                }
                style={styles.editButton}
              >
                <Text style={styles.editText}>Edit reading</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => onDelete(reading)}
              style={[styles.deleteButton, styles.compactDeleteButton]}
            >
              <Text style={styles.deleteText}>Delete reading</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </>
  );
}
type FoodHistoryDay = {
  key: string;
  occurredAt: string;
  entries: FoodHistoryEntry[];
  waterMl: number;
};
function localHistoryDateKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function groupFoodByDay(
  entries: FoodHistoryEntry[],
  hydration: HydrationHistoryEntry[],
): FoodHistoryDay[] {
  const days = new Map<string, FoodHistoryDay>();
  for (const entry of entries) {
    const key = localHistoryDateKey(entry.occurredAt);
    const day = days.get(key) ?? {
      key,
      occurredAt: entry.occurredAt,
      entries: [],
      waterMl: 0,
    };
    day.entries.push(entry);
    days.set(key, day);
  }
  for (const entry of hydration) {
    const key = localHistoryDateKey(entry.occurredAt);
    const day = days.get(key) ?? {
      key,
      occurredAt: entry.occurredAt,
      entries: [],
      waterMl: 0,
    };
    day.waterMl += entry.volumeMl;
    days.set(key, day);
  }
  return [...days.values()].sort((left, right) =>
    right.key.localeCompare(left.key),
  );
}
function FoodHistory({
  entries,
  hydration,
  loading,
  onDelete,
}: {
  entries: FoodHistoryEntry[];
  hydration: HydrationHistoryEntry[];
  loading: boolean;
  onDelete: (foodId: string) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<FoodHistoryDay>();
  if (!loading && !entries.length && !hydration.length)
    return (
      <Empty
        title="No food or water saved yet"
        copy="Foods and daily hydration totals will be grouped here by date."
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
      {groupFoodByDay(entries, hydration).map((day) => {
        const totals = dailyNutritionTotals(day.entries, day.waterMl);
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
              <View style={styles.dayTotals}>
                <Text style={styles.setTotal}>
                  {totals.calories} cal ·{" "}
                  {Math.round(totals.proteinGrams * 10) / 10}g protein
                </Text>
                <Text style={styles.waterTotal}>
                  {mlToFluidOunces(day.waterMl)} fl oz water
                </Text>
                <Pressable
                  accessibilityLabel={`View full totals for ${day.key}`}
                  accessibilityRole="button"
                  onPress={() => setSelectedDay(day)}
                  style={styles.dailyTotalsButton}
                >
                  <Text style={styles.dailyTotalsButtonText}>
                    View daily totals
                  </Text>
                </Pressable>
              </View>
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
                        <View style={styles.foodHistoryHeader}>
                          <View style={styles.foodDetails}>
                            <Text style={styles.exerciseName}>
                              {food.foodName}
                            </Text>
                            {food.brand ? (
                              <Text style={styles.foodBrand}>{food.brand}</Text>
                            ) : null}
                          </View>
                        </View>
                        <Text style={styles.detail}>
                          {foodAmountDescription(
                            food.amount,
                            food.unit,
                            food.householdUnit,
                            food.servingLabel,
                          )}
                        </Text>
                        <Text style={styles.detail}>
                          {food.calories} cal · {food.proteinGrams}g protein ·{" "}
                          {new Intl.DateTimeFormat(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(food.occurredAt))}
                        </Text>
                        {food.carbohydrateGrams !== undefined ? (
                          <Text style={styles.foodFacts}>
                            Carbs {food.carbohydrateGrams}g · Fat{" "}
                            {food.fatGrams ?? 0}g
                            {food.fiberGrams !== undefined
                              ? ` · Fiber ${food.fiberGrams}g`
                              : ""}
                          </Text>
                        ) : null}
                        {food.note ? (
                          <Text style={styles.foodNote}>Note: {food.note}</Text>
                        ) : null}
                        <View style={styles.cardActions}>
                          {food.source !== "import" ? (
                            <Pressable
                              accessibilityLabel={`Edit ${food.foodName}`}
                              accessibilityRole="button"
                              onPress={() =>
                                router.push({
                                  pathname: "/(app)/history/edit",
                                  params: { id: food.id, kind: "food" },
                                })
                              }
                              style={styles.editButton}
                            >
                              <Text style={styles.editText}>Edit food</Text>
                            </Pressable>
                          ) : null}
                          <Pressable
                            accessibilityLabel={`Delete ${food.foodName}`}
                            accessibilityRole="button"
                            onPress={() => onDelete(food.id)}
                            style={[
                              styles.deleteButton,
                              styles.compactDeleteButton,
                            ]}
                          >
                            <Text style={styles.deleteText}>Delete food</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        );
      })}
      <DailyTotalsModal
        day={selectedDay}
        onClose={() => setSelectedDay(undefined)}
      />
    </>
  );
}

function roundedTotal(value: number, digits = 1): string {
  const multiplier = 10 ** digits;
  return String(Math.round(value * multiplier) / multiplier);
}

function optionalTotalLabel(
  total: OptionalNutritionTotal,
  unit: string,
): string {
  if (!total.hasAny) return "Not available";
  const value = `${roundedTotal(total.value)} ${unit}`;
  return total.complete ? value : `${value} recorded`;
}

function DailyTotalsModal({
  day,
  onClose,
}: {
  day?: FoodHistoryDay;
  onClose: () => void;
}) {
  const totals: DailyNutritionTotals | undefined = day
    ? dailyNutritionTotals(day.entries, day.waterMl)
    : undefined;
  const incomplete = totals
    ? [
        totals.carbohydrateGrams,
        totals.fatGrams,
        totals.fiberGrams,
        totals.sugarGrams,
        totals.sodiumMg,
      ].some((total) => !total.complete)
    : false;
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={Boolean(day)}
    >
      <View style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <Text style={styles.modalTitle}>Daily totals</Text>
          <Text style={styles.modalCopy}>
            {day
              ? new Intl.DateTimeFormat(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(day.occurredAt))
              : ""}
          </Text>
          {totals ? (
            <View style={styles.dailyTotalsList}>
              <DailyTotalRow
                label="Calories"
                value={`${totals.calories} cal`}
              />
              <DailyTotalRow
                label="Protein"
                value={`${roundedTotal(totals.proteinGrams)} g`}
              />
              <DailyTotalRow
                label="Water / fluids"
                value={`${mlToFluidOunces(totals.waterMl)} fl oz`}
              />
              <DailyTotalRow
                label="Carbohydrates"
                value={optionalTotalLabel(totals.carbohydrateGrams, "g")}
              />
              <DailyTotalRow
                label="Fat"
                value={optionalTotalLabel(totals.fatGrams, "g")}
              />
              <DailyTotalRow
                label="Fiber"
                value={optionalTotalLabel(totals.fiberGrams, "g")}
              />
              <DailyTotalRow
                label="Sodium"
                value={optionalTotalLabel(totals.sodiumMg, "mg")}
              />
              <DailyTotalRow
                label="Sugar"
                value={optionalTotalLabel(totals.sugarGrams, "g")}
              />
            </View>
          ) : null}
          {incomplete ? (
            <Text style={styles.dailyTotalsNote}>
              “Recorded” or “Not available” means at least one food did not
              include that nutrient value.
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.dailyTotalsClose}
          >
            <Text style={styles.dailyTotalsCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DailyTotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dailyTotalRow}>
      <Text style={styles.dailyTotalLabel}>{label}</Text>
      <Text style={styles.dailyTotalValue}>{value}</Text>
    </View>
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
  groupBreakdown: { color: "#486581", fontSize: 12, marginTop: 4 },
  cardioBadge: {
    color: "#7B8794",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  setTotal: { color: "#627D98", fontSize: 13, fontWeight: "700" },
  dayTotals: { alignItems: "flex-end", marginLeft: 8 },
  waterTotal: {
    color: "#126B83",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  dailyTotalsButton: {
    marginTop: 6,
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  dailyTotalsButtonText: {
    color: "#16776A",
    fontSize: 11,
    fontWeight: "800",
  },
  exercise: { marginTop: 10 },
  exerciseSummary: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  exerciseName: { color: "#243B53", fontWeight: "800" },
  exerciseSetTotal: {
    backgroundColor: "#E6F7F3",
    borderRadius: 11,
    color: "#16776A",
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  exerciseGroup: { color: "#7B8794", fontSize: 11, marginTop: 3 },
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
  foodHistoryHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
  },
  foodBrand: { color: "#627D98", fontSize: 12, marginTop: 2 },
  foodFacts: { color: "#627D98", fontSize: 12, marginTop: 4 },
  foodNote: {
    color: "#7B8794",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 5,
  },
  notes: {
    borderTopColor: "#E6EEF3",
    borderTopWidth: 1,
    color: "#627D98",
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 12,
    paddingTop: 10,
  },
  location: { color: "#16776A", fontSize: 13, fontWeight: "700", marginTop: 9 },
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
  dailyTotalsList: {
    borderColor: "#D9E2EC",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    overflow: "hidden",
  },
  dailyTotalRow: {
    alignItems: "center",
    borderBottomColor: "#E6EEF3",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 43,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dailyTotalLabel: { color: "#486581", fontSize: 13, fontWeight: "700" },
  dailyTotalValue: { color: "#102A43", fontSize: 13, fontWeight: "800" },
  dailyTotalsNote: {
    color: "#7B8794",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 11,
  },
  dailyTotalsClose: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 44,
  },
  dailyTotalsCloseText: { color: "#fff", fontWeight: "800" },
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

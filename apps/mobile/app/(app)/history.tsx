import type { ScrollView } from "react-native";
import { Modal } from "../../src/ui/modal";
import { SegmentedControl } from "../../src/ui/segmented-control";
import { SwipeContent } from "../../src/ui/swipe-content";
import { Icon } from "../../src/ui/icon";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  ActivityIndicator,
  RefreshControl,
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
  deleteHydration,
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
import { ProgressPhotoGallery } from "../../src/features/progress-photos/progress-photo-gallery";
import { getWeightSampleIdsWithProgressPhotos } from "../../src/features/progress-photos/repository";
import { workoutSetBreakdown } from "../../src/features/training/workout-history";
import { muscleGroupLabel } from "../../src/features/training/workout-draft";
import {
  loadCachedVitals,
  markVitalsDeleted,
  syncVitals,
} from "../../src/features/vitals/sync";
import { classifyBloodPressure } from "../../src/features/vitals/blood-pressure";
import { pulseForBloodPressure } from "../../src/features/vitals/blood-pressure-pulse";

const historyOptions = [
  { value: "exercise", label: "Workout" },
  { value: "food", label: "Food" },
  { value: "weight", label: "Weight" },
  { value: "blood_pressure", label: "Blood pressure" },
] as const;

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
function muscleGroupSetBreakdown(session: WorkoutHistorySession): string {
  return workoutSetBreakdown(session.sets, session.muscleGroups)
    .map(
      ({ muscleGroup, setCount }) =>
        `${setCount}\u00a0${muscleGroupLabel(muscleGroup)}`,
    )
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
type BloodPressureReading = {
  systolic: VitalSample;
  diastolic?: VitalSample;
  pulse?: VitalSample;
};
function bloodPressureReadings(samples: VitalSample[]): BloodPressureReading[] {
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
      pulse: pulseForBloodPressure(systolic, samples),
    }));
}

function samplesForBloodPressureReading(
  reading: BloodPressureReading,
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
  const [swiping, setSwiping] = useState(false);
  const [view, setView] = useState<HistoryView>("exercise");
  const historyScroll = useRef<ScrollView>(null);
  const changeView = (next: HistoryView) => {
    setView(next);
    historyScroll.current?.scrollTo({ y: 0, animated: false });
  };
  const [history, setHistory] = useState<WorkoutHistorySession[]>([]);
  const [cardio, setCardio] = useState<CardioHistoryEntry[]>([]);
  const [food, setFood] = useState<FoodHistoryEntry[]>([]);
  const [hydration, setHydration] = useState<HydrationHistoryEntry[]>([]);
  const [vitals, setVitals] = useState<VitalSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<DeletionRequest>();
  const [photoGalleryWeightId, setPhotoGalleryWeightId] = useState<string>();
  const [weightSampleIdsWithPhotos, setWeightSampleIdsWithPhotos] = useState<
    Set<string>
  >(new Set());
  const loadedUserId = useRef<string | undefined>(undefined);
  const refreshProgressPhotoIndicators = useCallback(
    async (readings: VitalSample[]) => {
      const userId = session?.user.id;
      if (!configured || !userId) {
        setWeightSampleIdsWithPhotos(new Set());
        return;
      }
      try {
        const ids = readings
          .filter((sample) => sample.kind === "weight" && !sample.deletedAt)
          .map((sample) => sample.id);
        setWeightSampleIdsWithPhotos(
          await getWeightSampleIdsWithProgressPhotos(userId, ids),
        );
      } catch {
        // History stays usable when the optional indicator metadata is offline.
        setWeightSampleIdsWithPhotos(new Set());
      }
    },
    [configured, session?.user.id],
  );
  const load = useCallback(
    async (isPullRefresh = false) => {
      if (!session) return;
      const isInitialLoad = loadedUserId.current !== session.user.id;
      if (isInitialLoad) setLoading(true);
      if (isPullRefresh) setRefreshing(true);
      try {
        if (configured) await syncVitals(session.user.id);
        const [
          workouts,
          cardioEntries,
          foodEntries,
          hydrationEntries,
          readings,
        ] = await Promise.all([
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
        void refreshProgressPhotoIndicators(readings);
        setError("");
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Could not load history.",
        );
      } finally {
        loadedUserId.current = session.user.id;
        if (isInitialLoad) setLoading(false);
        if (isPullRefresh) setRefreshing(false);
      }
    },
    [configured, refreshProgressPhotoIndicators, session],
  );
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
  function confirmRemoveHydration(entry: HydrationHistoryEntry) {
    setPendingDeletion({
      title: "Delete fluid entry?",
      message: `Remove ${entry.fluidName} from your history and daily total?`,
      confirm: () => {
        if (!session) return;
        void deleteHydration(session.user.id, entry.id)
          .then(() => {
            setHydration((current) =>
              current.filter((item) => item.id !== entry.id),
            );
          })
          .catch((caught) =>
            setError(
              caught instanceof Error
                ? caught.message
                : "Could not delete fluid.",
            ),
          );
      },
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
    <ScreenScrollView
      ref={historyScroll}
      directionalLockEnabled
      scrollEnabled={!swiping}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
        />
      }
    >
      <Text style={styles.title}>History</Text>
      <View style={{ height: 16 }} />
      <SegmentedControl
        label="History category"
        options={historyOptions}
        value={view}
        onChange={changeView}
      />
      {loading &&
      !history.length &&
      !cardio.length &&
      !food.length &&
      !hydration.length &&
      !vitals.length ? (
        <ActivityIndicator color={colors.blue} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <SwipeContent
        index={historyOptions.findIndex((option) => option.value === view)}
        count={historyOptions.length}
        onChange={(index) => changeView(historyOptions[index].value)}
        onGestureChange={setSwiping}
      >
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
            photoWeightSampleIds={weightSampleIdsWithPhotos}
            readings={weights}
            loading={loading}
            onOpenPhotos={setPhotoGalleryWeightId}
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
            onDeleteHydration={confirmRemoveHydration}
          />
        ) : null}
      </SwipeContent>
      <DeleteConfirmation
        request={pendingDeletion}
        onCancel={() => setPendingDeletion(undefined)}
        onConfirm={() => {
          const request = pendingDeletion;
          setPendingDeletion(undefined);
          request?.confirm();
        }}
      />
      {session ? (
        <ProgressPhotoGallery
          anchorWeightSampleId={photoGalleryWeightId}
          onClose={() => setPhotoGalleryWeightId(undefined)}
          onPhotosChanged={() =>
            void refreshProgressPhotoIndicators(activeVitals)
          }
          userId={session.user.id}
          visible={Boolean(photoGalleryWeightId)}
        />
      ) : null}
    </ScreenScrollView>
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
        <View style={styles.cardHeaderMain}>
          <Text style={styles.date}>{formatDateTime(session.completedAt)}</Text>
          <Text style={styles.group}>
            Sets by muscle: {muscleGroupSetBreakdown(session)}
          </Text>
        </View>
        <Text style={styles.setTotal}>
          {session.sets.length} {session.sets.length === 1 ? "set" : "sets"}
        </Text>
      </View>
      {groupSets(session.sets).map((exercise) => (
        <View key={exercise.name} style={styles.exercise}>
          <View style={styles.exerciseSummary}>
            <Text style={[styles.exerciseName, styles.workoutExerciseName]}>
              {exercise.name}
            </Text>
            <Text style={styles.exerciseMuscleBadge}>
              {muscleGroupLabel(
                exercise.sets[0].muscleGroup ??
                  (session.muscleGroups.length === 1
                    ? session.muscleGroups[0]
                    : "Unassigned"),
              )}
            </Text>
          </View>
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
        <View style={styles.cardHeaderMain}>
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
  readings: BloodPressureReading[];
  loading: boolean;
  onDelete: (reading: BloodPressureReading) => void;
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
      {readings.map(({ systolic, diastolic, pulse }) => {
        const category = diastolic
          ? classifyBloodPressure(systolic.value, diastolic.value)
          : undefined;
        return (
          <View key={systolic.id} style={styles.readingCard}>
            <View style={styles.readingHeader}>
              <Text style={styles.readingValue}>
                {systolic.value}/{diastolic?.value ?? "--"} mmHg
              </Text>
              {category ? (
                <Text
                  style={[
                    styles.bpCategory,
                    {
                      backgroundColor: category.backgroundColor,
                      color: category.color,
                    },
                  ]}
                >
                  {category.label}
                </Text>
              ) : null}
            </View>
            <Text style={styles.readingTime}>
              {formatDateTime(systolic.occurredAt)}
            </Text>
            {pulse ? (
              <Text style={styles.readingPulse}>
                Pulse {Math.round(pulse.value)} bpm
              </Text>
            ) : null}
            <Text style={styles.readingSource}>
              {vitalSourceName(systolic)}
            </Text>
            <View style={styles.cardActions}>
              {systolic.source === "manual" &&
              diastolic?.source === "manual" ? (
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
        );
      })}
    </>
  );
}
function WeightHistory({
  photoWeightSampleIds,
  readings,
  loading,
  onOpenPhotos,
  onDelete,
}: {
  photoWeightSampleIds: ReadonlySet<string>;
  readings: VitalSample[];
  loading: boolean;
  onOpenPhotos: (weightSampleId: string) => void;
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
          <View style={styles.weightReadingHeader}>
            <View style={styles.weightReadingCopy}>
              <Text style={styles.readingValue}>
                {reading.value} {reading.unit}
              </Text>
              <Text style={styles.readingTime}>
                {formatDateTime(reading.occurredAt)}
              </Text>
              <Text style={styles.readingSource}>
                {vitalSourceName(reading)}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={`${photoWeightSampleIds.has(reading.id) ? "Open uploaded" : "Add or view"} progress photos for ${formatDateTime(reading.occurredAt)}`}
              accessibilityRole="button"
              onPress={() => onOpenPhotos(reading.id)}
              style={({ pressed }) => [
                styles.progressPhotoButton,
                photoWeightSampleIds.has(reading.id) &&
                  styles.progressPhotoButtonFilled,
                pressed && styles.progressPhotoButtonPressed,
              ]}
            >
              <SymbolView
                fallback={<Text style={styles.progressPhotoFallback}>P</Text>}
                name={
                  photoWeightSampleIds.has(reading.id)
                    ? "photo.fill.on.rectangle.fill"
                    : "photo.on.rectangle"
                }
                size={22}
                tintColor={colors.blue}
                weight="regular"
              />
              {photoWeightSampleIds.has(reading.id) ? (
                <View pointerEvents="none" style={styles.progressPhotoMarker} />
              ) : null}
            </Pressable>
          </View>
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
  onDeleteHydration,
}: {
  entries: FoodHistoryEntry[];
  hydration: HydrationHistoryEntry[];
  loading: boolean;
  onDelete: (foodId: string) => void;
  onDeleteHydration: (entry: HydrationHistoryEntry) => void;
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
        const fluids = hydration.filter(
          (entry) => localHistoryDateKey(entry.occurredAt) === day.key,
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
              <View style={styles.dayTotals}>
                <Text style={styles.setTotal}>
                  {totals.calories} cal ·{" "}
                  {Math.round(totals.proteinGrams * 10) / 10}g protein
                </Text>
                <Text style={[styles.setTotal, styles.waterTotal]}>
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
                          <Text style={styles.foodTime}>
                            {new Intl.DateTimeFormat(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(food.occurredAt))}
                          </Text>
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
                          {food.calories} cal · {food.proteinGrams}g protein
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
            {fluids.length ? (
              <View style={styles.mealGroup}>
                <Text style={styles.mealTitle}>Fluids</Text>
                {fluids.map((entry) => (
                  <View key={entry.id} style={styles.foodRow}>
                    <View style={styles.foodHistoryHeader}>
                      <View style={styles.foodDetails}>
                        <Text style={styles.exerciseName}>
                          {entry.fluidName}
                        </Text>
                      </View>
                      <Text style={styles.foodTime}>
                        {new Intl.DateTimeFormat(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(entry.occurredAt))}
                      </Text>
                    </View>
                    <Text style={styles.detail}>
                      {mlToFluidOunces(entry.volumeMl)} fl oz
                    </Text>
                    <View style={styles.cardActions}>
                      <Pressable
                        accessibilityLabel={`Delete ${entry.fluidName} entry`}
                        onPress={() => onDeleteHydration(entry)}
                        style={[
                          styles.deleteButton,
                          styles.compactDeleteButton,
                        ]}
                      >
                        <Text style={styles.deleteText}>Delete fluid</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
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
      <View style={styles.emptyIcon}>
        <Icon name="history" size={30} color={colors.blue} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
      <Pressable
        onPress={() => router.push("/create")}
        style={[
          styles.editButton,
          {
            minHeight: 44,
            justifyContent: "center",
            marginTop: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          },
        ]}
      >
        <Icon name="plus" size={17} color={colors.blue} />
        <Text style={styles.editText}>Add a log</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  subtitle: {
    color: colors.secondary,
    fontSize: 15,
    marginTop: 6,
    marginBottom: 22,
  },
  swipeHint: {
    color: colors.secondary,
    fontSize: 12,
    marginTop: -6,
    marginBottom: 18,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 20 },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1,
  },
  card: {
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 13,
    padding: 15,
  },
  cardHeader: {
    alignItems: "flex-start",
    borderBottomColor: colors.fill,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 11,
    paddingBottom: 11,
  },
  cardHeaderMain: { flex: 1, minWidth: 0, paddingRight: 10 },
  date: { color: colors.text, fontSize: 16, fontWeight: "600" },
  group: { color: colors.blue, fontSize: 13, fontWeight: "700", marginTop: 3 },
  groupBreakdown: { color: colors.secondary, fontSize: 12, marginTop: 4 },
  cardioBadge: {
    color: colors.tertiary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  setTotal: {
    color: colors.secondary,
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "700",
    minWidth: 52,
    textAlign: "right",
  },
  dayTotals: { alignItems: "flex-end", marginLeft: 8 },
  waterTotal: {
    marginTop: 3,
  },
  dailyTotalsButton: {
    marginTop: 6,
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  dailyTotalsButtonText: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: "600",
  },
  exercise: { marginTop: 10 },
  exerciseSummary: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  exerciseName: { color: colors.text, fontWeight: "600" },
  workoutExerciseName: { flex: 1, paddingRight: 8 },
  exerciseMuscleBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.blueSoft,
    borderRadius: 11,
    color: colors.blue,
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 0,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cardioTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  detail: { color: colors.secondary, marginTop: 3 },
  mealGroup: { marginTop: 10 },
  mealTitle: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  foodRow: {
    borderBottomColor: colors.fill,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  foodDetails: { flex: 1 },
  foodHistoryHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  foodBrand: { color: colors.secondary, fontSize: 12, marginTop: 2 },
  foodTime: {
    color: colors.tertiary,
    fontSize: 10,
    marginLeft: 10,
    marginTop: 1,
  },
  foodFacts: { color: colors.secondary, fontSize: 12, marginTop: 4 },
  foodNote: {
    color: colors.tertiary,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 5,
  },
  notes: {
    borderTopColor: colors.fill,
    borderTopWidth: 1,
    color: colors.secondary,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 12,
    paddingTop: 10,
  },
  location: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 9,
  },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  editButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.blueSoft,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  editText: { color: colors.blue, fontSize: 13, fontWeight: "600" },
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
  deleteText: { color: "#B42318", fontSize: 13, fontWeight: "600" },
  readingCard: {
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  readingValue: { color: colors.text, fontSize: 18, fontWeight: "600" },
  readingHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  bpCategory: {
    borderRadius: 12,
    fontSize: 10,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  readingTime: { color: colors.secondary, marginTop: 4 },
  readingPulse: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  readingSource: {
    color: colors.tertiary,
    fontSize: 12,
    marginTop: 4,
    textTransform: "capitalize",
  },
  weightReadingHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weightReadingCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  progressPhotoButton: {
    alignItems: "center",
    backgroundColor: colors.blueSoft,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  progressPhotoButtonFilled: { backgroundColor: "#C6F2E8" },
  progressPhotoButtonPressed: { opacity: 0.55 },
  progressPhotoFallback: { color: colors.blue, fontWeight: "600" },
  progressPhotoMarker: {
    backgroundColor: colors.blue,
    borderColor: "#fff",
    borderRadius: 5,
    borderWidth: 1.5,
    height: 10,
    position: "absolute",
    right: 5,
    top: 5,
    width: 10,
  },
  empty: {
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: { color: colors.text, fontWeight: "600" },
  emptyCopy: { color: colors.secondary, marginTop: 5 },
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
  modalTitle: { color: colors.text, fontSize: 19, fontWeight: "600" },
  modalCopy: { color: colors.secondary, lineHeight: 20, marginTop: 8 },
  dailyTotalsList: {
    borderColor: colors.separator,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    overflow: "hidden",
  },
  dailyTotalRow: {
    alignItems: "center",
    borderBottomColor: colors.fill,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dailyTotalLabel: { color: colors.secondary, fontSize: 13, fontWeight: "700" },
  dailyTotalValue: { color: colors.text, fontSize: 13, fontWeight: "600" },
  dailyTotalsNote: {
    color: colors.tertiary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 11,
  },
  dailyTotalsClose: {
    alignItems: "center",
    backgroundColor: colors.blue,
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 44,
  },
  dailyTotalsCloseText: { color: "#fff", fontWeight: "600" },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 20,
  },
  modalCancel: {
    alignItems: "center",
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 15,
  },
  modalCancelText: { color: colors.secondary, fontWeight: "600" },
  modalDelete: {
    alignItems: "center",
    backgroundColor: "#B42318",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 16,
  },
  modalDeleteText: { color: "#fff", fontWeight: "600" },
});

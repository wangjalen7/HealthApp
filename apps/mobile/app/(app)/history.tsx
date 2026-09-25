import { serviceErrorMessage } from "../../src/lib/service-errors";
import { ConfirmationActions } from "../../src/ui/confirmation-actions";
import { IconButton } from "../../src/ui/icon-button";
import type { ScrollView } from "react-native";
import { Modal } from "../../src/ui/modal";
import { SegmentedControl } from "../../src/ui/segmented-control";
import { SwipeContent } from "../../src/ui/swipe-content";
import { Icon } from "../../src/ui/icon";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { HistorySkeleton } from "../../src/ui/skeleton";
import { useHistoryData } from "../../src/features/training/use-history-data";
import { useCallback, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type VitalSample } from "../../src/domain/vitals";
import { useAuth } from "../../src/features/auth/auth-provider";
import { ClassifyDrink } from "../../src/features/hydration/classify-drink";
import { mlToFluidOunces } from "../../src/features/hydration/model";
import {
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
  type FoodHistoryEntry,
} from "../../src/features/nutrition/repository";
import {
  deleteCardio,
  deleteWorkout,
  type CardioHistoryEntry,
  type WorkoutHistorySession,
  type WorkoutHistorySet,
} from "../../src/features/training/repository";
import { ProgressPhotoGallery } from "../../src/features/progress-photos/progress-photo-gallery";
import { getWeightSampleIdsWithProgressPhotos } from "../../src/features/progress-photos/repository";
import { workoutSetBreakdown } from "../../src/features/training/workout-history";
import { muscleGroupLabel } from "../../src/features/training/workout-draft";
import { markVitalsDeleted, syncVitals } from "../../src/features/vitals/sync";
import { classifyBloodPressure } from "../../src/features/vitals/blood-pressure";
import { pulseForBloodPressure } from "../../src/features/vitals/blood-pressure-pulse";

const historyOptions = [
  { value: "exercise", label: "Workout" },
  { value: "food", label: "Food" },
  { value: "fluids", label: "Fluids" },
  { value: "weight", label: "Weight" },
  { value: "blood_pressure", label: "Blood pressure" },
] as const;

type HistoryView = "exercise" | "blood_pressure" | "weight" | "food" | "fluids";
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
    value === "food" ||
    value === "fluids"
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
  const { session } = useAuth();
  return <HistoryContent key={session?.user.id ?? "signed-out"} />;
}
function HistoryContent() {
  const { view: requestedView, from } = useLocalSearchParams<{
    view?: string;
    from?: string;
  }>();
  const { session, configured } = useAuth();
  const insets = useSafeAreaInsets();
  const [swiping, setSwiping] = useState(false);
  const [view, setView] = useState<HistoryView>(
    () => historyView(requestedView) ?? "exercise",
  );
  const historyScroll = useRef<ScrollView>(null);
  const changeView = (next: HistoryView) => {
    setView(next);
    historyScroll.current?.scrollTo({ y: 0, animated: false });
  };
  const data = useHistoryData(session?.user.id ?? "", configured);
  const { items: history, set: setHistory } = data.workouts;
  const { items: cardio, set: setCardio } = data.cardio;
  const { items: food, set: setFood } = data.food;
  const { items: hydration, set: setHydration } = data.fluids;
  const { items: vitals, set: setVitals } = data.vitals;
  const { refreshing, load } = data;
  const [actionError, setError] = useState("");
  const selected =
    view === "exercise"
      ? [data.workouts, data.cardio]
      : view === "food"
        ? [data.food]
        : view === "fluids"
          ? [data.fluids]
          : [data.vitals];
  const loading = selected.some((r) => r.data === undefined && r.loading);
  const error =
    actionError ||
    selected
      .filter((r) => r.error)
      .map((r) =>
        r.data !== undefined
          ? "Could not update. Saved history is shown."
          : `${r === data.workouts ? "Workouts" : r === data.cardio ? "Cardio" : r === data.food ? "Food" : r === data.fluids ? "Fluids" : "Readings"}: ${serviceErrorMessage({ message: r.error })}`,
      )
      .join(" ") ||
    (["weight", "blood_pressure"].includes(view) ? data.syncError : "");
  const unavailable = selected.some((r) => r.data === undefined && !!r.error);
  const [pendingDeletion, setPendingDeletion] = useState<DeletionRequest>();
  const [photoGalleryWeightId, setPhotoGalleryWeightId] = useState<string>();
  const [weightSampleIdsWithPhotos, setWeightSampleIdsWithPhotos] = useState<
    Set<string>
  >(new Set());
  const photoRequest = useRef(0);
  useEffect(
    () => () => {
      photoRequest.current++;
    },
    [],
  );
  const refreshProgressPhotoIndicators = useCallback(
    async (readings: VitalSample[]) => {
      const request = ++photoRequest.current;
      const userId = session?.user.id;
      if (!configured || !userId) {
        setWeightSampleIdsWithPhotos(new Set());
        return;
      }
      try {
        const ids = readings
          .filter((sample) => sample.kind === "weight" && !sample.deletedAt)
          .map((sample) => sample.id);
        const found = await getWeightSampleIdsWithProgressPhotos(userId, ids);
        if (request === photoRequest.current)
          setWeightSampleIdsWithPhotos(found);
      } catch {
        // History stays usable when the optional indicator metadata is offline.
        // Retain existing indicators after a failed background refresh.
      }
    },
    [configured, session?.user.id],
  );
  useEffect(() => {
    void refreshProgressPhotoIndicators(vitals);
  }, [vitals, refreshProgressPhotoIndicators]);

  useEffect(() => {
    const nextView = historyView(requestedView);
    if (nextView) setView(nextView);
  }, [requestedView]);
  async function removeCardio(cardioId: string) {
    if (!session) return;
    try {
      await deleteCardio(
        session.user.id,
        cardioId,
        cardio.find((item) => item.id === cardioId)?.version ?? 0,
      );
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
      await deleteWorkout(
        session.user.id,
        sessionId,
        history.find((item) => item.id === sessionId)?.version ?? 0,
      );
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
      await deleteFood(
        session.user.id,
        foodId,
        food.find((item) => item.id === foodId)?.version ?? 0,
      );
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
        void deleteHydration(session.user.id, entry.id, entry.version)
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
      setError("Deleted on this device. Waiting to sync.");
      if (configured && session) {
        const result = await syncVitals(session.user.id);
        setError(result.error ? `Deleted on this device. ${result.error}` : "");
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
      {from === "cardio" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.setParams({ from: undefined });
            router.navigate({
              pathname: "/(app)/workout",
              params: { section: "cardio" },
            });
          }}
          style={{
            minHeight: 44,
            justifyContent: "center",
            alignSelf: "flex-start",
          }}
        >
          <Text style={{ color: colors.blue, fontSize: 15, fontWeight: "600" }}>
            Back to cardio
          </Text>
        </Pressable>
      ) : null}
      <Text accessibilityRole="header" style={styles.title}>
        History
      </Text>
      <View style={{ height: 16 }} />
      <SegmentedControl
        label="History category"
        options={historyOptions}
        value={view}
        onChange={changeView}
      />
      {loading ? (
        <HistorySkeleton
          label={historyOptions.find((item) => item.value === view)!.label}
        />
      ) : null}
      {error ? (
        <View style={{ marginBottom: 12 }}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError("");
              void load(true);
            }}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ color: colors.blue }}>Retry history</Text>
          </Pressable>
        </View>
      ) : null}
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
            loading={loading || unavailable}
            onDeleteCardio={confirmRemoveCardio}
            onDeleteWorkout={confirmRemoveWorkout}
          />
        ) : null}
        {view === "blood_pressure" ? (
          <BloodPressureHistory
            readings={bloodPressure}
            loading={loading || unavailable}
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
            loading={loading || unavailable}
            onOpenPhotos={setPhotoGalleryWeightId}
            onDelete={(reading) =>
              confirmRemoveVitals("Delete weight reading?", [reading])
            }
          />
        ) : null}
        {view === "food" ? (
          <FoodHistory
            entries={food}
            loading={loading || unavailable}
            onDelete={confirmRemoveFood}
          />
        ) : null}
        {view === "fluids" ? (
          <FluidHistory
            hydration={hydration}
            loading={loading || unavailable}
            onDeleteHydration={confirmRemoveHydration}
            onHydrationChanged={() => data.fluids.refresh(true)}
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
      {session && photoGalleryWeightId ? (
        <ProgressPhotoGallery
          key={`${session.user.id}/${photoGalleryWeightId}`}
          weightSampleId={photoGalleryWeightId}
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
          <Text accessibilityRole="header" style={styles.modalTitle}>
            {request?.title}
          </Text>
          <Text style={styles.modalCopy}>{request?.message}</Text>
          <ConfirmationActions onCancel={onCancel} onConfirm={onConfirm} />
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

function HistoryNotes({
  notes,
  kind,
}: {
  notes: string;
  kind: "workout" | "cardio";
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.notesSection}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          (expanded ? "Collapse " : "Expand ") + kind + " notes"
        }
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={styles.notesToggle}
      >
        <Text style={styles.notesLabel}>Notes</Text>
        <Text style={styles.notesAction}>
          {expanded ? "Show less" : "Show more"}
        </Text>
        <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}>
          <Icon name="chevron" size={16} color={colors.secondary} />
        </View>
      </Pressable>
      <Text
        style={styles.notes}
        numberOfLines={expanded ? undefined : 2}
        ellipsizeMode="tail"
      >
        {notes}
      </Text>
    </View>
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
          {exercise.sets[0].sideMode === "unilateral" ? (
            <>
              <Text style={styles.detail}>
                L: {exercise.sets.length} x{" "}
                {exercise.sets.map((set) => set.reps).join(", ")} at{" "}
                {exercise.sets[0].weight} {exercise.sets[0].unit}
              </Text>
              <Text style={styles.detail}>
                R: {exercise.sets.length} x{" "}
                {exercise.sets.map((set) => set.rightReps).join(", ")} at{" "}
                {exercise.sets[0].rightWeight} {exercise.sets[0].unit}
              </Text>
            </>
          ) : (
            <Text style={styles.detail}>
              {exercise.sets.length} x{" "}
              {exercise.sets.map((set) => set.reps).join(", ")} at{" "}
              {exercise.sets[0].weight} {exercise.sets[0].unit}
            </Text>
          )}
        </View>
      ))}
      {session.notes ? (
        <HistoryNotes notes={session.notes} kind="workout" />
      ) : null}
      {session.location ? (
        <Text style={styles.location}>Gym: {session.location}</Text>
      ) : null}
      <View style={styles.cardActions}>
        <IconButton
          variant="plain"
          name="edit"
          label="Edit workout"
          onPress={() =>
            router.push({
              pathname: "/(app)/history/[id]",
              params: { id: session.id },
            })
          }
        />
        <IconButton
          variant="plain"
          name="delete"
          label="Delete workout"
          onPress={() => onDelete(session.id)}
          destructive
        />
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
      {entry.source !== "manual" ? (
        <Text style={styles.readingSource}>
          {entry.source === "healthkit" ? "Apple Health" : entry.source}
          {cleanSourceName(entry.sourceName)
            ? ` \u00b7 ${cleanSourceName(entry.sourceName)}`
            : ""}
        </Text>
      ) : null}
      {entry.notes ? <HistoryNotes notes={entry.notes} kind="cardio" /> : null}
      <View style={styles.cardActions}>
        {entry.source === "manual" ? (
          <IconButton
            variant="plain"
            name="edit"
            label="Edit cardio"
            onPress={() =>
              router.push({
                pathname: "/(app)/history/edit",
                params: { id: entry.id, kind: "cardio" },
              })
            }
          />
        ) : null}
        <IconButton
          variant="plain"
          name="delete"
          label={
            entry.source === "healthkit"
              ? "Remove from HealthApp"
              : "Delete cardio"
          }
          onPress={() => onDelete(entry.id)}
          destructive
        />
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
                <IconButton
                  variant="plain"
                  name="edit"
                  label="Edit reading"
                  onPress={() =>
                    router.push({
                      pathname: "/(app)/history/edit",
                      params: { id: systolic.id, kind: "blood_pressure" },
                    })
                  }
                />
              ) : null}
              <IconButton
                variant="plain"
                name="delete"
                label="Delete reading"
                onPress={() => onDelete({ systolic, diastolic })}
                destructive
              />
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
              <IconButton
                variant="plain"
                name="edit"
                label="Edit reading"
                onPress={() =>
                  router.push({
                    pathname: "/(app)/history/edit",
                    params: { id: reading.id, kind: "weight" },
                  })
                }
              />
            ) : null}
            <IconButton
              variant="plain"
              name="delete"
              label="Delete reading"
              onPress={() => onDelete(reading)}
              destructive
            />
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
};
function localHistoryDateKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function groupFoodByDay(entries: FoodHistoryEntry[]): FoodHistoryDay[] {
  const days = new Map<string, FoodHistoryDay>();
  for (const entry of entries) {
    const key = localHistoryDateKey(entry.occurredAt);
    const day = days.get(key) ?? {
      key,
      occurredAt: entry.occurredAt,
      entries: [],
    };
    day.entries.push(entry);
    days.set(key, day);
  }
  return [...days.values()].sort((left, right) =>
    right.key.localeCompare(left.key),
  );
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
  const [selectedDay, setSelectedDay] = useState<FoodHistoryDay>();
  if (!loading && !entries.length)
    return (
      <Empty
        title="No food saved yet"
        copy="Meals and nutrition totals will be grouped here by date."
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
        const totals = dailyNutritionTotals(day.entries, 0);
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
                            <IconButton
                              variant="plain"
                              name="edit"
                              label={`Edit ${food.foodName}`}
                              onPress={() =>
                                router.push({
                                  pathname: "/(app)/history/edit",
                                  params: { id: food.id, kind: "food" },
                                })
                              }
                            />
                          ) : null}
                          <IconButton
                            variant="plain"
                            name="delete"
                            label={`Delete ${food.foodName}`}
                            onPress={() => onDelete(food.id)}
                            destructive
                          />
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

function FluidHistory({
  hydration,
  loading,
  onDeleteHydration,
  onHydrationChanged,
}: {
  hydration: HydrationHistoryEntry[];
  loading: boolean;
  onDeleteHydration: (entry: HydrationHistoryEntry) => void;
  onHydrationChanged: () => Promise<void>;
}) {
  if (!loading && !hydration.length)
    return (
      <Empty
        title="No fluids saved yet"
        copy="Your drinks and daily fluid totals will appear here."
      />
    );
  const days = new Map<string, HydrationHistoryEntry[]>();
  for (const entry of hydration) {
    const key = localHistoryDateKey(entry.occurredAt);
    days.set(key, [...(days.get(key) ?? []), entry]);
  }
  return (
    <>
      {[...days.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([key, fluids]) => {
          const countedMl = fluids.reduce(
            (sum, entry) => sum + (entry.countedMl ?? 0),
            0,
          );
          const pendingMl = fluids.reduce(
            (sum, entry) =>
              sum + (entry.countedMl === null ? entry.volumeMl : 0),
            0,
          );
          const alcoholMl = fluids.reduce(
            (sum, entry) =>
              sum +
              (entry.countingPolicy === "beverage_volume_v1" &&
              entry.alcoholStatus === "alcoholic"
                ? entry.volumeMl
                : 0),
            0,
          );
          return (
            <View key={key} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.date}>
                  {new Intl.DateTimeFormat(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }).format(new Date(fluids[0].occurredAt))}
                </Text>
                <View style={styles.dayTotals}>
                  <Text style={[styles.setTotal, styles.waterTotal]}>
                    {mlToFluidOunces(countedMl)} fl oz fluids
                  </Text>
                  {pendingMl > 0 ? (
                    <Text style={styles.setTotal}>
                      {mlToFluidOunces(pendingMl)} fl oz pending
                    </Text>
                  ) : null}
                  {alcoholMl > 0 ? (
                    <Text style={styles.setTotal}>
                      {mlToFluidOunces(alcoholMl)} fl oz alcohol separately
                    </Text>
                  ) : null}
                </View>
              </View>
              {fluids.length ? (
                <View style={styles.mealGroup}>
                  <Text accessibilityRole="header" style={styles.mealTitle}>
                    Fluids
                  </Text>
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
                      {entry.countedMl === null ||
                      entry.alcoholStatus === "alcoholic" ? (
                        <Text style={styles.detail}>
                          {entry.countedMl === null
                            ? "Needs classification"
                            : "Alcohol logged separately"}
                        </Text>
                      ) : null}
                      <ClassifyDrink
                        entry={entry}
                        onChanged={onHydrationChanged}
                        buttonStyle={{
                          justifyContent: "flex-end",
                          paddingBottom: 4,
                        }}
                      />
                      <View style={[styles.cardActions, { marginTop: 0 }]}>
                        <IconButton
                          variant="plain"
                          name="delete"
                          label={`Delete ${entry.fluidName} entry`}
                          style={{
                            justifyContent: "flex-start",
                            paddingTop: 4,
                          }}
                          onPress={() => onDeleteHydration(entry)}
                          destructive
                        />
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
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
    ? dailyNutritionTotals(day.entries, 0)
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
          <Text accessibilityRole="header" style={styles.modalTitle}>
            Daily totals
          </Text>
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
    backgroundColor: colors.surface,
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
  notesSection: {
    borderTopColor: colors.fill,
    borderTopWidth: 1,
    marginTop: 12,
  },
  notesToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
  notesLabel: {
    flex: 1,
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "600",
  },
  notesAction: { color: colors.blue, fontSize: 13 },
  notes: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 20,
    paddingBottom: 8,
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
    backgroundColor: colors.surface,
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
  progressPhotoButtonFilled: { backgroundColor: colors.greenSoft },
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
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surface,
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
  dailyTotalsCloseText: { color: colors.onAccent, fontWeight: "600" },
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

import { ExerciseHelp } from "../training/exercise-help";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { CoachActionPayload } from "../../../../../supabase/functions/_shared/coach";
import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { trackingStyles as shared } from "../../ui/tracking-styles";
import {
  loadNutritionDraft,
  nutritionDraftHasContent,
} from "../nutrition/draft";
import {
  foodAmountDescription,
  formatFoodMeasurementAmount,
  type MealDraftEntry,
} from "../nutrition/model";
import {
  cardioDraftHasContent,
  loadCardioDraft,
} from "../training/cardio-draft";
import {
  loadWorkoutDraft,
  workoutDraftHasContent,
} from "../training/workout-draft";
import {
  applyCoachMeal,
  applyCoachWorkout,
  mealEntriesFromCoach,
} from "./draft-actions";
import type { CoachAction } from "./repository";

type Mode = "append" | "replace";

export function CoachActionReview({
  userId,
  action,
  onClose,
  onApplied,
  onDismissed,
}: {
  userId: string;
  action?: CoachAction;
  onClose: () => void;
  onApplied: (actionId: string, payload: CoachActionPayload) => Promise<void>;
  onDismissed: (actionId: string) => Promise<void>;
}) {
  const [payload, setPayload] = useState<CoachActionPayload>();
  const [mealEntries, setMealEntries] = useState<MealDraftEntry[]>([]);
  const [hasExisting, setHasExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    setPayload(action?.payload);
    setMealEntries([]);
    setFeedback("");
    if (!action) return () => undefined;
    setLoading(true);
    const load = async () => {
      try {
        if (action.payload.kind === "next_meal") {
          const [entries, draft] = await Promise.all([
            mealEntriesFromCoach(userId, action.payload),
            loadNutritionDraft(userId),
          ]);
          if (active) {
            setMealEntries(entries);
            setHasExisting(Boolean(draft && nutritionDraftHasContent(draft)));
          }
        } else {
          const [workoutDraft, cardioDraft] = await Promise.all([
            loadWorkoutDraft(userId),
            loadCardioDraft(userId),
          ]);
          const usesLifting = action.payload.exercises.length > 0;
          const usesCardio = action.payload.cardio !== null;
          if (active)
            setHasExisting(
              Boolean(
                (usesLifting &&
                  workoutDraft &&
                  workoutDraftHasContent(workoutDraft)) ||
                (usesCardio &&
                  cardioDraft &&
                  cardioDraftHasContent(cardioDraft)),
              ),
            );
        }
      } catch (error) {
        if (active)
          setFeedback(
            error instanceof Error
              ? error.message
              : "Could not load this plan.",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [action, userId]);

  useEffect(() => {
    if (!payload || payload.kind !== "next_meal") return;
    let active = true;
    const timeout = setTimeout(() => {
      void mealEntriesFromCoach(userId, payload)
        .then((entries) => {
          if (active) {
            setMealEntries(entries);
            setFeedback("");
          }
        })
        .catch((error) => {
          if (active)
            setFeedback(
              error instanceof Error ? error.message : "Check the portions.",
            );
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [payload, userId]);

  const nutrition = useMemo(
    () => ({
      calories: mealEntries.reduce(
        (sum, item) => sum + item.totalNutrients.calories,
        0,
      ),
      protein: mealEntries.reduce(
        (sum, item) => sum + item.totalNutrients.proteinGrams,
        0,
      ),
    }),
    [mealEntries],
  );

  if (!action || !payload) return null;

  async function apply(mode: Mode) {
    if (!action || !payload || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      if (payload.kind === "next_meal") {
        const entries = await mealEntriesFromCoach(userId, payload);
        await applyCoachMeal(userId, payload, entries, mode);
      } else {
        if (payload.recommendation !== "rest")
          await applyCoachWorkout(userId, payload, mode);
      }
      await onApplied(action.id, payload);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not apply this plan.",
      );
      setBusy(false);
    }
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close plan review"
            disabled={busy}
            onPress={onClose}
            style={styles.headerButton}
          >
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Review Coach plan</Text>
          <View style={styles.headerButton} />
        </View>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.intro}>
            <Text accessibilityRole="header" style={styles.title}>
              {payload.title}
            </Text>
            <Text style={styles.copy}>{payload.rationale}</Text>
          </View>
          {loading ? (
            <ActivityIndicator accessibilityLabel="Loading plan" />
          ) : null}
          {payload.kind === "next_meal" ? (
            <MealReview
              payload={payload}
              entries={mealEntries}
              onChange={setPayload}
            />
          ) : (
            <WorkoutReview payload={payload} onChange={setPayload} />
          )}
          {payload.kind === "next_meal" && mealEntries.length ? (
            <View style={styles.totalCard}>
              <Text style={styles.totalValue}>
                {Math.round(nutrition.calories)} kcal
              </Text>
              <Text style={styles.totalLabel}>
                {Math.round(nutrition.protein)} g protein · recalculated from
                food labels
              </Text>
            </View>
          ) : null}
          {feedback ? (
            <Text accessibilityLiveRegion="polite" style={shared.error}>
              {feedback}
            </Text>
          ) : null}
          <View style={styles.applyCard}>
            <Text style={shared.section}>
              {hasExisting ? "You already have a draft" : "Ready to add"}
            </Text>
            <Text style={styles.copy}>
              {hasExisting
                ? "Choose whether this plan should be added to or replace your current draft. Cancel is safest if you are unsure."
                : payload.kind === "next_workout" &&
                    payload.recommendation === "rest"
                  ? "Confirm this recommendation. No workout or cardio is recorded."
                  : "This creates an editable draft. It does not record a completed meal or workout."}
            </Text>
            {hasExisting ? (
              <View style={styles.actions}>
                <Action
                  label="Append to draft"
                  disabled={busy || loading}
                  onPress={() => void apply("append")}
                />
                <Action
                  label="Replace draft"
                  destructive
                  disabled={busy || loading}
                  onPress={() => void apply("replace")}
                />
                <Action label="Cancel" disabled={busy} onPress={onClose} />
              </View>
            ) : (
              <Action
                label={
                  busy
                    ? "Applying..."
                    : payload.kind === "next_workout" &&
                        payload.recommendation === "rest"
                      ? "Confirm rest day"
                      : "Apply to draft"
                }
                primary
                disabled={busy || loading || Boolean(feedback)}
                onPress={() => void apply("replace")}
              />
            )}
          </View>
          <Pressable
            disabled={busy}
            onPress={() => void onDismissed(action.id)}
            style={styles.dismiss}
          >
            <Text style={styles.dismissText}>Dismiss suggestion</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function MealReview({
  payload,
  entries,
  onChange,
}: {
  payload: Extract<CoachActionPayload, { kind: "next_meal" }>;
  entries: MealDraftEntry[];
  onChange: (payload: CoachActionPayload) => void;
}) {
  return (
    <View style={styles.stack}>
      <Text style={shared.label}>Meal</Text>
      <View style={styles.chips}>
        {(["breakfast", "lunch", "dinner", "snack"] as const).map((meal) => (
          <Pressable
            key={meal}
            accessibilityRole="radio"
            accessibilityState={{ checked: payload.mealType === meal }}
            onPress={() => onChange({ ...payload, mealType: meal })}
            style={[
              shared.chip,
              payload.mealType === meal && shared.chipActive,
            ]}
          >
            <Text
              style={
                payload.mealType === meal
                  ? shared.chipTextActive
                  : shared.chipText
              }
            >
              {meal[0].toUpperCase() + meal.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      {payload.items.map((item, index) => {
        const entry = entries[index];
        return (
          <View
            key={`${item.profileId ?? item.name}-${index}`}
            style={styles.itemCard}
          >
            <Text style={styles.itemTitle}>{item.name}</Text>
            <View style={styles.amountRow}>
              <TextInput
                accessibilityLabel={`${item.name} amount`}
                keyboardType="decimal-pad"
                value={formatFoodMeasurementAmount(item.amount)}
                onChangeText={(value) => {
                  const amount = Number(value.replace(",", "."));
                  if (!Number.isFinite(amount) || amount <= 0) return;
                  onChange({
                    ...payload,
                    items: payload.items.map((current, itemIndex) =>
                      itemIndex === index ? { ...current, amount } : current,
                    ),
                  });
                }}
                style={[shared.input, styles.amountInput]}
              />
              <Text style={styles.unit}>{item.unit.replace("_", " ")}</Text>
            </View>
            {entry ? (
              <Text style={styles.detail}>
                {foodAmountDescription(
                  entry.amount,
                  entry.unit,
                  entry.householdUnit,
                  entry.servingLabel,
                )}{" "}
                / {Math.round(entry.totalNutrients.calories)} kcal /{" "}
                {Math.round(entry.totalNutrients.proteinGrams)} g protein
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function WorkoutReview({
  payload,
  onChange,
}: {
  payload: Extract<CoachActionPayload, { kind: "next_workout" }>;
  onChange: (payload: CoachActionPayload) => void;
}) {
  const recommendationLabel = {
    lifting: "Lifting",
    cardio: "Cardio",
    combo: "Lifting + cardio",
    rest: "Rest day",
  }[payload.recommendation];
  return (
    <View style={styles.stack}>
      <View style={styles.typeCard}>
        <Text style={shared.label}>Recommendation</Text>
        <Text style={styles.itemTitle}>{recommendationLabel}</Text>
        <Text style={styles.detail}>
          RIR means reps you could still complete with good form. For bodyweight
          movements, enter 0 lb when logging.
        </Text>
      </View>
      {payload.recommendation === "rest" ? (
        <View style={styles.itemCard}>
          <Text style={styles.itemTitle}>Recovery day</Text>
          <Text style={styles.detail}>
            The Coach used your recent training frequency, progression, and
            recovery context. Confirming does not record a workout.
          </Text>
        </View>
      ) : null}
      {payload.exercises.map((exercise, index) => (
        <View key={`${exercise.name}-${index}`} style={styles.itemCard}>
          <Text style={styles.itemTitle}>{exercise.name}</Text>
          <Text style={styles.detail}>{exercise.muscleGroup}</Text>
          {exercise.targetRir != null ? (
            <Text style={styles.detail}>
              {exercise.targetRir} RIR: finish with about {exercise.targetRir}{" "}
              good-form reps left.
            </Text>
          ) : null}
          {exercise.restSeconds != null ? (
            <Text style={styles.detail}>
              Rest {exercise.restSeconds} seconds between sets.
            </Text>
          ) : null}
          {exercise.technique ? (
            <Text style={styles.detail}>{exercise.technique}</Text>
          ) : null}
          <ExerciseHelp
            name={exercise.name}
            isNew={exercise.isNewToHistory ?? false}
          />
          <View style={styles.workoutFields}>
            <ReviewField
              label={`${exercise.name} sets`}
              shortLabel="Sets"
              value={String(exercise.setCount)}
              onValueChange={(value) => {
                const count = Math.min(
                  12,
                  Math.max(1, Math.round(Number(value))),
                );
                if (!Number.isFinite(count)) return;
                const current = exercise.targetReps;
                const reps = Array.from(
                  { length: count },
                  (_, i) => current[i] ?? current.at(-1) ?? 8,
                );
                onChange({
                  ...payload,
                  exercises: payload.exercises.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, setCount: count, targetReps: reps }
                      : item,
                  ),
                });
              }}
            />
            <ReviewField
              label={`${exercise.name} target repetitions`}
              shortLabel="Reps"
              value={exercise.targetReps.join(", ")}
              onValueChange={(value) => {
                const reps = value
                  .split(",")
                  .map(Number)
                  .filter(
                    (item) => Number.isInteger(item) && item > 0 && item <= 500,
                  )
                  .slice(0, exercise.setCount);
                if (!reps.length) return;
                while (reps.length < exercise.setCount) reps.push(reps.at(-1)!);
                onChange({
                  ...payload,
                  exercises: payload.exercises.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, targetReps: reps } : item,
                  ),
                });
              }}
            />
            <ReviewField
              label={`${exercise.name} suggested weight pounds`}
              shortLabel="Weight (lb)"
              value={
                exercise.suggestedWeightLb == null
                  ? ""
                  : String(exercise.suggestedWeightLb)
              }
              placeholder="Optional"
              onValueChange={(value) => {
                const weight = value.trim() ? Number(value) : null;
                if (weight !== null && (!Number.isFinite(weight) || weight < 0))
                  return;
                onChange({
                  ...payload,
                  exercises: payload.exercises.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, suggestedWeightLb: weight }
                      : item,
                  ),
                });
              }}
            />
          </View>
        </View>
      ))}
      {payload.cardio ? (
        <View style={styles.itemCard}>
          <Text style={styles.itemTitle}>Cardio</Text>
          <Text style={shared.label}>Activity</Text>
          <View style={styles.chips}>
            {(["walk", "run", "swim", "tennis", "cycle", "other"] as const).map(
              (activityType) => (
                <Pressable
                  key={activityType}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: payload.cardio?.activityType === activityType,
                  }}
                  onPress={() =>
                    onChange({
                      ...payload,
                      cardio: { ...payload.cardio!, activityType },
                    })
                  }
                  style={[
                    shared.chip,
                    payload.cardio?.activityType === activityType &&
                      shared.chipActive,
                  ]}
                >
                  <Text
                    style={
                      payload.cardio?.activityType === activityType
                        ? shared.chipTextActive
                        : shared.chipText
                    }
                  >
                    {activityType[0].toUpperCase() + activityType.slice(1)}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
          <View style={styles.workoutFields}>
            <ReviewField
              label="Cardio duration minutes"
              shortLabel="Minutes"
              value={String(payload.cardio.durationMinutes)}
              onValueChange={(value) => {
                const durationMinutes = Math.round(Number(value));
                if (
                  !Number.isFinite(durationMinutes) ||
                  durationMinutes < 1 ||
                  durationMinutes > 1440
                )
                  return;
                onChange({
                  ...payload,
                  cardio: { ...payload.cardio!, durationMinutes },
                });
              }}
            />
            <ReviewField
              label="Cardio distance miles"
              shortLabel="Miles (optional)"
              placeholder="Optional"
              value={
                payload.cardio.distanceMiles == null
                  ? ""
                  : String(payload.cardio.distanceMiles)
              }
              onValueChange={(value) => {
                const distanceMiles = value.trim() ? Number(value) : null;
                if (
                  distanceMiles !== null &&
                  (!Number.isFinite(distanceMiles) || distanceMiles < 0)
                )
                  return;
                onChange({
                  ...payload,
                  cardio: { ...payload.cardio!, distanceMiles },
                });
              }}
            />
          </View>
          <Text style={shared.label}>Intensity</Text>
          <View style={styles.chips}>
            {(["easy", "moderate", "hard"] as const).map((intensity) => (
              <Pressable
                key={intensity}
                accessibilityRole="radio"
                accessibilityState={{
                  selected: payload.cardio?.intensity === intensity,
                }}
                onPress={() =>
                  onChange({
                    ...payload,
                    cardio: { ...payload.cardio!, intensity },
                  })
                }
                style={[
                  shared.chip,
                  payload.cardio?.intensity === intensity && shared.chipActive,
                ]}
              >
                <Text
                  style={
                    payload.cardio?.intensity === intensity
                      ? shared.chipTextActive
                      : shared.chipText
                  }
                >
                  {intensity[0].toUpperCase() + intensity.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={shared.label}>Notes (optional)</Text>
          <TextInput
            accessibilityLabel="Cardio plan notes"
            multiline
            maxLength={200}
            placeholder="Pace, intervals, or recovery guidance"
            placeholderTextColor={colors.tertiary}
            style={[shared.input, styles.notes]}
            value={payload.cardio.notes}
            onChangeText={(notes) =>
              onChange({
                ...payload,
                cardio: { ...payload.cardio!, notes },
              })
            }
          />
        </View>
      ) : null}
    </View>
  );
}

function ReviewField({
  shortLabel,
  label,
  onValueChange,
  ...props
}: {
  shortLabel: string;
  label: string;
  onValueChange: (value: string) => void;
} & Omit<React.ComponentProps<typeof TextInput>, "onChange" | "onChangeText">) {
  return (
    <View style={styles.reviewField}>
      <Text style={shared.label}>{shortLabel}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        keyboardType="numbers-and-punctuation"
        onChangeText={onValueChange}
        placeholderTextColor={colors.tertiary}
        style={shared.input}
      />
    </View>
  );
}

function Action({
  label,
  primary,
  destructive,
  disabled,
  onPress,
}: {
  label: string;
  primary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, primary && styles.actionPrimary]}
    >
      <Text
        style={[
          styles.actionText,
          primary && styles.actionTextPrimary,
          destructive && styles.destructive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  headerButton: { justifyContent: "center", minHeight: 44, minWidth: 70 },
  headerTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  link: { color: colors.blue, fontSize: 16 },
  content: {
    alignSelf: "center",
    gap: 18,
    maxWidth: 680,
    padding: 20,
    width: "100%",
  },
  intro: { gap: 7 },
  title: { color: colors.text, fontSize: 27, fontWeight: "700" },
  copy: { color: colors.secondary, fontSize: 15, lineHeight: 22 },
  detail: { color: colors.secondary, fontSize: 13, lineHeight: 19 },
  stack: { gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  itemCard: { ...shared.card, gap: 10 },
  typeCard: { ...shared.card, backgroundColor: colors.blueSoft, gap: 4 },
  itemTitle: { color: colors.text, fontSize: 17, fontWeight: "600" },
  amountRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  amountInput: { maxWidth: 130 },
  unit: { color: colors.secondary, fontSize: 15 },
  workoutFields: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  notes: { minHeight: 76, textAlignVertical: "top" },
  reviewField: { flexBasis: 130, flexGrow: 1 },
  totalCard: {
    backgroundColor: colors.blueSoft,
    borderRadius: 16,
    gap: 4,
    padding: 15,
  },
  totalValue: { color: colors.text, fontSize: 20, fontWeight: "700" },
  totalLabel: { color: colors.secondary, fontSize: 13 },
  applyCard: { ...shared.card, gap: 12 },
  actions: { gap: 9 },
  action: {
    alignItems: "center",
    backgroundColor: colors.fill,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 50,
    padding: 12,
  },
  actionPrimary: { backgroundColor: colors.blue },
  actionText: { color: colors.blue, fontSize: 15, fontWeight: "600" },
  actionTextPrimary: { color: colors.onAccent },
  destructive: { color: "#B42318" },
  dismiss: { alignItems: "center", minHeight: 48, justifyContent: "center" },
  dismissText: { color: colors.secondary, fontSize: 15 },
});

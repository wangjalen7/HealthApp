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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { VitalSample } from "../../../src/domain/vitals";
import { useAuth } from "../../../src/features/auth/auth-provider";
import {
  availableFoodUnits,
  calculateFoodAmount,
  foodBasisFromHistorySnapshot,
  foodUnitLabel,
  type FoodBasis,
  type FoodUnit,
} from "../../../src/features/nutrition/model";
import {
  getFoodById,
  updateFoodHistoryEntry,
  type FoodHistoryEntry,
} from "../../../src/features/nutrition/repository";
import {
  getCardioById,
  updateCardio,
  type CardioHistoryEntry,
  type CardioInput,
} from "../../../src/features/training/repository";
import { createId } from "../../../src/features/vitals/storage";
import {
  loadCachedVitals,
  queueLocalVitals,
  syncVitals,
} from "../../../src/features/vitals/sync";

type EditKind = "cardio" | "weight" | "blood_pressure" | "food";
type HistoryView = "exercise" | "weight" | "blood_pressure" | "food";
const activities: CardioInput["activityType"][] = [
  "walk",
  "run",
  "swim",
  "tennis",
  "cycle",
  "other",
];
const meals: FoodHistoryEntry["mealType"][] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "meal",
];

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseKind(value: string | undefined): EditKind | undefined {
  return value === "cardio" ||
    value === "weight" ||
    value === "blood_pressure" ||
    value === "food"
    ? value
    : undefined;
}

function historyViewForKind(kind: EditKind | undefined): HistoryView {
  if (kind === "cardio") return "exercise";
  if (kind === "blood_pressure") return "blood_pressure";
  if (kind === "weight") return "weight";
  return "food";
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Nutrition values must be zero or greater.");
  }
  return parsed;
}

export default function EditHistoryScreen() {
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const id = scalar(params.id);
  const kind = parseKind(scalar(params.kind));
  const { session, configured } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cardio, setCardio] = useState<CardioHistoryEntry>();
  const [vitalSamples, setVitalSamples] = useState<VitalSample[]>([]);
  const [food, setFood] = useState<FoodHistoryEntry>();

  const [activityType, setActivityType] =
    useState<CardioInput["activityType"]>("walk");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [weight, setWeight] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [mealType, setMealType] =
    useState<FoodHistoryEntry["mealType"]>("meal");
  const [foodBasis, setFoodBasis] = useState<FoodBasis>();
  const [foodAmount, setFoodAmount] = useState("1");
  const [foodUnit, setFoodUnit] = useState<FoodUnit>("serving");

  const load = useCallback(async () => {
    if (!session || !id || !kind) {
      setError("This history entry could not be identified.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (kind === "cardio") {
        const entry = await getCardioById(session.user.id, id);
        if (!entry) throw new Error("Cardio entry not found.");
        if (entry.source !== "manual") {
          throw new Error("Imported cardio is read-only.");
        }
        setCardio(entry);
        setActivityType(entry.activityType);
        setDuration(String(entry.durationMinutes));
        setDistance(
          entry.distanceMiles === undefined ? "" : String(entry.distanceMiles),
        );
        setNotes(entry.notes ?? "");
      } else if (kind === "food") {
        const entry = await getFoodById(session.user.id, id);
        if (!entry) throw new Error("Food entry not found.");
        if (entry.source === "import")
          throw new Error("Imported food is read-only.");
        setFood(entry);
        setMealType(entry.mealType);
        setFoodAmount(String(entry.amount));
        setFoodUnit(entry.unit);
        setFoodBasis(
          foodBasisFromHistorySnapshot({
            name: entry.foodName,
            brand: entry.brand,
            source: entry.source,
            servingLabel: entry.servingLabel,
            householdQuantityPerServing: entry.householdQuantityPerServing,
            householdUnit: entry.householdUnit,
            amount: entry.amount,
            unit: entry.unit,
            servingCount: entry.servingCount,
            consumedWeightGrams: entry.consumedWeightGrams,
            consumedVolumeMl: entry.consumedVolumeMl,
            totalNutrients: {
              calories: entry.calories,
              proteinGrams: entry.proteinGrams,
              carbohydrateGrams: entry.carbohydrateGrams,
              fatGrams: entry.fatGrams,
              fiberGrams: entry.fiberGrams,
              sugarGrams: entry.sugarGrams,
              sodiumMg: entry.sodiumMg,
            },
          }),
        );
        setNotes(entry.note ?? "");
      } else {
        if (configured) await syncVitals(session.user.id);
        const samples = (await loadCachedVitals(session.user.id)).filter(
          (sample) => !sample.deletedAt,
        );
        const selected = samples.find((sample) => sample.id === id);
        if (!selected) throw new Error("Health reading not found.");
        if (selected.source !== "manual") {
          throw new Error("Apple Health and imported readings are read-only.");
        }
        if (kind === "weight") {
          if (selected.kind !== "weight")
            throw new Error("Weight reading not found.");
          setVitalSamples([selected]);
          setWeight(String(selected.value));
        } else {
          const related = selected.correlationId
            ? samples.filter(
                (sample) => sample.correlationId === selected.correlationId,
              )
            : samples.filter(
                (sample) => sample.occurredAt === selected.occurredAt,
              );
          if (related.some((sample) => sample.source !== "manual")) {
            throw new Error(
              "Apple Health and imported readings are read-only.",
            );
          }
          const systolicSample = related.find(
            (sample) => sample.kind === "systolic_bp",
          );
          const diastolicSample = related.find(
            (sample) => sample.kind === "diastolic_bp",
          );
          if (!systolicSample || !diastolicSample) {
            throw new Error(
              "The complete blood-pressure reading was not found.",
            );
          }
          setVitalSamples(related);
          setSystolic(String(systolicSample.value));
          setDiastolic(String(diastolicSample.value));
          const pulseSample = related.find((sample) => sample.kind === "pulse");
          setPulse(pulseSample ? String(pulseSample.value) : "");
        }
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load this entry.",
      );
    } finally {
      setLoading(false);
    }
  }, [configured, id, kind, session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function save() {
    if (!session || !id || !kind) return;
    setSaving(true);
    setError("");
    try {
      if (kind === "cardio") {
        const durationMinutes = Number(duration);
        const distanceMiles = optionalNumber(distance);
        if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
          throw new Error(
            "Duration must be a positive whole number of minutes.",
          );
        }
        await updateCardio(session.user.id, id, {
          activityType,
          durationMinutes,
          distanceMiles,
          notes,
        });
      } else if (kind === "food") {
        if (!foodBasis) throw new Error("Food serving details are missing.");
        const amount = Number(foodAmount.replace(",", "."));
        if (!Number.isFinite(amount) || amount <= 0)
          throw new Error("Enter an amount greater than zero.");
        const calculated = calculateFoodAmount(foodBasis, amount, foodUnit);
        await updateFoodHistoryEntry(session.user.id, id, {
          mealType,
          amount,
          unit: foodUnit,
          ...calculated,
          note: notes,
        });
      } else if (kind === "weight") {
        const value = Number(weight);
        const sample = vitalSamples.find((item) => item.kind === "weight");
        if (!sample || sample.source !== "manual")
          throw new Error("Weight reading not found.");
        if (!Number.isFinite(value) || value <= 0)
          throw new Error("Enter a positive weight.");
        await queueLocalVitals([{ ...sample, value }]);
        if (configured) await syncVitals(session.user.id);
      } else {
        const systolicValue = Number(systolic);
        const diastolicValue = Number(diastolic);
        const pulseValue = pulse.trim() ? Number(pulse) : undefined;
        if (
          !Number.isFinite(systolicValue) ||
          systolicValue <= 0 ||
          !Number.isFinite(diastolicValue) ||
          diastolicValue <= 0 ||
          (pulseValue !== undefined &&
            (!Number.isFinite(pulseValue) || pulseValue <= 0))
        ) {
          throw new Error(
            "Enter positive systolic and diastolic values. Pulse is optional.",
          );
        }
        const systolicSample = vitalSamples.find(
          (item) => item.kind === "systolic_bp",
        );
        const diastolicSample = vitalSamples.find(
          (item) => item.kind === "diastolic_bp",
        );
        const existingPulse = vitalSamples.find(
          (item) => item.kind === "pulse",
        );
        if (!systolicSample || !diastolicSample) {
          throw new Error("The complete blood-pressure reading was not found.");
        }
        const updated: VitalSample[] = [
          { ...systolicSample, value: systolicValue },
          { ...diastolicSample, value: diastolicValue },
        ];
        if (pulseValue !== undefined) {
          updated.push(
            existingPulse
              ? { ...existingPulse, value: pulseValue, deletedAt: undefined }
              : {
                  id: createId(),
                  userId: session.user.id,
                  kind: "pulse",
                  value: pulseValue,
                  unit: "bpm",
                  occurredAt: systolicSample.occurredAt,
                  correlationId: systolicSample.correlationId,
                  source: "manual",
                  createdAt: new Date().toISOString(),
                },
          );
        } else if (existingPulse) {
          updated.push({
            ...existingPulse,
            deletedAt: new Date().toISOString(),
          });
        }
        await queueLocalVitals(updated);
        if (configured) await syncVitals(session.user.id);
      }
      router.replace({
        pathname: "/(app)/history",
        params: { view: historyViewForKind(kind) },
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save changes.",
      );
    } finally {
      setSaving(false);
    }
  }

  const title =
    kind === "blood_pressure"
      ? "Edit blood pressure"
      : kind === "weight"
        ? "Edit weight"
        : kind === "cardio"
          ? "Edit cardio"
          : "Edit food";
  const canEdit = Boolean(cardio || food || vitalSamples.length);
  return (
    <ScreenScrollView
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 18 }]}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.replace({
            pathname: "/(app)/history",
            params: { view: historyViewForKind(kind) },
          })
        }
      >
        <Text style={styles.back}>‹ History</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      {loading ? (
        <ActivityIndicator color={colors.blue} style={styles.loading} />
      ) : null}
      {!loading && kind === "cardio" && cardio ? (
        <>
          <Text style={styles.label}>Activity</Text>
          <ChoiceRow
            choices={activities}
            selected={activityType}
            onSelect={setActivityType}
          />
          <Field
            label="Minutes"
            value={duration}
            onChangeText={setDuration}
            numeric
          />
          <Field
            label="Miles (optional)"
            value={distance}
            onChangeText={setDistance}
            numeric
          />
          <Field
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </>
      ) : null}
      {!loading && kind === "weight" && vitalSamples.length ? (
        <Field
          label={`Weight (${vitalSamples[0].unit})`}
          value={weight}
          onChangeText={setWeight}
          numeric
        />
      ) : null}
      {!loading && kind === "blood_pressure" && vitalSamples.length ? (
        <>
          <Field
            label="Systolic (mmHg)"
            value={systolic}
            onChangeText={setSystolic}
            numeric
          />
          <Field
            label="Diastolic (mmHg)"
            value={diastolic}
            onChangeText={setDiastolic}
            numeric
          />
          <Field
            label="Pulse (bpm, optional)"
            value={pulse}
            onChangeText={setPulse}
            numeric
          />
        </>
      ) : null}
      {!loading && kind === "food" && food ? (
        <>
          <Text style={styles.foodName}>{food.foodName}</Text>
          {food.brand ? (
            <Text style={styles.foodBrand}>{food.brand}</Text>
          ) : null}
          <Text style={styles.help}>
            Change the amount consumed or its unit. Nutrition totals will be
            recalculated from the saved serving.
          </Text>
          {food.servingLabel ? (
            <Text style={styles.serving}>Serving: {food.servingLabel}</Text>
          ) : null}
          <Field
            label="Amount consumed"
            value={foodAmount}
            onChangeText={setFoodAmount}
            numeric
          />
          {foodBasis ? (
            <>
              <Text style={styles.label}>Unit</Text>
              <ChoiceRow
                choices={availableFoodUnits(foodBasis)}
                selected={foodUnit}
                onSelect={setFoodUnit}
                labelForChoice={(choice) =>
                  choice === "household"
                    ? (foodBasis.householdUnit ?? "item")
                    : foodUnitLabel[choice]
                }
              />
            </>
          ) : null}
          <Text style={styles.label}>Meal</Text>
          <ChoiceRow
            choices={meals}
            selected={mealType}
            onSelect={setMealType}
          />
          <Field
            label="Note (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {canEdit ? (
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void save()}
          style={[styles.save, saving && styles.disabled]}
        >
          <Text style={styles.saveText}>
            {saving ? "Saving..." : "Save changes"}
          </Text>
        </Pressable>
      ) : null}
    </ScreenScrollView>
  );
}

function ChoiceRow<T extends string>({
  choices,
  selected,
  onSelect,
  labelForChoice,
}: {
  choices: readonly T[];
  selected: T;
  onSelect: (choice: T) => void;
  labelForChoice?: (choice: T) => string;
}) {
  return (
    <View style={styles.choices}>
      {choices.map((choice) => (
        <Pressable
          key={choice}
          accessibilityState={{ selected: choice === selected }}
          onPress={() => onSelect(choice)}
          style={[styles.choice, choice === selected && styles.choiceActive]}
        >
          <Text
            style={
              choice === selected ? styles.choiceTextActive : styles.choiceText
            }
          >
            {labelForChoice?.(choice) ?? choice.replace("_", " ")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  numeric,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={numeric ? "decimal-pad" : "default"}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholderTextColor="#9FB3C8"
        style={[styles.input, multiline && styles.multiline]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: 20,
    paddingBottom: 44,
  },
  back: {
    color: colors.blue,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1,
    marginBottom: 18,
  },
  loading: { marginTop: 24 },
  help: { color: colors.secondary, lineHeight: 20, marginBottom: 16 },
  foodName: { color: colors.text, fontSize: 19, fontWeight: "600" },
  foodBrand: { color: colors.secondary, fontSize: 13, marginTop: 3 },
  serving: { color: colors.blue, fontWeight: "700", marginBottom: 15 },
  label: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 11,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginBottom: 15,
    padding: 13,
  },
  multiline: { minHeight: 82, textAlignVertical: "top" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 16 },
  choice: {
    backgroundColor: colors.fill,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceActive: { backgroundColor: colors.blue },
  choiceText: {
    color: colors.secondary,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  choiceTextActive: {
    color: "#fff",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  error: { color: "#B42318", lineHeight: 20, marginBottom: 12 },
  save: {
    alignItems: "center",
    backgroundColor: colors.blue,
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 54,
  },
  disabled: { opacity: 0.65 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

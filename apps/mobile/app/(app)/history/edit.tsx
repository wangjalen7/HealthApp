import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { VitalSample } from "../../../src/domain/vitals";
import { useAuth } from "../../../src/features/auth/auth-provider";
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
  const [foodName, setFoodName] = useState("");
  const [brand, setBrand] = useState("");
  const [mealType, setMealType] =
    useState<FoodHistoryEntry["mealType"]>("meal");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [sugar, setSugar] = useState("");
  const [sodium, setSodium] = useState("");

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
        setFoodName(entry.foodName);
        setBrand(entry.brand ?? "");
        setMealType(entry.mealType);
        setCalories(String(entry.calories));
        setProtein(String(entry.proteinGrams));
        setCarbs(
          entry.carbohydrateGrams === undefined
            ? ""
            : String(entry.carbohydrateGrams),
        );
        setFat(entry.fatGrams === undefined ? "" : String(entry.fatGrams));
        setFiber(
          entry.fiberGrams === undefined ? "" : String(entry.fiberGrams),
        );
        setSugar(
          entry.sugarGrams === undefined ? "" : String(entry.sugarGrams),
        );
        setSodium(entry.sodiumMg === undefined ? "" : String(entry.sodiumMg));
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
        const calorieValue = Number(calories);
        const proteinValue = Number(protein);
        if (!foodName.trim()) throw new Error("Enter a food name.");
        if (!Number.isInteger(calorieValue) || calorieValue < 0) {
          throw new Error(
            "Calories must be a whole number of zero or greater.",
          );
        }
        if (!Number.isFinite(proteinValue) || proteinValue < 0) {
          throw new Error("Protein must be zero or greater.");
        }
        await updateFoodHistoryEntry(session.user.id, id, {
          foodName,
          brand,
          mealType,
          calories: calorieValue,
          proteinGrams: proteinValue,
          carbohydrateGrams: optionalNumber(carbs),
          fatGrams: optionalNumber(fat),
          fiberGrams: optionalNumber(fiber),
          sugarGrams: optionalNumber(sugar),
          sodiumMg: optionalNumber(sodium),
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
      router.back();
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
    <ScrollView
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 18 }]}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()}>
        <Text style={styles.back}>‹ History</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      {loading ? (
        <ActivityIndicator color="#16776A" style={styles.loading} />
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
          <Text style={styles.help}>
            Nutrition values are totals for the amount originally logged.
          </Text>
          <Field
            label="Food name"
            value={foodName}
            onChangeText={setFoodName}
          />
          <Field
            label="Brand (optional)"
            value={brand}
            onChangeText={setBrand}
          />
          <Text style={styles.label}>Meal</Text>
          <ChoiceRow
            choices={meals}
            selected={mealType}
            onSelect={setMealType}
          />
          <Field
            label="Calories"
            value={calories}
            onChangeText={setCalories}
            numeric
          />
          <Field
            label="Protein (g)"
            value={protein}
            onChangeText={setProtein}
            numeric
          />
          <Field
            label="Carbohydrates (g, optional)"
            value={carbs}
            onChangeText={setCarbs}
            numeric
          />
          <Field
            label="Fat (g, optional)"
            value={fat}
            onChangeText={setFat}
            numeric
          />
          <Field
            label="Fiber (g, optional)"
            value={fiber}
            onChangeText={setFiber}
            numeric
          />
          <Field
            label="Sugar (g, optional)"
            value={sugar}
            onChangeText={setSugar}
            numeric
          />
          <Field
            label="Sodium (mg, optional)"
            value={sodium}
            onChangeText={setSodium}
            numeric
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
    </ScrollView>
  );
}

function ChoiceRow<T extends string>({
  choices,
  selected,
  onSelect,
}: {
  choices: readonly T[];
  selected: T;
  onSelect: (choice: T) => void;
}) {
  return (
    <View style={styles.choices}>
      {choices.map((choice) => (
        <Pressable
          key={choice}
          onPress={() => onSelect(choice)}
          style={[styles.choice, choice === selected && styles.choiceActive]}
        >
          <Text
            style={
              choice === selected ? styles.choiceTextActive : styles.choiceText
            }
          >
            {choice.replace("_", " ")}
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
    backgroundColor: "#F7FAFC",
    flexGrow: 1,
    padding: 20,
    paddingBottom: 44,
  },
  back: { color: "#16776A", fontSize: 16, fontWeight: "800", marginBottom: 12 },
  title: {
    color: "#102A43",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 18,
  },
  loading: { marginTop: 24 },
  help: { color: "#627D98", lineHeight: 20, marginBottom: 16 },
  label: { color: "#486581", fontSize: 13, fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 11,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 16,
    marginBottom: 15,
    padding: 13,
  },
  multiline: { minHeight: 82, textAlignVertical: "top" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 16 },
  choice: {
    backgroundColor: "#E6EEF3",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceActive: { backgroundColor: "#16776A" },
  choiceText: {
    color: "#486581",
    fontWeight: "700",
    textTransform: "capitalize",
  },
  choiceTextActive: {
    color: "#fff",
    fontWeight: "800",
    textTransform: "capitalize",
  },
  error: { color: "#B42318", lineHeight: 20, marginBottom: 12 },
  save: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 54,
  },
  disabled: { opacity: 0.65 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});

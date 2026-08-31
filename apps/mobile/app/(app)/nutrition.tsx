import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../src/features/auth/auth-provider";
import {
  getFoodSuggestions,
  saveMeal,
  type FoodInput,
  type FoodSuggestion,
} from "../../src/features/training/repository";
import { createId } from "../../src/features/vitals/storage";

type MealType = Exclude<FoodInput["mealType"], "meal">;
type FoodEntry = {
  id: string;
  foodName: string;
  calories: string;
  protein: string;
};

const meals: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const blankFood = (): FoodEntry => ({
  id: createId(),
  foodName: "",
  calories: "",
  protein: "",
});

export default function NutritionScreen() {
  const { session } = useAuth();
  const [mealType, setMealType] = useState<MealType>();
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<string>();
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const request = useRef(0);

  function updateEntry(id: string, patch: Partial<FoodEntry>) {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function addFood() {
    const entry = blankFood();
    setEntries((current) => [...current, entry]);
    setActiveEntry(entry.id);
    setFeedback("");
  }

  function removeFood(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    if (activeEntry === id) {
      setActiveEntry(undefined);
      setSuggestions([]);
    }
  }

  async function searchSavedFoods(entryId: string, query: string) {
    setActiveEntry(entryId);
    if (!session || !query.trim()) {
      setSuggestions([]);
      return;
    }
    const current = ++request.current;
    try {
      const matches = await getFoodSuggestions(session.user.id, query);
      if (current === request.current) setSuggestions(matches);
    } catch {
      if (current === request.current) setSuggestions([]);
    }
  }

  function chooseFood(entryId: string, item: FoodSuggestion) {
    updateEntry(entryId, {
      foodName: item.name,
      calories: String(item.calories),
      protein: String(item.proteinGrams),
    });
    setSuggestions([]);
    setActiveEntry(undefined);
  }

  async function save() {
    if (!session) return setFeedback("Please sign in before saving.");
    if (!mealType) return setFeedback("Choose a meal first.");
    if (!entries.length) return setFeedback("Add at least one food.");
    const foods = entries.map((entry) => ({
      foodName: entry.foodName.trim(),
      calories: Number(entry.calories),
      proteinGrams: Number(entry.protein),
    }));
    const invalid = foods.some(
      (food, index) =>
        !food.foodName ||
        !Number.isInteger(food.calories) ||
        food.calories < 0 ||
        !Number.isFinite(food.proteinGrams) ||
        food.proteinGrams < 0 ||
        entries[index].calories.trim() === "" ||
        entries[index].protein.trim() === "",
    );
    if (invalid)
      return setFeedback(
        "Complete the name, calories, and protein for every food or remove incomplete foods.",
      );

    setSaving(true);
    setFeedback("");
    try {
      await saveMeal(session.user.id, mealType, foods);
      setEntries([]);
      setSuggestions([]);
      setFeedback(
        "Meal saved. These foods will be suggested when you type them again.",
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save this meal.",
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
      <Text style={styles.title}>Food</Text>
      <Text style={styles.copy}>
        Build a meal from your own foods. Previously saved foods appear as you
        type; nothing is preloaded.
      </Text>

      <Text style={styles.label}>1. Meal</Text>
      <View style={styles.chips}>
        {meals.map((meal) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mealType === meal }}
            key={meal}
            onPress={() => {
              setMealType(meal);
              setFeedback("");
            }}
            style={[styles.chip, mealType === meal && styles.chipActive]}
          >
            <Text
              style={
                mealType === meal ? styles.chipTextActive : styles.chipText
              }
            >
              {meal}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.foodBar}>
        <Text style={styles.label}>2. Foods</Text>
        <Pressable
          accessibilityRole="button"
          onPress={addFood}
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>+ Add food</Text>
        </Pressable>
      </View>

      {!entries.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Build this meal</Text>
          <Text style={styles.emptyCopy}>
            Choose a meal, then tap Add food to enter the first item.
          </Text>
        </View>
      ) : null}

      {entries.map((entry) => (
        <View key={entry.id} style={styles.foodCard}>
          <View style={styles.foodHeader}>
            <Text style={styles.foodNumber}>FOOD</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => removeFood(entry.id)}
            >
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
          <TextInput
            accessibilityLabel="Food name"
            onChangeText={(foodName) => {
              updateEntry(entry.id, { foodName });
              void searchSavedFoods(entry.id, foodName);
            }}
            onFocus={() => void searchSavedFoods(entry.id, entry.foodName)}
            placeholder="Search saved foods or enter a new food"
            placeholderTextColor="#9FB3C8"
            style={styles.input}
            value={entry.foodName}
          />
          {activeEntry === entry.id
            ? suggestions.map((item) => (
                <Pressable
                  key={`${entry.id}-${item.name}`}
                  onPress={() => chooseFood(entry.id, item)}
                  style={styles.suggestion}
                >
                  <Text style={styles.suggestionName}>{item.name}</Text>
                  <Text style={styles.suggestionMeta}>
                    {item.calories} cal / {item.proteinGrams}g protein
                  </Text>
                </Pressable>
              ))
            : null}
          <View style={styles.row}>
            <Field
              label="Calories"
              value={entry.calories}
              onChangeText={(calories) => updateEntry(entry.id, { calories })}
            />
            <Field
              label="Protein (g)"
              value={entry.protein}
              onChangeText={(protein) => updateEntry(entry.id, { protein })}
            />
          </View>
        </View>
      ))}

      {feedback ? (
        <Text
          style={
            feedback.startsWith("Meal saved") ? styles.success : styles.error
          }
        >
          {feedback}
        </Text>
      ) : null}
      <Pressable
        disabled={saving}
        onPress={() => void save()}
        style={[styles.button, saving && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>
          {saving ? "Saving..." : "Save meal"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="#9FB3C8"
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800" },
  copy: { color: "#627D98", lineHeight: 21, marginBottom: 20, marginTop: 7 },
  label: { color: "#486581", fontSize: 14, fontWeight: "800" },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 22,
    marginTop: 9,
  },
  chip: {
    backgroundColor: "#E6EEF3",
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: "#16776A" },
  chipText: {
    color: "#486581",
    fontWeight: "700",
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: "#fff",
    fontWeight: "800",
    textTransform: "capitalize",
  },
  foodBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 9,
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
  foodCard: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 13,
    padding: 14,
  },
  foodHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  foodNumber: {
    color: "#7B8794",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  remove: { color: "#B42318", fontSize: 13, fontWeight: "800" },
  input: {
    backgroundColor: "#F7FAFC",
    borderColor: "#D9E2EC",
    borderRadius: 11,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 16,
    padding: 12,
  },
  suggestion: {
    borderBottomColor: "#E6EEF3",
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  suggestionName: { color: "#243B53", fontWeight: "800" },
  suggestionMeta: { color: "#627D98", fontSize: 13, marginTop: 3 },
  row: { flexDirection: "row", gap: 12, marginTop: 14 },
  field: { flex: 1 },
  fieldLabel: {
    color: "#486581",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  success: { color: "#16776A", fontWeight: "700", marginBottom: 10 },
  error: { color: "#B42318", marginBottom: 10 },
  button: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 13,
    minHeight: 54,
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});

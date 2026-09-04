import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "../../src/features/auth/auth-provider";
import {
  clearNutritionDraft,
  loadNutritionDraft,
  nutritionDraftHasContent,
  saveNutritionDraft,
} from "../../src/features/nutrition/draft";
import { FoodEditor } from "../../src/features/nutrition/food-editor";
import {
  foodAmountDescription,
  type MealDraftEntry,
  type NutritionDraft,
} from "../../src/features/nutrition/model";
import {
  saveNutritionMeal,
  type MealType,
} from "../../src/features/nutrition/repository";

const meals: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function persistDraft(userId: string, draft: NutritionDraft) {
  return nutritionDraftHasContent(draft)
    ? saveNutritionDraft(userId, draft)
    : clearNutritionDraft(userId);
}

export default function NutritionScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [mealType, setMealType] = useState<MealType>();
  const [entries, setEntries] = useState<MealDraftEntry[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPurpose, setEditorPurpose] = useState<"add" | "manage">("add");
  const [editing, setEditing] = useState<MealDraftEntry>();
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const draft = useMemo<NutritionDraft>(
    () => ({ mealType, entries }),
    [entries, mealType],
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    let active = true;
    setMealType(undefined);
    setEntries([]);
    setFeedback("");
    setDraftLoaded(false);
    if (!userId)
      return () => {
        active = false;
      };
    void loadNutritionDraft(userId).then((saved) => {
      if (!active) return;
      if (saved) {
        setMealType(saved.mealType);
        setEntries(saved.entries);
      }
      setDraftLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !draftLoaded) return;
    void persistDraft(userId, draft).catch(() => undefined);
  }, [draft, draftLoaded, userId]);

  useEffect(() => {
    if (!userId || !draftLoaded) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        void persistDraft(userId, draftRef.current).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [draftLoaded, userId]);

  const totals = useMemo(
    () => ({
      calories: entries.reduce(
        (total, entry) => total + entry.totalNutrients.calories,
        0,
      ),
      protein: entries.reduce(
        (total, entry) => total + entry.totalNutrients.proteinGrams,
        0,
      ),
    }),
    [entries],
  );

  function acceptEntry(entry: MealDraftEntry) {
    setEntries((current) => {
      const exists = current.some((item) => item.id === entry.id);
      return exists
        ? current.map((item) => (item.id === entry.id ? entry : item))
        : [...current, entry];
    });
    setEditing(undefined);
    setFeedback("");
  }

  async function save() {
    if (!userId) return setFeedback("Please sign in before saving.");
    if (!mealType) return setFeedback("Choose a meal first.");
    if (!entries.length) return setFeedback("Add at least one food.");
    setSaving(true);
    setFeedback("");
    try {
      await saveNutritionMeal(userId, mealType, entries);
      await clearNutritionDraft(userId);
      setEntries([]);
      setMealType(undefined);
      setFeedback("Meal saved. These foods are now available in My Foods.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save this meal.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function discard() {
    if (userId) await clearNutritionDraft(userId);
    setEntries([]);
    setMealType(undefined);
    setDiscardOpen(false);
    setFeedback("");
  }

  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.title}>Food</Text>
          </View>
          {nutritionDraftHasContent(draft) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setDiscardOpen(true)}
              style={styles.discardButton}
            >
              <Text style={styles.discardText}>Discard</Text>
            </Pressable>
          ) : null}
        </View>

        {draftLoaded && nutritionDraftHasContent(draft) ? (
          <Text style={styles.draftStatus}>
            Unfinished meal saved on this device.
          </Text>
        ) : null}

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
          <View style={styles.foodActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEditing(undefined);
                setEditorPurpose("manage");
                setEditorOpen(true);
                setFeedback("");
              }}
              style={styles.manageLabelsButton}
            >
              <Text style={styles.manageLabelsText}>Manage labels</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEditing(undefined);
                setEditorPurpose("add");
                setEditorOpen(true);
                setFeedback("");
              }}
              style={styles.addButton}
            >
              <Text style={styles.addButtonText}>+ Add food</Text>
            </Pressable>
          </View>
        </View>

        {!entries.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Build this meal</Text>
          </View>
        ) : null}

        {entries.map((entry) => (
          <View key={entry.id} style={styles.foodCard}>
            <View style={styles.foodHeader}>
              <View style={styles.foodIdentity}>
                <Text style={styles.foodName}>{entry.name}</Text>
                {entry.brand ? (
                  <Text style={styles.foodBrand}>{entry.brand}</Text>
                ) : null}
              </View>
            </View>
            <Text style={styles.amountLine}>
              {foodAmountDescription(
                entry.amount,
                entry.unit,
                entry.householdUnit,
                entry.servingLabel,
              )}
            </Text>
            <Text style={styles.nutritionLine}>
              {entry.totalNutrients.calories} cal ·{" "}
              {Math.round(entry.totalNutrients.proteinGrams * 10) / 10}g protein
            </Text>
            {entry.note ? (
              <Text style={styles.note}>Note: {entry.note}</Text>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setEditing(entry);
                  setEditorPurpose("add");
                  setEditorOpen(true);
                }}
                style={styles.editButton}
              >
                <Text style={styles.editText}>Edit amount</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setEntries((current) =>
                    current.filter((item) => item.id !== entry.id),
                  )
                }
                style={styles.removeButton}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {entries.length ? (
          <View style={styles.totalCard}>
            <View>
              <Text style={styles.totalEyebrow}>MEAL TOTAL</Text>
              <Text style={styles.totalValue}>{totals.calories} calories</Text>
            </View>
            <Text style={styles.totalProtein}>
              {Math.round(totals.protein * 10) / 10}g protein
            </Text>
          </View>
        ) : null}

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
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void save()}
          style={[styles.saveButton, saving && styles.buttonDisabled]}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Save meal"}
          </Text>
        </Pressable>
      </ScrollView>

      {userId ? (
        <FoodEditor
          initial={editing}
          labelManagementOnly={editorPurpose === "manage"}
          onClose={() => {
            setEditorOpen(false);
            setEditing(undefined);
          }}
          onSave={acceptEntry}
          userId={userId}
          visible={editorOpen}
        />
      ) : null}

      <Modal
        animationType="fade"
        onRequestClose={() => setDiscardOpen(false)}
        transparent
        visible={discardOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Discard unfinished meal?</Text>
            <Text style={styles.modalCopy}>
              This clears the meal saved on this device. Completed food history
              is not affected.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setDiscardOpen(false)}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Keep meal</Text>
              </Pressable>
              <Pressable
                onPress={() => void discard()}
                style={styles.modalDelete}
              >
                <Text style={styles.modalDeleteText}>Discard</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  titleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    marginBottom: 15,
  },
  titleCopy: { flex: 1 },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800" },
  discardButton: {
    borderColor: "#F1AEB5",
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  discardText: { color: "#B42318", fontSize: 12, fontWeight: "800" },
  draftStatus: {
    backgroundColor: "#E6F7F3",
    borderRadius: 9,
    color: "#16776A",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 17,
    overflow: "hidden",
    padding: 9,
  },
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
  foodActions: { alignItems: "center", flexDirection: "row", gap: 7 },
  manageLabelsButton: {
    borderColor: "#B7D9D1",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  manageLabelsText: { color: "#16776A", fontSize: 12, fontWeight: "800" },
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
  foodCard: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  foodHeader: { alignItems: "flex-start", flexDirection: "row" },
  foodIdentity: { flex: 1 },
  foodName: { color: "#102A43", fontSize: 17, fontWeight: "800" },
  foodBrand: {
    color: "#486581",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  amountLine: { color: "#627D98", fontSize: 13, marginTop: 9 },
  nutritionLine: {
    color: "#243B53",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 5,
  },
  note: { color: "#7B8794", fontSize: 12, fontStyle: "italic", marginTop: 7 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  editButton: {
    backgroundColor: "#E6F7F3",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editText: { color: "#16776A", fontSize: 13, fontWeight: "800" },
  removeButton: {
    borderColor: "#F1AEB5",
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeText: { color: "#B42318", fontSize: 13, fontWeight: "800" },
  totalCard: {
    alignItems: "center",
    backgroundColor: "#102A43",
    borderRadius: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    padding: 15,
  },
  totalEyebrow: {
    color: "#A7C7D4",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  totalValue: { color: "#fff", fontSize: 19, fontWeight: "800", marginTop: 3 },
  totalProtein: { color: "#D8F3EB", fontWeight: "800" },
  success: { color: "#16776A", fontWeight: "700", marginBottom: 10 },
  error: { color: "#B42318", marginBottom: 10 },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 54,
  },
  buttonDisabled: { opacity: 0.65 },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
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

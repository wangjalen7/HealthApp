import { trackingStyles } from "../../src/ui/tracking-styles";
import { Modal } from "../../src/ui/modal";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { Icon } from "../../src/ui/icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../../src/features/auth/auth-provider";
import {
  clearNutritionDraft,
  loadNutritionDraft,
  nutritionDraftHasContent,
  saveNutritionDraft,
} from "../../src/features/nutrition/draft";
import { FoodEditor } from "../../src/features/nutrition/food-editor";
import { AiMealEditor } from "../../src/features/nutrition/ai-meal-editor";
import {
  appendEstimatedEntries,
  deduplicateAiDraftEntries,
} from "../../src/features/nutrition/ai-meal";
import { router, useLocalSearchParams } from "expo-router";
import {
  foodAmountDescription,
  type MealDraftEntry,
  type NutritionDraft,
} from "../../src/features/nutrition/model";
import {
  saveFoodProfile,
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
  const { estimate } = useLocalSearchParams<{ estimate?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [mealType, setMealType] = useState<MealType>();
  const [entries, setEntries] = useState<MealDraftEntry[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
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
    if (estimate === "true" && draftLoaded) {
      setAiOpen(true);
      router.setParams({ estimate: "" });
    }
  }, [estimate, draftLoaded]);

  async function acceptEstimates(added: MealDraftEntry[]) {
    if (!userId || !draftLoaded)
      throw new Error("Please wait for your meal draft to load.");
    appendEstimatedEntries(draftRef.current.entries, added);
    const profiled: MealDraftEntry[] = [];
    for (const entry of added) {
      const profile = await saveFoodProfile(userId, entry);
      profiled.push({ ...entry, ...profile });
    }
    const next = appendEstimatedEntries(draftRef.current.entries, profiled);
    await saveNutritionDraft(userId, {
      mealType: draftRef.current.mealType,
      entries: next,
    });
    setEntries(next);
    setFeedback("");
  }

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
        setEntries(deduplicateAiDraftEntries(saved.entries));
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
      setFeedback("Meal saved.");
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
      <ScreenScrollView
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
          <Text style={styles.draftStatus}>Draft saved</Text>
        ) : null}

        <Text style={styles.label}>Meal</Text>
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
          <Text style={styles.label}>Foods</Text>
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
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Estimate meal with AI from a photo or description"
          disabled={saving || !draftLoaded}
          onPress={() => setAiOpen(true)}
          style={[
            styles.aiEstimateButton,
            (saving || !draftLoaded) && styles.buttonDisabled,
          ]}
        >
          <Icon name="sparkles" size={24} color={colors.surface} />
          <View style={styles.aiEstimateCopy}>
            <Text style={styles.aiEstimateTitle}>
              Estimate meal from photo or text
            </Text>
            <Text style={styles.aiEstimateSubtitle}>
              AI creates editable food labels and portions
            </Text>
          </View>
        </Pressable>

        {!mealType ? (
          <View style={styles.empty}>
            <Icon name="food" size={22} color={colors.orange} />
            <Text style={styles.emptyTitle}>Choose a meal to get started</Text>
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

        <Pressable
          accessibilityRole="button"
          disabled={!mealType || saving || !draftLoaded}
          onPress={() => {
            setEditing(undefined);
            setEditorPurpose("add");
            setEditorOpen(true);
            setFeedback("");
          }}
          style={[
            styles.addButton,
            (!mealType || saving || !draftLoaded) && styles.buttonDisabled,
          ]}
        >
          <Icon name="plus" size={20} color={colors.surface} />
          <Text style={styles.addButtonText}>Add food</Text>
        </Pressable>

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
          disabled={saving || !draftLoaded || !mealType || !entries.length}
          onPress={() => void save()}
          style={[
            styles.saveButton,
            (saving || !draftLoaded || !mealType || !entries.length) &&
              styles.buttonDisabled,
          ]}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Save meal"}
          </Text>
        </Pressable>
      </ScreenScrollView>

      {userId ? (
        <AiMealEditor
          key={userId}
          visible={aiOpen}
          onClose={() => setAiOpen(false)}
          onAdd={acceptEstimates}
        />
      ) : null}

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
  page: trackingStyles.page,
  titleRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  titleCopy: { flex: 1 },
  title: trackingStyles.title,
  discardButton: {
    borderColor: "#F1AEB5",
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  discardText: { color: "#B42318", fontSize: 12, fontWeight: "600" },
  draftStatus: {
    backgroundColor: colors.blueSoft,
    borderRadius: 9,
    color: colors.blue,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 17,
    overflow: "hidden",
    padding: 9,
  },
  label: trackingStyles.label,
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: trackingStyles.chip,
  chipActive: trackingStyles.chipActive,
  chipText: { ...trackingStyles.chipText, textTransform: "capitalize" },
  chipTextActive: {
    ...trackingStyles.chipTextActive,
    textTransform: "capitalize",
  },
  foodBar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 9,
  },
  foodActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  manageLabelsButton: {
    paddingHorizontal: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  manageLabelsText: { color: colors.blue, fontSize: 14, fontWeight: "600" },
  aiEstimateButton: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 16,
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    minHeight: 68,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  aiEstimateCopy: { flex: 1, gap: 3 },
  aiEstimateTitle: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  aiEstimateSubtitle: {
    color: "#F3EAFF",
    fontSize: 13,
    lineHeight: 18,
  },
  addButton: trackingStyles.listAddButton,
  addButtonText: trackingStyles.listAddButtonText,
  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
    padding: 18,
  },
  emptyTitle: { color: colors.secondary, fontWeight: "500", flex: 1 },
  foodCard: { ...trackingStyles.card, marginBottom: 12 },
  foodHeader: { alignItems: "flex-start", flexDirection: "row" },
  foodIdentity: { flex: 1 },
  foodName: trackingStyles.section,
  foodBrand: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  amountLine: { color: colors.secondary, fontSize: 13, marginTop: 9 },
  nutritionLine: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginTop: 5,
  },
  note: {
    color: colors.tertiary,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 7,
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  editButton: {
    backgroundColor: colors.blueSoft,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editText: { color: colors.blue, fontSize: 13, fontWeight: "600" },
  removeButton: {
    borderColor: "#F1AEB5",
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeText: { color: "#B42318", fontSize: 13, fontWeight: "600" },
  totalCard: {
    ...trackingStyles.card,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  totalEyebrow: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  totalValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    marginTop: 4,
  },
  totalProtein: { color: colors.secondary, fontSize: 15, fontWeight: "600" },
  success: trackingStyles.success,
  error: trackingStyles.error,
  saveButton: trackingStyles.button,
  buttonDisabled: { opacity: 0.65 },
  saveButtonText: trackingStyles.buttonText,
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

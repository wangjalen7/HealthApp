import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmationActions } from "../../ui/confirmation-actions";
import { IconButton } from "../../ui/icon-button";
import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { AiMealEditor } from "./ai-meal-editor";
import { FoodEditor } from "./food-editor";
import {
  foodAmountDescription,
  formatFoodMeasurementAmount,
  parseFoodMeasurementAmount,
  type MealDraftEntry,
} from "./model";
import {
  archiveFoodRecipe,
  getFoodRecipes,
  saveFoodProfile,
  saveFoodRecipe,
} from "./repository";
import {
  recipeFoodBasis,
  recipeTotalNutrients,
  type FoodRecipe,
} from "./recipe";

type RecipeManagerMode = "list" | "create";
type RecipeEditorLayer = "ingredient" | "ai";

export function RecipeManager({
  onClose,
  onLog,
  userId,
  visible,
}: {
  onClose: () => void;
  onLog: (recipe: FoodRecipe) => void;
  userId: string;
  visible: boolean;
}) {
  const [mode, setMode] = useState<RecipeManagerMode>("list");
  const [recipes, setRecipes] = useState<FoodRecipe[]>([]);
  const [ingredients, setIngredients] = useState<MealDraftEntry[]>([]);
  const [activeEditor, setActiveEditor] = useState<RecipeEditorLayer>();
  const [pendingEditor, setPendingEditor] = useState<RecipeEditorLayer>();
  const [dismissingEditor, setDismissingEditor] =
    useState<RecipeEditorLayer>();
  const [editingIngredient, setEditingIngredient] =
    useState<MealDraftEntry>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [yieldServings, setYieldServings] = useState("1");
  const [pendingDelete, setPendingDelete] = useState<FoodRecipe>();

  const totals = useMemo(
    () => (ingredients.length ? recipeTotalNutrients(ingredients) : undefined),
    [ingredients],
  );
  const parsedYield = parseFoodMeasurementAmount(yieldServings);

  useEffect(() => {
    if (!visible) return;
    setMode("list");
    setFeedback("");
    setPendingDelete(undefined);
    setActiveEditor(undefined);
    setPendingEditor(undefined);
    setDismissingEditor(undefined);
    setEditingIngredient(undefined);
    let active = true;
    setLoading(true);
    void getFoodRecipes(userId)
      .then((items) => {
        if (active) setRecipes(items);
      })
      .catch((error) => {
        if (active) {
          setFeedback(
            error instanceof Error ? error.message : "Could not load recipes.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, visible]);

  function beginCreate() {
    setName("");
    setDescription("");
    setYieldServings("1");
    setIngredients([]);
    setFeedback("");
    setMode("create");
  }

  function openEditor(layer: RecipeEditorLayer) {
    if (Platform.OS === "ios") {
      setPendingEditor(layer);
      return;
    }
    setActiveEditor(layer);
  }

  function closeEditor(layer: RecipeEditorLayer) {
    if (Platform.OS === "ios") {
      setDismissingEditor(layer);
    }
    setActiveEditor(undefined);
  }

  function parentSheetDismissed() {
    if (Platform.OS !== "ios" || !pendingEditor || dismissingEditor) return;
    setActiveEditor(pendingEditor);
    setPendingEditor(undefined);
  }

  function childEditorDismissed() {
    if (Platform.OS !== "ios") return;
    setDismissingEditor(undefined);
    if (pendingEditor) {
      setActiveEditor(pendingEditor);
      setPendingEditor(undefined);
    }
  }

  function acceptIngredient(entry: MealDraftEntry) {
    if (entry.recipeId) {
      setFeedback("Recipes cannot contain another recipe.");
      return;
    }
    setIngredients((current) => {
      const exists = current.some((item) => item.id === entry.id);
      return exists
        ? current.map((item) => (item.id === entry.id ? entry : item))
        : [...current, entry];
    });
    setEditingIngredient(undefined);
    setFeedback("");
  }

  async function acceptEstimatedIngredients(entries: MealDraftEntry[]) {
    const additions: MealDraftEntry[] = [];
    for (const entry of entries.filter((item) => !item.recipeId)) {
      if (entry.saveToMyFoods === false) {
        additions.push(entry);
      } else {
        const profile = await saveFoodProfile(userId, entry);
        additions.push({ ...entry, ...profile });
      }
    }
    setIngredients((current) => [...current, ...additions]);
    setFeedback("");
  }

  async function save() {
    if (!ingredients.length)
      return setFeedback("Add at least one ingredient to this recipe.");
    if (!name.trim()) return setFeedback("Enter a recipe name.");
    if (!parsedYield || parsedYield <= 0) {
      return setFeedback(
        "Enter the number of servings this whole recipe makes.",
      );
    }
    setSaving(true);
    setFeedback("");
    try {
      const saved = await saveFoodRecipe(userId, {
        name: name.trim(),
        description: description.trim() || undefined,
        yieldServings: parsedYield,
        ingredients,
      });
      setRecipes((current) => [
        saved,
        ...current.filter((recipe) => recipe.id !== saved.id),
      ]);
      setMode("list");
      setFeedback(`${saved.name} saved as a recipe.`);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save this recipe.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeRecipe() {
    if (!pendingDelete) return;
    setSaving(true);
    setFeedback("");
    try {
      await archiveFoodRecipe(userId, pendingDelete.id);
      setRecipes((current) =>
        current.filter((recipe) => recipe.id !== pendingDelete.id),
      );
      setPendingDelete(undefined);
      setFeedback("Recipe deleted. Past food history is unchanged.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Could not delete this recipe.",
      );
    } finally {
      setSaving(false);
    }
  }

  function back() {
    if (pendingDelete) return setPendingDelete(undefined);
    if (mode === "create") {
      setFeedback("");
      setMode("list");
      return;
    }
    onClose();
  }

  return (
    <>
      {/* iOS cannot reliably present a second native modal over a page sheet.
          Hide this sheet while an editor is active; this component remains
          mounted, so its in-progress recipe draft is preserved. */}
      <Modal
        animationType="slide"
        onDismiss={parentSheetDismissed}
        onRequestClose={back}
        presentationStyle="pageSheet"
        visible={
          visible && !activeEditor && !pendingEditor && !dismissingEditor
        }
      >
        <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={back} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>
              {mode === "create" ? "Back" : "Close"}
            </Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            {mode === "create" ? "Create recipe" : "Recipes"}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {mode === "list" ? (
            <>
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>
                  Build once, log any portion
                </Text>
                <Text style={styles.infoCopy}>
                  Create a recipe here by adding each ingredient and its exact
                  amount. Later, add the finished recipe to a meal as one food.
                </Text>
              </View>
              <Pressable
                onPress={beginCreate}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Create recipe</Text>
              </Pressable>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Saved recipes
              </Text>
              {loading ? <ActivityIndicator color={colors.blue} /> : null}
              {!loading && !recipes.length ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No recipes yet</Text>
                  <Text style={styles.emptyCopy}>
                    A pasta batch might make six servings. A sandwich can make
                    one.
                  </Text>
                </View>
              ) : null}
              {recipes.map((recipe) => {
                const basis = recipeFoodBasis(recipe);
                return (
                  <View key={recipe.id} style={styles.recipeCard}>
                    <View style={styles.recipeHeader}>
                      <View style={styles.recipeIdentity}>
                        <Text style={styles.recipeName}>{recipe.name}</Text>
                        <Text style={styles.recipeMeta}>
                          {formatFoodMeasurementAmount(recipe.yieldServings)}{" "}
                          {recipe.yieldServings === 1 ? "serving" : "servings"}
                          {" · "}
                          {recipe.ingredients.length}{" "}
                          {recipe.ingredients.length === 1
                            ? "ingredient"
                            : "ingredients"}
                        </Text>
                      </View>
                      <IconButton
                        destructive
                        label={`Delete ${recipe.name} recipe`}
                        name="delete"
                        onPress={() => {
                          Keyboard.dismiss();
                          setPendingDelete(recipe);
                        }}
                      />
                    </View>
                    {recipe.description ? (
                      <Text style={styles.description}>
                        {recipe.description}
                      </Text>
                    ) : null}
                    <Text style={styles.ingredients} numberOfLines={2}>
                      {recipe.ingredients.map((item) => item.name).join(", ")}
                    </Text>
                    <Text style={styles.recipeNutrition}>
                      {Math.round(basis.nutrientsPerServing.calories)} cal ·{" "}
                      {Math.round(basis.nutrientsPerServing.proteinGrams * 10) /
                        10}
                      g protein per serving
                    </Text>
                    <Pressable
                      onPress={() => onLog(recipe)}
                      style={styles.addButton}
                    >
                      <Text style={styles.addButtonText}>Add to meal</Text>
                    </Pressable>
                  </View>
                );
              })}
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Recipe name</Text>
              <TextInput
                accessibilityLabel="Recipe name"
                autoCapitalize="words"
                onChangeText={setName}
                placeholder="Chicken pasta"
                placeholderTextColor={colors.tertiary}
                style={styles.input}
                value={name}
              />
              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                accessibilityLabel="Recipe description"
                multiline
                onChangeText={setDescription}
                placeholder="Sauce, preparation, or notes"
                placeholderTextColor={colors.tertiary}
                style={[styles.input, styles.descriptionInput]}
                value={description}
              />
              <Text style={styles.fieldLabel}>
                Servings made by the whole recipe
              </Text>
              <TextInput
                accessibilityLabel="Recipe servings"
                keyboardType="numbers-and-punctuation"
                onChangeText={setYieldServings}
                placeholder="1"
                placeholderTextColor={colors.tertiary}
                style={styles.input}
                value={yieldServings}
              />
              <Text style={styles.helper}>
                Use 1 when the whole item is one serving, such as a sandwich.
                Use the batch yield for foods such as pasta or soup.
              </Text>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryEyebrow}>WHOLE RECIPE</Text>
                <Text style={styles.summaryValue}>
                  {totals ? `${Math.round(totals.calories)} calories` : "—"}
                </Text>
                {totals && parsedYield && parsedYield > 0 ? (
                  <Text style={styles.summaryMeta}>
                    {Math.round(totals.calories / parsedYield)} calories ·{" "}
                    {Math.round((totals.proteinGrams / parsedYield) * 10) / 10}g
                    protein per serving
                  </Text>
                ) : null}
              </View>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Ingredients
              </Text>
              {ingredients.map((food) => (
                <View key={food.id} style={styles.ingredientCard}>
                  <View style={styles.ingredientDetails}>
                    <Text style={styles.ingredientName}>{food.name}</Text>
                    <Text style={styles.ingredientAmount}>
                      {foodAmountDescription(
                        food.amount,
                        food.unit,
                        food.householdUnit,
                        food.servingLabel,
                      )}
                    </Text>
                    <Text style={styles.ingredientNutrition}>
                      {food.totalNutrients.calories} cal ·{" "}
                      {Math.round(food.totalNutrients.proteinGrams * 10) / 10}g
                      protein
                    </Text>
                  </View>
                  <View style={styles.ingredientActions}>
                    <IconButton
                      label={`Edit ${food.name}`}
                      name="edit"
                      onPress={() => {
                        setEditingIngredient(food);
                        openEditor("ingredient");
                      }}
                    />
                    <IconButton
                      destructive
                      label={`Remove ${food.name}`}
                      name="delete"
                      onPress={() =>
                        setIngredients((current) =>
                          current.filter((item) => item.id !== food.id),
                        )
                      }
                    />
                  </View>
                </View>
              ))}
              {!ingredients.length ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No ingredients yet</Text>
                  <Text style={styles.emptyCopy}>
                    Add saved labels, scan a package, or create a food label.
                  </Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setEditingIngredient(undefined);
                  openEditor("ingredient");
                }}
                style={styles.addIngredientButton}
              >
                <Text style={styles.addIngredientButtonText}>
                  Add ingredient
                </Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={() => void save()}
                style={[styles.primaryButton, saving && styles.disabled]}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? "Saving..." : "Save recipe"}
                </Text>
              </Pressable>
            </>
          )}
          {feedback ? (
            <Text
              accessibilityLiveRegion="polite"
              style={
                feedback.endsWith("saved as a recipe.") ||
                feedback.startsWith("Recipe deleted")
                  ? styles.success
                  : styles.feedback
              }
            >
              {feedback}
            </Text>
          ) : null}
        </ScrollView>
        {pendingDelete ? (
          <View style={styles.confirmationBackdrop}>
            <View style={styles.confirmationCard}>
              <Text accessibilityRole="header" style={styles.confirmationTitle}>
                Delete {pendingDelete.name}?
              </Text>
              <Text style={styles.confirmationCopy}>
                The saved recipe will be removed. Meals already logged from it
                will stay in Food History.
              </Text>
              <ConfirmationActions
                busy={saving}
                cancelLabel="Keep recipe"
                confirmLabel="Delete"
                onCancel={() => setPendingDelete(undefined)}
                onConfirm={() => void removeRecipe()}
              />
            </View>
          </View>
        ) : null}
        </SafeAreaView>
      </Modal>
      <FoodEditor
        excludeRecipes
        initial={editingIngredient}
        initialIsNew={!editingIngredient}
        onAiEstimate={() => openEditor("ai")}
        onClose={() => {
          closeEditor("ingredient");
          setEditingIngredient(undefined);
        }}
        onDismiss={childEditorDismissed}
        onSave={acceptIngredient}
        saveButtonLabel="Add to recipe"
        userId={userId}
        visible={activeEditor === "ingredient"}
      />
      <AiMealEditor
        onAdd={acceptEstimatedIngredients}
        onClose={() => closeEditor("ai")}
        onDismiss={childEditorDismissed}
        visible={activeEditor === "ai"}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 56,
    paddingHorizontal: 16,
  },
  headerButton: { justifyContent: "center", minHeight: 44, minWidth: 64 },
  headerButtonText: { color: colors.blue, fontSize: 16, fontWeight: "600" },
  headerTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSpacer: { width: 64 },
  content: { gap: 12, padding: 20, paddingBottom: 44 },
  infoCard: {
    backgroundColor: colors.blueSoft,
    borderRadius: 14,
    padding: 16,
  },
  infoTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  infoCopy: { color: colors.secondary, lineHeight: 20, marginTop: 5 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.blue,
    borderRadius: 11,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700",
  },
  disabled: { opacity: 0.5 },
  helper: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emptyCopy: { color: colors.secondary, lineHeight: 19, marginTop: 5 },
  recipeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  recipeHeader: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  recipeIdentity: { flex: 1 },
  recipeName: { color: colors.text, fontSize: 17, fontWeight: "700" },
  recipeMeta: { color: colors.secondary, fontSize: 13, marginTop: 3 },
  description: { color: colors.secondary, lineHeight: 19, marginTop: 10 },
  ingredients: {
    color: colors.tertiary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  recipeNutrition: { color: colors.text, fontWeight: "600", marginTop: 8 },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.blueSoft,
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 13,
    minHeight: 44,
  },
  addButtonText: { color: colors.blue, fontSize: 15, fontWeight: "700" },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  descriptionInput: { minHeight: 84, textAlignVertical: "top" },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  summaryEyebrow: {
    color: colors.secondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4,
  },
  summaryMeta: { color: colors.secondary, lineHeight: 19, marginTop: 5 },
  ingredientCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  ingredientDetails: { flex: 1 },
  ingredientActions: { flexDirection: "row", gap: 4 },
  ingredientName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  ingredientAmount: { color: colors.secondary, fontSize: 13, marginTop: 4 },
  ingredientNutrition: { color: colors.text, fontSize: 13, marginTop: 4 },
  addIngredientButton: {
    alignItems: "center",
    borderColor: colors.blue,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  addIngredientButtonText: {
    color: colors.blue,
    fontSize: 15,
    fontWeight: "700",
  },
  feedback: { color: colors.danger, lineHeight: 20, marginTop: 2 },
  success: { color: colors.green, lineHeight: 20, marginTop: 2 },
  confirmationBackdrop: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.48)",
    justifyContent: "center",
    padding: 24,
  },
  confirmationCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    maxWidth: 420,
    padding: 20,
    width: "100%",
  },
  confirmationTitle: { color: colors.text, fontSize: 19, fontWeight: "700" },
  confirmationCopy: { color: colors.secondary, lineHeight: 20, marginTop: 8 },
});

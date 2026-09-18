import { IconButton } from "../../ui/icon-button";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  estimatedFoodSchema,
  type EstimatedFood,
} from "../../../../../supabase/functions/_shared/meal-estimate";
import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { trackingStyles as shared } from "../../ui/tracking-styles";
import { createId } from "../vitals/storage";
import { capitalizeFoodLabel, estimatedFoodToEntry } from "./ai-meal";
import { estimateMeal } from "./ai-meal-client";
import { selectMealImage } from "./ai-meal-image";
import {
  foodAmountUnitLabel,
  type FoodUnit,
  type MealDraftEntry,
} from "./model";

const nutrients = [
  ["calories", "Calories (kcal)"],
  ["proteinGrams", "Protein (g)"],
  ["carbohydrateGrams", "Carbohydrates (g)"],
  ["fatGrams", "Fat (g)"],
  ["fiberGrams", "Fiber (g)"],
  ["sugarGrams", "Sugar (g)"],
  ["sodiumMg", "Sodium (mg)"],
] as const;
type ReviewFood = {
  id: string;
  food: EstimatedFood;
  amount: string;
  servingWeightGrams: string;
  servingVolumeMl: string;
  householdQuantityPerServing: string;
  values: Record<keyof EstimatedFood["nutrientsPerServing"], string>;
  corrected: boolean;
  saveToMyFoods: boolean;
};
const numeric = (value: string) =>
  value.trim() ? Number(value.replace(",", ".")) : NaN;
const nullableNumeric = (value: string) =>
  value.trim() ? numeric(value) : null;

function reviewValue(item: ReviewFood): EstimatedFood {
  return estimatedFoodSchema.parse({
    ...item.food,
    name: capitalizeFoodLabel(item.food.name),
    portionAmount: numeric(item.amount),
    servingWeightGrams: nullableNumeric(item.servingWeightGrams),
    servingVolumeMl: nullableNumeric(item.servingVolumeMl),
    householdQuantityPerServing: nullableNumeric(
      item.householdQuantityPerServing,
    ),
    householdUnit: item.food.householdUnit?.trim() || null,
    nutrientsPerServing: Object.fromEntries(
      nutrients.map(([key]) => [key, numeric(item.values[key])]),
    ),
  });
}

function availableReviewUnits(
  item: ReviewFood,
): EstimatedFood["portionUnit"][] {
  return [
    "serving",
    ...(nullableNumeric(item.householdQuantityPerServing) &&
    item.food.householdUnit?.trim()
      ? (["household"] as const)
      : []),
    ...(nullableNumeric(item.servingWeightGrams) ? (["g"] as const) : []),
    ...(nullableNumeric(item.servingVolumeMl) ? (["ml"] as const) : []),
  ];
}

function reviewUnitLabel(item: ReviewFood, unit: FoodUnit) {
  const amount = numeric(item.amount);
  return foodAmountUnitLabel(
    unit,
    Number.isFinite(amount) ? amount : 1,
    item.food.householdUnit ?? undefined,
  );
}

export function AiMealEditor({
  visible,
  onClose,
  onDismiss,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onAdd: (entries: MealDraftEntry[]) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<{ uri: string; base64: string }>();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [items, setItems] = useState<ReviewFood[]>([]);
  const [explanation, setExplanation] = useState("");
  const [feedback, setFeedback] = useState("");
  const request = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const addingRef = useRef(false);
  const disabled = busy || adding || picking;

  useEffect(() => {
    if (!visible) return;
    generation.current += 1;
    setDescription("");
    setPhoto(undefined);
    setConsent(false);
    setItems([]);
    setExplanation("");
    setFeedback("");
    setBusy(false);
    setAdding(false);
    setPicking(false);
    return () => {
      generation.current += 1;
      request.current?.abort();
    };
  }, [visible]);

  async function pick(source: "camera" | "library") {
    if (disabled) return;
    const current = generation.current;
    setPicking(true);
    setFeedback("");
    try {
      const selected = await selectMealImage(source);
      if (current === generation.current && selected) setPhoto(selected);
    } catch (error) {
      if (current === generation.current)
        setFeedback(
          error instanceof Error ? error.message : "Could not open the photo.",
        );
    } finally {
      if (current === generation.current) setPicking(false);
    }
  }

  async function analyze() {
    if (disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const current = generation.current;
    const timeout = setTimeout(() => controller.abort(), 75_000);
    setBusy(true);
    setFeedback("");
    try {
      const result = await estimateMeal(
        { description, imageBase64: photo?.base64, consent: true },
        controller.signal,
      );
      if (current !== generation.current) return;
      if (!result.items.length) {
        setItems([]);
        setExplanation("");
        setFeedback(
          result.inputType === "not_food" && photo
            ? "This photo does not appear to show food or a meal. Try another photo or describe what you ate."
            : result.inputType === "unclear" && photo
              ? "I could not identify food in this photo. Try a clearer meal photo or describe what you ate."
              : result.explanation,
        );
        return;
      }
      setItems(
        result.items.map((food) => ({
          id: createId(),
          food: { ...food, name: capitalizeFoodLabel(food.name) },
          amount: String(food.portionAmount),
          servingWeightGrams:
            food.servingWeightGrams === null
              ? ""
              : String(food.servingWeightGrams),
          servingVolumeMl:
            food.servingVolumeMl === null ? "" : String(food.servingVolumeMl),
          householdQuantityPerServing:
            food.householdQuantityPerServing === null
              ? ""
              : String(food.householdQuantityPerServing),
          corrected: false,
          saveToMyFoods: true,
          values: Object.fromEntries(
            nutrients.map(([key]) => [
              key,
              String(food.nutrientsPerServing[key]),
            ]),
          ) as ReviewFood["values"],
        })),
      );
      setExplanation(result.explanation);
    } catch (error) {
      if (current === generation.current)
        setFeedback(
          controller.signal.aborted
            ? "Estimation stopped. Your meal details are still here; you can try again."
            : error instanceof Error
              ? error.message
              : "Could not estimate this meal.",
        );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = undefined;
      if (current === generation.current) setBusy(false);
    }
  }

  async function add() {
    if (addingRef.current || disabled) return;
    let entries: MealDraftEntry[];
    try {
      entries = items.map((item) => ({
        ...estimatedFoodToEntry(reviewValue(item), item.id),
        isUserCorrected: item.corrected,
        saveToMyFoods: item.saveToMyFoods,
      }));
    } catch {
      setFeedback(
        "Check every food: enter a name, short description, serving label, valid portion conversion, and non-negative nutrition values.",
      );
      return;
    }
    addingRef.current = true;
    setAdding(true);
    setFeedback("");
    try {
      await onAdd(entries);
      onClose();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Could not add these foods. Try again.",
      );
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }

  function update(id: string, change: (item: ReviewFood) => ReviewFood) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...change(item), corrected: true } : item,
      ),
    );
  }

  function setSaveToMyFoods(id: string, saveToMyFoods: boolean) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, saveToMyFoods } : item,
      ),
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onDismiss={onDismiss}
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!adding) onClose();
      }}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: adding }}
            disabled={adding}
            hitSlop={10}
            onPress={onClose}
            style={styles.headerButton}
          >
            <Text style={styles.headerButtonText}>Close</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Estimate a meal
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.copy}>
            Take a photo, describe your meal, or use both. AI separates the
            foods and estimates how much you ate. Each account can request up to
            20 estimates per day.
          </Text>
          <Field
            label="Meal description"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={4000}
            editable={!disabled && !items.length}
            placeholder="2 cups cooked pasta, 1/2 cup tomato sauce, and 5 oz grilled chicken"
          />
          {!items.length ? (
            <>
              <View style={styles.actions}>
                {Platform.OS !== "web" ? (
                  <Action
                    label="Take meal photo"
                    disabled={disabled}
                    onPress={() => void pick("camera")}
                  />
                ) : null}
                <Action
                  label="Choose meal photo"
                  disabled={disabled}
                  onPress={() => void pick("library")}
                />
              </View>
              {photo ? (
                <View style={styles.card}>
                  <Image
                    source={{ uri: photo.uri }}
                    accessibilityLabel="Selected meal photo"
                    style={styles.photo}
                    resizeMode="contain"
                  />
                  <IconButton
                    name="delete"
                    destructive
                    label="Remove photo"
                    disabled={disabled}
                    onPress={() => setPhoto(undefined)}
                  />
                </View>
              ) : null}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="Allow AI meal processing"
                accessibilityState={{ checked: consent, disabled }}
                disabled={disabled}
                onPress={() => setConsent((value) => !value)}
                style={styles.consent}
              >
                <Text style={styles.check}>{consent ? "☑" : "☐"}</Text>
                <Text style={styles.consentText}>
                  Send this meal description and photo to OpenAI for estimation.
                  HealthApp does not upload the photo to your photo archive.
                  Estimates can be inaccurate; review before saving.
                </Text>
              </Pressable>
              <Action
                primary
                label={busy ? "Estimating foods…" : "Estimate foods"}
                disabled={
                  disabled || !consent || (!description.trim() && !photo)
                }
                onPress={() => void analyze()}
              />
              {busy ? (
                <>
                  <ActivityIndicator accessibilityLabel="Estimating meal" />
                  <Action
                    label="Cancel estimation"
                    onPress={() => request.current?.abort()}
                  />
                </>
              ) : null}
              {picking ? (
                <Text style={styles.copy}>Preparing photo…</Text>
              ) : null}
            </>
          ) : null}
          {explanation ? (
            <Text accessibilityLiveRegion="polite" style={styles.copy}>
              {explanation}
            </Text>
          ) : null}
          {items.length ? (
            <>
              <Text style={shared.section}>
                Review {items.length} estimated foods
              </Text>
              <Text style={styles.copy}>
                Edit each one-serving label, portion, and nutrition estimate.
                Counted foods can use pieces, slices, dumplings, or another item
                unit.
              </Text>
              {items.map((item, index) => {
                let calories: number | undefined;
                try {
                  calories = estimatedFoodToEntry(reviewValue(item), item.id)
                    .totalNutrients.calories;
                } catch {
                  /* Inline validation below. */
                }
                return (
                  <View key={item.id} style={styles.card}>
                    <Text style={shared.section}>Food {index + 1}</Text>
                    <View style={styles.saveLabelRow}>
                      <View style={styles.saveLabelCopy}>
                        <Text style={styles.saveLabelTitle}>
                          Create label in My Foods
                        </Text>
                        <Text style={styles.saveLabelDescription}>
                          Turn off to log this food only.
                        </Text>
                      </View>
                      <Switch
                        accessibilityLabel={`Create reusable label for Food ${index + 1}`}
                        accessibilityState={{
                          checked: item.saveToMyFoods,
                        }}
                        disabled={adding}
                        ios_backgroundColor={colors.fill}
                        onValueChange={(value) =>
                          setSaveToMyFoods(item.id, value)
                        }
                        trackColor={{
                          false: colors.fill,
                          true: colors.purple,
                        }}
                        value={item.saveToMyFoods}
                      />
                    </View>
                    <Field
                      label={`Food ${index + 1} name`}
                      value={item.food.name}
                      maxLength={160}
                      editable={!adding}
                      onChangeText={(name) =>
                        update(item.id, (value) => ({
                          ...value,
                          food: { ...value.food, name },
                        }))
                      }
                    />
                    <Field
                      label={`Food ${index + 1} description`}
                      value={item.food.description}
                      maxLength={120}
                      editable={!adding}
                      onChangeText={(text) =>
                        update(item.id, (value) => ({
                          ...value,
                          food: { ...value.food, description: text },
                        }))
                      }
                    />
                    <Field
                      label={`Food ${index + 1} serving label`}
                      value={item.food.servingLabel}
                      maxLength={120}
                      editable={!adding}
                      onChangeText={(servingLabel) =>
                        update(item.id, (value) => ({
                          ...value,
                          food: { ...value.food, servingLabel },
                        }))
                      }
                    />
                    <Field
                      label={`Food ${index + 1} item unit`}
                      value={item.food.householdUnit ?? ""}
                      maxLength={40}
                      editable={!adding}
                      placeholder="Optional, e.g. dumpling or slice"
                      onChangeText={(householdUnit) =>
                        update(item.id, (value) => {
                          const present = !!householdUnit.trim();
                          return {
                            ...value,
                            householdQuantityPerServing: present
                              ? value.householdQuantityPerServing || "1"
                              : "",
                            food: {
                              ...value.food,
                              portionUnit:
                                !present &&
                                value.food.portionUnit === "household"
                                  ? "serving"
                                  : value.food.portionUnit,
                              householdUnit: present ? householdUnit : null,
                            },
                          };
                        })
                      }
                    />
                    {item.food.householdUnit?.trim() ? (
                      <Field
                        label={`Food ${index + 1} items per serving`}
                        value={item.householdQuantityPerServing}
                        numeric
                        editable={!adding}
                        onChangeText={(householdQuantityPerServing) =>
                          update(item.id, (value) => ({
                            ...value,
                            householdQuantityPerServing,
                            food: {
                              ...value.food,
                              portionUnit:
                                !householdQuantityPerServing.trim() &&
                                value.food.portionUnit === "household"
                                  ? "serving"
                                  : value.food.portionUnit,
                            },
                          }))
                        }
                      />
                    ) : null}
                    <View style={styles.field}>
                      <Text style={shared.label}>Portion unit</Text>
                      <View style={styles.unitRow}>
                        {availableReviewUnits(item).map((unit) => (
                          <Pressable
                            key={unit}
                            accessibilityRole="button"
                            accessibilityState={{
                              selected: item.food.portionUnit === unit,
                              disabled: adding,
                            }}
                            disabled={adding}
                            onPress={() =>
                              update(item.id, (value) => ({
                                ...value,
                                food: { ...value.food, portionUnit: unit },
                              }))
                            }
                            style={[
                              styles.unitChip,
                              item.food.portionUnit === unit &&
                                styles.unitChipActive,
                            ]}
                          >
                            <Text
                              style={
                                item.food.portionUnit === unit
                                  ? styles.unitTextActive
                                  : styles.unitText
                              }
                            >
                              {reviewUnitLabel(item, unit)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <Field
                      label={`Food ${index + 1} portion (${reviewUnitLabel(item, item.food.portionUnit)})`}
                      value={item.amount}
                      numeric
                      editable={!adding}
                      onChangeText={(amount) =>
                        update(item.id, (value) => ({ ...value, amount }))
                      }
                    />
                    {item.servingWeightGrams ||
                    item.food.portionUnit === "g" ? (
                      <Field
                        label={`Food ${index + 1} serving weight (g)`}
                        value={item.servingWeightGrams}
                        numeric
                        editable={!adding}
                        onChangeText={(servingWeightGrams) =>
                          update(item.id, (value) => ({
                            ...value,
                            servingWeightGrams,
                            food: {
                              ...value.food,
                              portionUnit:
                                !servingWeightGrams.trim() &&
                                value.food.portionUnit === "g"
                                  ? "serving"
                                  : value.food.portionUnit,
                            },
                          }))
                        }
                      />
                    ) : null}
                    {item.servingVolumeMl || item.food.portionUnit === "ml" ? (
                      <Field
                        label={`Food ${index + 1} serving volume (mL)`}
                        value={item.servingVolumeMl}
                        numeric
                        editable={!adding}
                        onChangeText={(servingVolumeMl) =>
                          update(item.id, (value) => ({
                            ...value,
                            servingVolumeMl,
                            food: {
                              ...value.food,
                              portionUnit:
                                !servingVolumeMl.trim() &&
                                value.food.portionUnit === "ml"
                                  ? "serving"
                                  : value.food.portionUnit,
                            },
                          }))
                        }
                      />
                    ) : null}
                    <Text style={styles.calories}>
                      {calories === undefined
                        ? "Check label values"
                        : `${calories} estimated calories in this portion`}
                    </Text>
                    <Text style={styles.copy}>
                      {item.food.confidence} confidence
                      {item.food.assumptions
                        ? ` · ${item.food.assumptions}`
                        : ""}
                    </Text>
                    <Text style={shared.label}>
                      Nutrition for {item.food.servingLabel || "1 serving"}
                    </Text>
                    <View style={styles.grid}>
                      {nutrients.map(([key, label]) => (
                        <View key={key} style={styles.nutrient}>
                          <Field
                            label={label}
                            accessibilityLabel={`Food ${index + 1} ${label}`}
                            value={item.values[key]}
                            numeric
                            editable={!adding}
                            onChangeText={(text) =>
                              update(item.id, (value) => ({
                                ...value,
                                values: { ...value.values, [key]: text },
                              }))
                            }
                          />
                        </View>
                      ))}
                    </View>
                    <IconButton
                      name="delete"
                      destructive
                      label={`Remove food ${index + 1}`}
                      disabled={adding}
                      onPress={() =>
                        setItems((current) =>
                          current.filter((value) => value.id !== item.id),
                        )
                      }
                    />
                  </View>
                );
              })}
              <Action
                primary
                label={adding ? "Adding foods…" : "Add foods to meal"}
                disabled={adding}
                onPress={() => void add()}
              />
              <Action
                label="Revise meal details"
                disabled={adding}
                onPress={() => {
                  setItems([]);
                  setExplanation("");
                  setFeedback("");
                }}
              />
            </>
          ) : null}
          {feedback ? (
            <Text accessibilityRole="alert" style={shared.error}>
              {feedback}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({
  label,
  numeric: isNumeric,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  numeric?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={shared.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={isNumeric ? "decimal-pad" : "default"}
        {...props}
        style={[shared.input, props.multiline && styles.multiline]}
      />
    </View>
  );
}
function Action({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        primary ? shared.button : styles.secondary,
        disabled && styles.disabled,
      ]}
    >
      <Text style={primary ? shared.buttonText : styles.actionText}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    alignItems: "center",
    borderBottomColor: colors.separator,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 14,
  },
  headerButton: {
    justifyContent: "center",
    minHeight: 44,
    minWidth: 58,
    paddingVertical: 10,
  },
  headerButtonText: { color: colors.blue, fontWeight: "600" },
  headerTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  headerSpacer: {
    minWidth: 58,
  },
  content: {
    padding: 20,
    gap: 16,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingBottom: 48,
  },
  copy: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  card: { ...shared.card, gap: 12 },
  field: { marginBottom: 4 },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  secondary: {
    minHeight: 44,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  actionText: { color: colors.blue, fontWeight: "600", fontSize: 15 },
  disabled: { opacity: 0.5 },
  photo: { width: "100%", height: 200, borderRadius: 12 },
  consent: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 8,
  },
  check: { fontSize: 26, color: colors.blue },
  consentText: {
    flex: 1,
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 21,
  },
  calories: { fontSize: 16, color: colors.text, fontWeight: "600" },
  saveLabelRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
    padding: 12,
  },
  saveLabelCopy: { flex: 1 },
  saveLabelTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 3,
  },
  saveLabelDescription: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  unitRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  unitChip: shared.chip,
  unitChipActive: shared.chipActive,
  unitText: shared.chipText,
  unitTextActive: shared.chipTextActive,
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  nutrient: { flexGrow: 1, flexBasis: "45%", minWidth: 110 },
});

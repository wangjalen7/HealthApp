import type { BarcodeScanningResult, BarcodeType } from "expo-camera";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { createId } from "../vitals/storage";
import {
  availableFoodUnits,
  calculateFoodAmount,
  foodNameMatchesQuery,
  foodUnitLabel,
  mealDraftEntrySchema,
  normalizeHouseholdUnit,
  volumeAmountToMl,
  weightAmountToGrams,
  type FoodBasis,
  type FoodUnit,
  type MealDraftEntry,
} from "./model";
import {
  FoodBarcodeLookupError,
  getFoodSuggestions,
  resolveFoodBarcode,
  saveFoodProfile,
  type BarcodeProduct,
  type FoodSuggestion,
} from "./repository";

type EditorMode = "methods" | "basic" | "label" | "search" | "scan" | "amount";
type WeightUnit = "g" | "oz" | "lb";
type VolumeUnit = "ml" | "fl_oz" | "cup" | "tbsp" | "tsp";
type LabelForm = {
  name: string;
  brand: string;
  servingLabel: string;
  householdAmount: string;
  householdUnit: string;
  weightAmount: string;
  weightUnit: WeightUnit;
  volumeAmount: string;
  volumeUnit: VolumeUnit;
  calories: string;
  protein: string;
  carbohydrates: string;
  fat: string;
  fiber: string;
  sugar: string;
  sodium: string;
};

const blankLabel = (): LabelForm => ({
  name: "",
  brand: "",
  servingLabel: "",
  householdAmount: "",
  householdUnit: "",
  weightAmount: "",
  weightUnit: "g",
  volumeAmount: "",
  volumeUnit: "ml",
  calories: "",
  protein: "",
  carbohydrates: "",
  fat: "",
  fiber: "",
  sugar: "",
  sodium: "",
});
const barcodeTypes: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e"];

function valueOrBlank(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function positiveValueOrBlank(value: number | null | undefined) {
  return value !== null && value !== undefined && value > 0
    ? String(value)
    : "";
}

function productForm(product: BarcodeProduct): LabelForm {
  return {
    name: product.name === "Scanned product" ? "" : product.name,
    brand: product.brand ?? "",
    servingLabel: product.servingLabel ?? "",
    householdAmount: positiveValueOrBlank(product.householdQuantityPerServing),
    householdUnit: product.householdUnit ?? "",
    weightAmount: positiveValueOrBlank(product.servingWeightGrams),
    weightUnit: "g",
    volumeAmount: positiveValueOrBlank(product.servingVolumeMl),
    volumeUnit: "ml",
    calories: valueOrBlank(product.nutrientsPerServing.calories),
    protein: valueOrBlank(product.nutrientsPerServing.proteinGrams),
    carbohydrates: valueOrBlank(product.nutrientsPerServing.carbohydrateGrams),
    fat: valueOrBlank(product.nutrientsPerServing.fatGrams),
    fiber: valueOrBlank(product.nutrientsPerServing.fiberGrams),
    sugar: valueOrBlank(product.nutrientsPerServing.sugarGrams),
    sodium: valueOrBlank(product.nutrientsPerServing.sodiumMg),
  };
}

const numberOrUndefined = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

function formSignature(form: LabelForm) {
  return JSON.stringify({
    ...form,
    name: form.name.trim(),
    brand: form.brand.trim(),
    servingLabel: form.servingLabel.trim(),
  });
}

function sourceBadge(basis: FoodBasis, kind?: FoodSuggestion["kind"]) {
  if (kind === "recent") return "Recent";
  if (basis.isUserCorrected) return "Corrected";
  if (basis.source === "open_food_facts") return "Open Food Facts";
  return kind === "profile" ? "My label" : "Manual";
}

export function FoodEditor({
  userId,
  visible,
  initial,
  onClose,
  onSave,
}: {
  userId: string;
  visible: boolean;
  initial?: MealDraftEntry;
  onClose: () => void;
  onSave: (entry: MealDraftEntry) => void;
}) {
  const [mode, setMode] = useState<EditorMode>("methods");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [basicName, setBasicName] = useState("");
  const [basicBrand, setBasicBrand] = useState("");
  const [basicCalories, setBasicCalories] = useState("");
  const [basicProtein, setBasicProtein] = useState("");
  const [label, setLabel] = useState<LabelForm>(blankLabel);
  const [labelSource, setLabelSource] = useState<"manual" | "open_food_facts">(
    "manual",
  );
  const [catalogProductId, setCatalogProductId] = useState<string>();
  const [barcode, setBarcode] = useState<string>();
  const [providerSignature, setProviderSignature] = useState<string>();
  const [basis, setBasis] = useState<FoodBasis>();
  const [entryMethod, setEntryMethod] =
    useState<MealDraftEntry["entryMethod"]>("label");
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<FoodUnit>("serving");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRequest = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLocked, setScanLocked] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");

  useEffect(() => {
    if (!visible) return;
    setFeedback("");
    setSaving(false);
    setQuery("");
    setSuggestions([]);
    setScanLocked(false);
    setTorch(false);
    setManualBarcode("");
    if (!initial) {
      setMode("methods");
      setBasicName("");
      setBasicBrand("");
      setBasicCalories("");
      setBasicProtein("");
      setLabel(blankLabel());
      setBasis(undefined);
      setCatalogProductId(undefined);
      setBarcode(undefined);
      setProviderSignature(undefined);
      setNote("");
      return;
    }
    setNote(initial.note ?? "");
    if (initial.entryMethod === "basic") {
      setBasicName(initial.name);
      setBasicBrand(initial.brand ?? "");
      setBasicCalories(String(initial.totalNutrients.calories));
      setBasicProtein(String(initial.totalNutrients.proteinGrams));
      setMode("basic");
      return;
    }
    const nextBasis: FoodBasis = {
      profileId: initial.profileId,
      catalogProductId: initial.catalogProductId,
      name: initial.name,
      brand: initial.brand,
      barcode: initial.barcode,
      source: initial.source,
      isUserCorrected: initial.isUserCorrected,
      servingLabel: initial.servingLabel,
      servingWeightGrams: initial.servingWeightGrams,
      servingVolumeMl: initial.servingVolumeMl,
      householdQuantityPerServing: initial.householdQuantityPerServing,
      householdUnit: initial.householdUnit,
      nutrientsPerServing: initial.nutrientsPerServing,
    };
    setBasis(nextBasis);
    setAmount(String(initial.amount));
    setUnit(initial.unit);
    setEntryMethod(initial.entryMethod);
    setMode("amount");
  }, [initial, visible]);

  useEffect(() => {
    if (!visible || mode !== "search") return;
    const request = ++searchRequest.current;
    setSearching(true);
    const timeout = setTimeout(() => {
      void getFoodSuggestions(userId, query)
        .then((items) => {
          if (request === searchRequest.current) setSuggestions(items);
        })
        .catch((error) => {
          if (request === searchRequest.current) {
            setSuggestions([]);
            setFeedback(
              error instanceof Error
                ? error.message
                : "Could not search foods.",
            );
          }
        })
        .finally(() => {
          if (request === searchRequest.current) setSearching(false);
        });
    }, 220);
    return () => clearTimeout(timeout);
  }, [mode, query, userId, visible]);

  const calculated = useMemo(() => {
    if (!basis) return undefined;
    const parsedAmount = Number(amount.replace(",", "."));
    try {
      return calculateFoodAmount(basis, parsedAmount, unit);
    } catch {
      return undefined;
    }
  }, [amount, basis, unit]);

  function openLabel() {
    setLabel(blankLabel());
    setLabelSource("manual");
    setCatalogProductId(undefined);
    setBarcode(undefined);
    setProviderSignature(undefined);
    setFeedback("");
    setMode("label");
  }

  function createLabelFromQuery() {
    const name = query.trim();
    if (!name) return;
    setLabel({ ...blankLabel(), name });
    setLabelSource("manual");
    setCatalogProductId(undefined);
    setBarcode(undefined);
    setProviderSignature(undefined);
    setFeedback("");
    setMode("label");
  }

  function continueLabel() {
    const calories = numberOrUndefined(label.calories);
    const protein = numberOrUndefined(label.protein);
    if (!label.name.trim() || calories === undefined || protein === undefined) {
      return setFeedback(
        "Enter the food name, calories, and protein per serving.",
      );
    }
    const weight = numberOrUndefined(label.weightAmount);
    const volume = numberOrUndefined(label.volumeAmount);
    const householdAmount = numberOrUndefined(label.householdAmount);
    const householdUnit = normalizeHouseholdUnit(label.householdUnit);
    if (label.weightAmount.trim() && (!weight || weight <= 0)) {
      return setFeedback(
        "Serving weight must be greater than zero or left blank.",
      );
    }
    if (label.volumeAmount.trim() && (!volume || volume <= 0)) {
      return setFeedback(
        "Serving volume must be greater than zero or left blank.",
      );
    }
    if (Boolean(label.householdAmount.trim()) !== Boolean(householdUnit)) {
      return setFeedback(
        "Enter both the package/piece amount and its unit, or leave both blank.",
      );
    }
    if (
      label.householdAmount.trim() &&
      (!householdAmount || householdAmount <= 0)
    ) {
      return setFeedback("Package or piece amount must be greater than zero.");
    }
    const nextBasis: FoodBasis = {
      catalogProductId,
      name: label.name.trim(),
      brand: label.brand.trim() || undefined,
      barcode,
      source: labelSource,
      isUserCorrected:
        labelSource === "open_food_facts" &&
        providerSignature !== undefined &&
        providerSignature !== formSignature(label),
      servingLabel: label.servingLabel.trim() || undefined,
      servingWeightGrams:
        weight === undefined
          ? undefined
          : weightAmountToGrams(weight, label.weightUnit),
      servingVolumeMl:
        volume === undefined
          ? undefined
          : volumeAmountToMl(volume, label.volumeUnit),
      householdQuantityPerServing: householdAmount,
      householdUnit: householdUnit || undefined,
      nutrientsPerServing: {
        calories,
        proteinGrams: protein,
        carbohydrateGrams: numberOrUndefined(label.carbohydrates),
        fatGrams: numberOrUndefined(label.fat),
        fiberGrams: numberOrUndefined(label.fiber),
        sugarGrams: numberOrUndefined(label.sugar),
        sodiumMg: numberOrUndefined(label.sodium),
      },
    };
    setBasis(nextBasis);
    setAmount(String(householdAmount ?? 1));
    setUnit(householdAmount && householdUnit ? "household" : "serving");
    setEntryMethod(labelSource === "open_food_facts" ? "barcode" : "label");
    setFeedback("");
    setMode("amount");
  }

  async function finishAmount() {
    if (!basis || !calculated) {
      return setFeedback("Enter a valid amount using an available unit.");
    }
    setSaving(true);
    setFeedback("");
    try {
      const finalBasis =
        !basis.profileId && ["label", "barcode"].includes(entryMethod)
          ? await saveFoodProfile(userId, basis)
          : basis;
      const parsedAmount = Number(amount.replace(",", "."));
      const result = calculateFoodAmount(finalBasis, parsedAmount, unit);
      onSave(
        mealDraftEntrySchema.parse({
          ...finalBasis,
          id: initial?.id ?? createId(),
          amount: parsedAmount,
          unit,
          ...result,
          note: note.trim() || undefined,
          entryMethod,
        }),
      );
      onClose();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not add this food.",
      );
    } finally {
      setSaving(false);
    }
  }

  function finishBasic() {
    const calories = numberOrUndefined(basicCalories);
    const protein = numberOrUndefined(basicProtein);
    if (!basicName.trim() || calories === undefined || protein === undefined) {
      return setFeedback("Enter the food name, calories, and protein.");
    }
    onSave(
      mealDraftEntrySchema.parse({
        id: initial?.id ?? createId(),
        name: basicName.trim(),
        brand: basicBrand.trim() || undefined,
        source: "manual",
        isUserCorrected: false,
        nutrientsPerServing: {
          calories: Math.round(calories),
          proteinGrams: protein,
        },
        amount: 1,
        unit: "serving",
        servingCount: 1,
        totalNutrients: {
          calories: Math.round(calories),
          proteinGrams: protein,
        },
        note: note.trim() || undefined,
        entryMethod: "basic",
      }),
    );
    onClose();
  }

  function chooseSuggestion(item: FoodSuggestion) {
    const units = availableFoodUnits(item.basis);
    setBasis(item.basis);
    setAmount(String(item.defaultAmount));
    setUnit(units.includes(item.defaultUnit) ? item.defaultUnit : "serving");
    setEntryMethod(item.kind === "recent" ? "history" : "profile");
    setNote("");
    setFeedback("");
    setMode("amount");
  }

  async function lookupBarcode(raw: string, type: string) {
    if (scanLocked || !raw.trim()) return;
    setScanLocked(true);
    setFeedback("Looking up this product...");
    try {
      const product = await resolveFoodBarcode(raw, type);
      const nextForm = productForm(product);
      setLabel(nextForm);
      setLabelSource("open_food_facts");
      setCatalogProductId(product.catalogProductId);
      setBarcode(product.barcode);
      setProviderSignature(formSignature(nextForm));
      setFeedback(
        product.complete
          ? "Confirm the package nutrition before continuing."
          : "Some serving or nutrition details are missing or inconsistent. Confirm them from the package.",
      );
      setMode("label");
    } catch (error) {
      const scannedDigits = raw.replace(/\D/g, "");
      if (
        error instanceof FoodBarcodeLookupError &&
        error.code === "not_found"
      ) {
        setLabel(blankLabel());
        setLabelSource("manual");
        setCatalogProductId(undefined);
        setBarcode(scannedDigits);
        setProviderSignature(undefined);
        setFeedback(
          "This barcode is not in Open Food Facts. Enter the serving and nutrition from the package to create your private label.",
        );
        setScanLocked(false);
        setMode("label");
        return;
      }
      if (
        error instanceof FoodBarcodeLookupError &&
        error.code === "invalid_barcode"
      ) {
        setManualBarcode(scannedDigits);
        setFeedback(
          "That barcode is not valid. Check the scanned digits or type the barcode manually below.",
        );
      } else {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Could not reach Open Food Facts. Try again or type the barcode manually.",
        );
      }
      setScanLocked(false);
    }
  }

  function scanned(result: BarcodeScanningResult) {
    void lookupBarcode(result.data, result.type);
  }

  function back() {
    setFeedback("");
    if (mode === "methods") return onClose();
    if (mode === "amount" && labelSource === "open_food_facts")
      return setMode("label");
    setMode("methods");
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={back}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={back}
            style={styles.headerButton}
          >
            <Text style={styles.headerButtonText}>
              {mode === "methods" ? "Close" : "Back"}
            </Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {modeTitle(mode, Boolean(initial))}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        {mode === "scan" ? (
          <Scanner
            permission={permission}
            requestPermission={requestPermission}
            locked={scanLocked}
            torch={torch}
            setTorch={setTorch}
            onScanned={scanned}
            manualBarcode={manualBarcode}
            setManualBarcode={setManualBarcode}
            lookup={() => void lookupBarcode(manualBarcode, "unknown")}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {mode === "methods" ? (
              <MethodPicker
                onLabel={openLabel}
                onSearch={() => {
                  setFeedback("");
                  setMode("search");
                }}
                onScan={() => {
                  setFeedback("");
                  setScanLocked(false);
                  setMode("scan");
                }}
              />
            ) : null}
            {mode === "basic" ? (
              <BasicForm
                name={basicName}
                setName={setBasicName}
                brand={basicBrand}
                setBrand={setBasicBrand}
                calories={basicCalories}
                setCalories={setBasicCalories}
                protein={basicProtein}
                setProtein={setBasicProtein}
                note={note}
                setNote={setNote}
                onSave={finishBasic}
              />
            ) : null}
            {mode === "label" ? (
              <LabelEditor
                form={label}
                setForm={setLabel}
                provider={labelSource === "open_food_facts"}
                attachedBarcode={labelSource === "manual" ? barcode : undefined}
                onContinue={continueLabel}
              />
            ) : null}
            {mode === "search" ? (
              <FoodSearch
                query={query}
                setQuery={setQuery}
                suggestions={suggestions}
                searching={searching}
                choose={chooseSuggestion}
                createLabel={createLabelFromQuery}
              />
            ) : null}
            {mode === "amount" && basis ? (
              <AmountEditor
                basis={basis}
                amount={amount}
                setAmount={setAmount}
                unit={unit}
                setUnit={setUnit}
                note={note}
                setNote={setNote}
                calculated={calculated}
                saving={saving}
                onSave={() => void finishAmount()}
              />
            ) : null}
            {feedback ? (
              <Text
                style={
                  feedback.startsWith("Confirm") ? styles.info : styles.feedback
                }
              >
                {feedback}
              </Text>
            ) : null}
          </ScrollView>
        )}
        {mode === "scan" && feedback ? (
          <Text style={styles.scanFeedback}>{feedback}</Text>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function modeTitle(mode: EditorMode, editing: boolean) {
  if (editing) return "Edit food";
  if (mode === "methods") return "Add food";
  if (mode === "basic") return "Quick add";
  if (mode === "label") return "Food label";
  if (mode === "search") return "Find or add food";
  if (mode === "scan") return "Scan barcode";
  return "Amount";
}

function MethodPicker({
  onLabel,
  onSearch,
  onScan,
}: {
  onLabel: () => void;
  onSearch: () => void;
  onScan: () => void;
}) {
  const methods = [
    [
      "Find or add food",
      "Search Recent and My Foods, or create a label when there is no match.",
      onSearch,
    ],
    ["Scan barcode", "Use your iPhone camera and Open Food Facts.", onScan],
    [
      "Create food label",
      "Save a brand, serving size, and nutrition facts.",
      onLabel,
    ],
  ] as const;
  return (
    <>
      <Text style={styles.lead}>How would you like to add this food?</Text>
      {methods.map(([title, copy, action]) => (
        <Pressable
          accessibilityRole="button"
          key={title}
          onPress={action}
          style={styles.methodCard}
        >
          <View style={styles.methodText}>
            <Text style={styles.methodTitle}>{title}</Text>
            <Text style={styles.methodCopy}>{copy}</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </Pressable>
      ))}
    </>
  );
}

function BasicForm(props: {
  name: string;
  setName: (value: string) => void;
  brand: string;
  setBrand: (value: string) => void;
  calories: string;
  setCalories: (value: string) => void;
  protein: string;
  setProtein: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <>
      <Text style={styles.lead}>Enter totals for the amount you ate.</Text>
      <FormField
        label="Food name"
        value={props.name}
        onChangeText={props.setName}
        placeholder="Example: Chicken thigh"
      />
      <FormField
        label="Brand (optional)"
        value={props.brand}
        onChangeText={props.setBrand}
        placeholder="Example: Kirkland"
      />
      <View style={styles.formRow}>
        <FormField
          compact
          label="Calories"
          value={props.calories}
          onChangeText={props.setCalories}
          keyboard
        />
        <FormField
          compact
          label="Protein (g)"
          value={props.protein}
          onChangeText={props.setProtein}
          keyboard
        />
      </View>
      <FormField
        label="Note (optional)"
        value={props.note}
        onChangeText={props.setNote}
        placeholder="Preparation, flavor, or package"
        multiline
      />
      <PrimaryButton label="Add to meal" onPress={props.onSave} />
    </>
  );
}

function LabelEditor({
  form,
  setForm,
  provider,
  attachedBarcode,
  onContinue,
}: {
  form: LabelForm;
  setForm: React.Dispatch<React.SetStateAction<LabelForm>>;
  provider: boolean;
  attachedBarcode?: string;
  onContinue: () => void;
}) {
  const change = (patch: Partial<LabelForm>) =>
    setForm((current) => ({ ...current, ...patch }));
  return (
    <>
      {provider ? (
        <View style={styles.sourceNotice}>
          <Text style={styles.sourceNoticeTitle}>Open Food Facts</Text>
          <Text style={styles.sourceNoticeCopy}>
            Check these values against the package. Your corrections are saved
            privately.
          </Text>
        </View>
      ) : attachedBarcode ? (
        <View style={styles.sourceNotice}>
          <Text style={styles.sourceNoticeTitle}>Product not found</Text>
          <Text style={styles.sourceNoticeCopy}>
            Create your private profile for barcode {attachedBarcode} using the
            package label. It will be suggested from My Foods next time.
          </Text>
        </View>
      ) : (
        <Text style={styles.lead}>
          Nutrition values below apply to one serving.
        </Text>
      )}
      <FormField
        label="Food name"
        value={form.name}
        onChangeText={(name) => change({ name })}
      />
      <FormField
        label="Brand (optional)"
        value={form.brand}
        onChangeText={(brand) => change({ brand })}
      />
      <FormField
        label="Serving description (optional)"
        value={form.servingLabel}
        onChangeText={(servingLabel) => change({ servingLabel })}
        placeholder="Example: 2/3 cup (55 g)"
      />
      <Text style={styles.sectionLabel}>Serving conversions</Text>
      <Text style={styles.help}>
        Use weight for foods sold by mass and volume for liquids. Leave the
        other blank unless the package explicitly states both.
      </Text>
      <View style={styles.formRow}>
        <FormField
          compact
          label="Count per serving"
          value={form.householdAmount}
          onChangeText={(householdAmount) => change({ householdAmount })}
          placeholder="Example: 12"
          keyboard
        />
        <FormField
          compact
          label="Count unit"
          value={form.householdUnit}
          onChangeText={(householdUnit) => change({ householdUnit })}
          placeholder="piece, package, bar"
        />
      </View>
      <View style={styles.formRow}>
        <View style={styles.compactField}>
          <Text style={styles.fieldLabel}>Weight per serving</Text>
          <TextInput
            accessibilityLabel="Weight per serving"
            keyboardType="decimal-pad"
            placeholder="Optional"
            placeholderTextColor="#9FB3C8"
            style={styles.input}
            value={form.weightAmount}
            onChangeText={(weightAmount) => change({ weightAmount })}
          />
        </View>
        <UnitSelector
          values={["g", "oz", "lb"]}
          selected={form.weightUnit}
          onSelect={(weightUnit) =>
            change({ weightUnit: weightUnit as WeightUnit })
          }
        />
      </View>
      <View style={styles.formRow}>
        <View style={styles.compactField}>
          <Text style={styles.fieldLabel}>Volume per serving</Text>
          <TextInput
            accessibilityLabel="Volume per serving"
            keyboardType="decimal-pad"
            placeholder="Optional"
            placeholderTextColor="#9FB3C8"
            style={styles.input}
            value={form.volumeAmount}
            onChangeText={(volumeAmount) => change({ volumeAmount })}
          />
        </View>
        <UnitSelector
          values={["ml", "fl_oz", "cup", "tbsp", "tsp"]}
          selected={form.volumeUnit}
          onSelect={(volumeUnit) =>
            change({ volumeUnit: volumeUnit as VolumeUnit })
          }
        />
      </View>
      <Text style={styles.sectionLabel}>Nutrition per serving</Text>
      <View style={styles.formRow}>
        <FormField
          compact
          label="Calories"
          value={form.calories}
          onChangeText={(calories) => change({ calories })}
          keyboard
        />
        <FormField
          compact
          label="Protein (g)"
          value={form.protein}
          onChangeText={(protein) => change({ protein })}
          keyboard
        />
      </View>
      <View style={styles.formRow}>
        <FormField
          compact
          label="Carbs (g)"
          value={form.carbohydrates}
          onChangeText={(carbohydrates) => change({ carbohydrates })}
          keyboard
        />
        <FormField
          compact
          label="Fat (g)"
          value={form.fat}
          onChangeText={(fat) => change({ fat })}
          keyboard
        />
      </View>
      <View style={styles.formRow}>
        <FormField
          compact
          label="Fiber (g)"
          value={form.fiber}
          onChangeText={(fiber) => change({ fiber })}
          keyboard
        />
        <FormField
          compact
          label="Sugar (g)"
          value={form.sugar}
          onChangeText={(sugar) => change({ sugar })}
          keyboard
        />
      </View>
      <FormField
        label="Sodium (mg)"
        value={form.sodium}
        onChangeText={(sodium) => change({ sodium })}
        keyboard
      />
      <PrimaryButton label="Continue to amount" onPress={onContinue} />
    </>
  );
}

function FoodSearch({
  query,
  setQuery,
  suggestions,
  searching,
  choose,
  createLabel,
}: {
  query: string;
  setQuery: (value: string) => void;
  suggestions: FoodSuggestion[];
  searching: boolean;
  choose: (item: FoodSuggestion) => void;
  createLabel: () => void;
}) {
  const recent = suggestions.filter((item) => item.kind === "recent");
  const profiles = suggestions.filter((item) => item.kind === "profile");
  const hasExactSavedName = suggestions.some((item) =>
    foodNameMatchesQuery(item.basis.name, query),
  );
  const hasQuery = Boolean(query.trim());
  return (
    <>
      <TextInput
        autoFocus
        accessibilityLabel="Find or add food"
        onChangeText={setQuery}
        placeholder="Enter a food name or brand"
        placeholderTextColor="#9FB3C8"
        style={[styles.input, styles.searchInput]}
        value={query}
      />
      <Text style={styles.help}>
        Select a match from your Recent or My Foods records. If the food does
        not exist, create a reusable label with its name already filled in.
      </Text>
      {searching ? <Text style={styles.searchState}>Searching...</Text> : null}
      <SuggestionSection label="Recent" items={recent} choose={choose} />
      <SuggestionSection label="My foods" items={profiles} choose={choose} />
      {!searching && hasQuery && !hasExactSavedName ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No exact saved food</Text>
          <Text style={styles.emptyCopy}>
            Create a reusable label for “{query.trim()}”?
          </Text>
          <PrimaryButton label="Create food label" onPress={createLabel} />
        </View>
      ) : !searching && !hasQuery && !suggestions.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No saved foods yet</Text>
          <Text style={styles.emptyCopy}>
            Type a food name to create your first reusable label.
          </Text>
        </View>
      ) : null}
    </>
  );
}

function SuggestionSection({
  label,
  items,
  choose,
}: {
  label: string;
  items: FoodSuggestion[];
  choose: (item: FoodSuggestion) => void;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.suggestionSection}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => choose(item)}
          style={styles.suggestionCard}
        >
          <View style={styles.suggestionMain}>
            <Text style={styles.suggestionName}>{item.basis.name}</Text>
            {item.basis.brand ? (
              <Text style={styles.suggestionBrand}>{item.basis.brand}</Text>
            ) : null}
            <Text style={styles.suggestionMeta}>
              {Math.round(item.basis.nutrientsPerServing.calories)} cal ·{" "}
              {Math.round(item.basis.nutrientsPerServing.proteinGrams * 10) /
                10}
              g protein per serving
            </Text>
          </View>
          <Text style={styles.badge}>{sourceBadge(item.basis, item.kind)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function AmountEditor({
  basis,
  amount,
  setAmount,
  unit,
  setUnit,
  note,
  setNote,
  calculated,
  saving,
  onSave,
}: {
  basis: FoodBasis;
  amount: string;
  setAmount: (value: string) => void;
  unit: FoodUnit;
  setUnit: (value: FoodUnit) => void;
  note: string;
  setNote: (value: string) => void;
  calculated: ReturnType<typeof calculateFoodAmount> | undefined;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <>
      <View style={styles.foodIdentity}>
        <View style={styles.suggestionMain}>
          <Text style={styles.foodIdentityName}>{basis.name}</Text>
          {basis.brand ? (
            <Text style={styles.suggestionBrand}>{basis.brand}</Text>
          ) : null}
          {basis.servingLabel ? (
            <Text style={styles.suggestionMeta}>
              Serving: {basis.servingLabel}
            </Text>
          ) : null}
        </View>
        <Text style={styles.badge}>{sourceBadge(basis)}</Text>
      </View>
      <Text style={styles.sectionLabel}>How much did you have?</Text>
      <TextInput
        accessibilityLabel="Food amount"
        keyboardType="decimal-pad"
        onChangeText={setAmount}
        placeholder="1"
        placeholderTextColor="#9FB3C8"
        style={[styles.input, styles.amountInput]}
        value={amount}
      />
      <UnitSelector
        values={availableFoodUnits(basis)}
        selected={unit}
        onSelect={(value) => setUnit(value as FoodUnit)}
        labels={
          basis.householdUnit ? { household: basis.householdUnit } : undefined
        }
      />
      <View style={styles.totalCard}>
        <Text style={styles.totalEyebrow}>THIS ENTRY</Text>
        <Text style={styles.totalValue}>
          {calculated ? `${calculated.totalNutrients.calories} cal` : "—"}
        </Text>
        <Text style={styles.totalMeta}>
          {calculated
            ? `${Math.round(calculated.totalNutrients.proteinGrams * 10) / 10}g protein`
            : "Choose a valid amount"}
        </Text>
        {calculated?.totalNutrients.carbohydrateGrams !== undefined ? (
          <Text style={styles.totalDetails}>
            Carbs{" "}
            {Math.round(calculated.totalNutrients.carbohydrateGrams * 10) / 10}g
            · Fat{" "}
            {Math.round((calculated.totalNutrients.fatGrams ?? 0) * 10) / 10}g
          </Text>
        ) : null}
      </View>
      <FormField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Preparation, flavor, or package"
        multiline
      />
      <PrimaryButton
        disabled={saving}
        label={saving ? "Adding..." : "Add to meal"}
        onPress={onSave}
      />
    </>
  );
}

function Scanner({
  permission,
  requestPermission,
  locked,
  torch,
  setTorch,
  onScanned,
  manualBarcode,
  setManualBarcode,
  lookup,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: ReturnType<typeof useCameraPermissions>[1];
  locked: boolean;
  torch: boolean;
  setTorch: (value: boolean) => void;
  onScanned: (result: BarcodeScanningResult) => void;
  manualBarcode: string;
  setManualBarcode: (value: string) => void;
  lookup: () => void;
}) {
  const canUseCamera = Platform.OS !== "web" && permission?.granted;
  return (
    <View style={styles.scannerPage}>
      {canUseCamera ? (
        <View style={styles.cameraFrame}>
          <CameraView
            active={!locked}
            barcodeScannerSettings={{ barcodeTypes }}
            enableTorch={torch}
            facing="back"
            onBarcodeScanned={locked ? undefined : onScanned}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.scanGuide} />
          <Text style={styles.scanInstruction}>
            {locked
              ? "Product detected"
              : "Place the package barcode inside the frame"}
          </Text>
          <Pressable
            onPress={() => setTorch(!torch)}
            style={styles.torchButton}
          >
            <Text style={styles.torchText}>
              {torch ? "Torch off" : "Torch on"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.permissionCard}>
          <Text style={styles.emptyTitle}>
            {Platform.OS === "web"
              ? "Use manual barcode entry on web"
              : "Camera access is needed"}
          </Text>
          <Text style={styles.emptyCopy}>
            {Platform.OS === "web"
              ? "The iPhone app provides live barcode scanning."
              : "HealthApp uses the camera only while this scanner is open."}
          </Text>
          {Platform.OS !== "web" ? (
            <Pressable
              onPress={
                permission?.canAskAgain === false
                  ? () => void Linking.openSettings()
                  : () => void requestPermission()
              }
              style={styles.permissionButton}
            >
              <Text style={styles.permissionButtonText}>
                {permission?.canAskAgain === false
                  ? "Open Settings"
                  : "Allow camera"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <View style={styles.manualCard}>
        <Text style={styles.sectionLabel}>Enter barcode manually</Text>
        <TextInput
          accessibilityLabel="Barcode number"
          keyboardType="number-pad"
          onChangeText={setManualBarcode}
          placeholder="Example: 810607023346"
          placeholderTextColor="#9FB3C8"
          style={styles.input}
          value={manualBarcode}
        />
        <PrimaryButton
          disabled={locked}
          label={locked ? "Looking up..." : "Look up barcode"}
          onPress={lookup}
        />
      </View>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder = "0",
  keyboard = false,
  compact = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboard?: boolean;
  compact?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={compact ? styles.compactField : styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={keyboard ? "decimal-pad" : "default"}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9FB3C8"
        style={[styles.input, multiline && styles.multiline]}
        value={value}
      />
    </View>
  );
}

function UnitSelector({
  values,
  selected,
  onSelect,
  labels,
}: {
  values: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <View style={styles.unitRow}>
      {values.map((value) => (
        <Pressable
          key={value}
          onPress={() => onSelect(value)}
          style={[styles.unitChip, selected === value && styles.unitChipActive]}
        >
          <Text
            style={selected === value ? styles.unitTextActive : styles.unitText}
          >
            {labels?.[value] ?? foodUnitLabel[value as FoodUnit] ?? value}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.primaryDisabled]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F7FAFC", flex: 1 },
  header: {
    alignItems: "center",
    borderBottomColor: "#D9E2EC",
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 14,
  },
  headerButton: { minWidth: 58, paddingVertical: 10 },
  headerButtonText: { color: "#16776A", fontWeight: "800" },
  headerTitle: {
    color: "#102A43",
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  headerSpacer: { width: 58 },
  content: { padding: 20, paddingBottom: 42 },
  lead: { color: "#486581", fontSize: 15, lineHeight: 22, marginBottom: 16 },
  methodCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 11,
    minHeight: 84,
    padding: 15,
  },
  methodText: { flex: 1 },
  methodTitle: { color: "#102A43", fontSize: 16, fontWeight: "800" },
  methodCopy: { color: "#627D98", lineHeight: 19, marginTop: 4 },
  arrow: { color: "#16776A", fontSize: 22, marginLeft: 10 },
  field: { marginBottom: 14 },
  compactField: { flex: 1, minWidth: 110 },
  fieldLabel: {
    color: "#486581",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 11,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: { minHeight: 82, textAlignVertical: "top" },
  formRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  sectionLabel: {
    color: "#243B53",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 8,
  },
  help: { color: "#7B8794", fontSize: 12, lineHeight: 17, marginBottom: 12 },
  unitRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 14,
    marginTop: 7,
  },
  unitChip: {
    backgroundColor: "#E6EEF3",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  unitChipActive: { backgroundColor: "#16776A" },
  unitText: { color: "#486581", fontSize: 12, fontWeight: "800" },
  unitTextActive: { color: "#fff", fontSize: 12, fontWeight: "800" },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 13,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 52,
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  feedback: {
    color: "#B42318",
    lineHeight: 20,
    marginTop: 14,
    textAlign: "center",
  },
  info: {
    color: "#16776A",
    lineHeight: 20,
    marginTop: 14,
    textAlign: "center",
  },
  sourceNotice: {
    backgroundColor: "#E6F7F3",
    borderRadius: 13,
    marginBottom: 16,
    padding: 13,
  },
  sourceNoticeTitle: { color: "#16776A", fontWeight: "800" },
  sourceNoticeCopy: { color: "#486581", lineHeight: 18, marginTop: 4 },
  searchInput: { marginBottom: 8 },
  searchState: { color: "#627D98", marginVertical: 10 },
  suggestionSection: { marginTop: 10 },
  suggestionCard: {
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
    padding: 12,
  },
  suggestionMain: { flex: 1 },
  suggestionName: { color: "#243B53", fontSize: 15, fontWeight: "800" },
  suggestionBrand: {
    color: "#486581",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  suggestionMeta: { color: "#7B8794", fontSize: 12, marginTop: 4 },
  badge: {
    backgroundColor: "#E6F7F3",
    borderRadius: 12,
    color: "#16776A",
    fontSize: 10,
    fontWeight: "800",
    marginLeft: 8,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  empty: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
  },
  emptyTitle: { color: "#243B53", fontWeight: "800" },
  emptyCopy: { color: "#627D98", lineHeight: 19, marginTop: 5 },
  foodIdentity: {
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 18,
    padding: 14,
  },
  foodIdentityName: { color: "#102A43", fontSize: 18, fontWeight: "800" },
  amountInput: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 5,
    maxWidth: 180,
  },
  totalCard: {
    backgroundColor: "#102A43",
    borderRadius: 16,
    marginBottom: 17,
    padding: 17,
  },
  totalEyebrow: {
    color: "#A7C7D4",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  totalValue: { color: "#fff", fontSize: 27, fontWeight: "800", marginTop: 5 },
  totalMeta: {
    color: "#D8F3EB",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 3,
  },
  totalDetails: { color: "#BCCCDC", fontSize: 12, marginTop: 8 },
  scannerPage: { flex: 1 },
  cameraFrame: {
    backgroundColor: "#102A43",
    flex: 1,
    minHeight: 330,
    overflow: "hidden",
  },
  scanGuide: {
    alignSelf: "center",
    borderColor: "#fff",
    borderRadius: 13,
    borderWidth: 2,
    height: 120,
    marginTop: 105,
    width: "78%",
  },
  scanInstruction: {
    alignSelf: "center",
    backgroundColor: "rgba(16,42,67,0.75)",
    borderRadius: 12,
    color: "#fff",
    fontWeight: "700",
    marginTop: 18,
    overflow: "hidden",
    paddingHorizontal: 13,
    paddingVertical: 9,
    textAlign: "center",
  },
  torchButton: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 18,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  torchText: { color: "#102A43", fontWeight: "800" },
  permissionCard: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 15,
    borderWidth: 1,
    margin: 18,
    padding: 18,
  },
  permissionButton: {
    alignSelf: "flex-start",
    backgroundColor: "#16776A",
    borderRadius: 10,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  permissionButtonText: { color: "#fff", fontWeight: "800" },
  manualCard: {
    backgroundColor: "#F7FAFC",
    borderTopColor: "#D9E2EC",
    borderTopWidth: 1,
    padding: 18,
  },
  scanFeedback: {
    backgroundColor: "#FFF4E5",
    color: "#8A4B08",
    padding: 12,
    textAlign: "center",
  },
});

import { trackingStyles } from "../../ui/tracking-styles";
import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { Icon } from "../../ui/icon";
import type { BarcodeScanningResult, BarcodeType } from "expo-camera";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createId } from "../vitals/storage";
import {
  availableFoodUnits,
  buildServingLabel,
  calculateFoodAmount,
  convertVolumeAmount,
  convertWeightAmount,
  foodNameMatchesQuery,
  formatFoodMeasurementAmount,
  foodUnitLabel,
  hasReproducibleServingBasis,
  isSpecificHouseholdUnit,
  mealDraftEntrySchema,
  normalizeHouseholdUnit,
  preferredVolumeUnitFromServingLabel,
  preferredWeightUnitFromServingLabel,
  shouldPreferSavedFoodProfile,
  volumeAmountToMl,
  weightAmountToGrams,
  type FoodBasis,
  type FoodUnit,
  type MealDraftEntry,
  type VolumeUnit,
  type WeightUnit,
} from "./model";
import {
  archiveFoodProfile,
  FoodBarcodeLookupError,
  getFoodProfileByIdentity,
  getFoodSuggestions,
  resolveFoodBarcode,
  saveFoodProfile,
  updateFoodProfile,
  type BarcodeProduct,
  type FoodSuggestion,
} from "./repository";

type EditorMode = "methods" | "label" | "search" | "scan" | "amount";
type LabelForm = {
  description: string;
  name: string;
  brand: string;
  fallbackServingLabel: string;
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
  description: "",
  name: "",
  brand: "",
  fallbackServingLabel: "",
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

function measurementValueOrBlank(value: number | null | undefined) {
  return value !== null && value !== undefined && value > 0
    ? formatFoodMeasurementAmount(value)
    : "";
}

function productForm(product: BarcodeProduct): LabelForm {
  const weightUnit = preferredWeightUnitFromServingLabel(
    product.servingLabel ?? undefined,
  );
  const volumeUnit = preferredVolumeUnitFromServingLabel(
    product.servingLabel ?? undefined,
  );
  const hasStructuredServing = Boolean(
    (product.householdQuantityPerServing && product.householdUnit) ||
    product.servingWeightGrams ||
    product.servingVolumeMl,
  );
  return {
    description: "",
    name: product.name === "Scanned product" ? "" : product.name,
    brand: product.brand ?? "",
    fallbackServingLabel: hasStructuredServing
      ? ""
      : (product.servingLabel ?? ""),
    householdAmount: positiveValueOrBlank(product.householdQuantityPerServing),
    householdUnit: product.householdUnit ?? "",
    weightAmount: measurementValueOrBlank(
      product.servingWeightGrams
        ? convertWeightAmount(product.servingWeightGrams, "g", weightUnit)
        : undefined,
    ),
    weightUnit,
    volumeAmount: measurementValueOrBlank(
      product.servingVolumeMl
        ? convertVolumeAmount(product.servingVolumeMl, "ml", volumeUnit)
        : undefined,
    ),
    volumeUnit,
    calories: valueOrBlank(product.nutrientsPerServing.calories),
    protein: valueOrBlank(product.nutrientsPerServing.proteinGrams),
    carbohydrates: valueOrBlank(product.nutrientsPerServing.carbohydrateGrams),
    fat: valueOrBlank(product.nutrientsPerServing.fatGrams),
    fiber: valueOrBlank(product.nutrientsPerServing.fiberGrams),
    sugar: valueOrBlank(product.nutrientsPerServing.sugarGrams),
    sodium: valueOrBlank(product.nutrientsPerServing.sodiumMg),
  };
}

function basisForm(basis: FoodBasis): LabelForm {
  const weightUnit = preferredWeightUnitFromServingLabel(basis.servingLabel);
  const volumeUnit = preferredVolumeUnitFromServingLabel(basis.servingLabel);
  const hasStructuredServing = Boolean(
    (basis.householdQuantityPerServing && basis.householdUnit) ||
    basis.servingWeightGrams ||
    basis.servingVolumeMl,
  );
  return {
    description: basis.description ?? "",
    name: basis.name,
    brand: basis.brand ?? "",
    fallbackServingLabel: hasStructuredServing
      ? ""
      : (basis.servingLabel ?? ""),
    householdAmount: positiveValueOrBlank(basis.householdQuantityPerServing),
    householdUnit: basis.householdUnit ?? "",
    weightAmount: measurementValueOrBlank(
      basis.servingWeightGrams
        ? convertWeightAmount(basis.servingWeightGrams, "g", weightUnit)
        : undefined,
    ),
    weightUnit,
    volumeAmount: measurementValueOrBlank(
      basis.servingVolumeMl
        ? convertVolumeAmount(basis.servingVolumeMl, "ml", volumeUnit)
        : undefined,
    ),
    volumeUnit,
    calories: valueOrBlank(basis.nutrientsPerServing.calories),
    protein: valueOrBlank(basis.nutrientsPerServing.proteinGrams),
    carbohydrates: valueOrBlank(basis.nutrientsPerServing.carbohydrateGrams),
    fat: valueOrBlank(basis.nutrientsPerServing.fatGrams),
    fiber: valueOrBlank(basis.nutrientsPerServing.fiberGrams),
    sugar: valueOrBlank(basis.nutrientsPerServing.sugarGrams),
    sodium: valueOrBlank(basis.nutrientsPerServing.sodiumMg),
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
    fallbackServingLabel: form.fallbackServingLabel.trim(),
  });
}

export function FoodEditor({
  userId,
  visible,
  initial,
  labelManagementOnly = false,
  onClose,
  onSave,
}: {
  userId: string;
  visible: boolean;
  initial?: MealDraftEntry;
  labelManagementOnly?: boolean;
  onClose: () => void;
  onSave: (entry: MealDraftEntry) => void;
}) {
  const [mode, setMode] = useState<EditorMode>("methods");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [managingLabels, setManagingLabels] = useState(false);
  const [label, setLabel] = useState<LabelForm>(blankLabel);
  const [labelSource, setLabelSource] = useState<FoodBasis["source"]>("manual");
  const [catalogProductId, setCatalogProductId] = useState<string>();
  const [barcode, setBarcode] = useState<string>();
  const [providerSignature, setProviderSignature] = useState<string>();
  const [labelProfileId, setLabelProfileId] = useState<string>();
  const [labelAlreadyCorrected, setLabelAlreadyCorrected] = useState(false);
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
  const [editingProfileId, setEditingProfileId] = useState<string>();
  const [pendingProfileDeletion, setPendingProfileDeletion] =
    useState<FoodSuggestion>();

  useEffect(() => {
    if (!visible) return;
    setFeedback("");
    setSaving(false);
    setQuery("");
    setSuggestions([]);
    setScanLocked(false);
    setTorch(false);
    setManualBarcode("");
    setEditingProfileId(undefined);
    setLabelProfileId(undefined);
    setLabelAlreadyCorrected(false);
    setPendingProfileDeletion(undefined);
    if (!initial) {
      setMode(labelManagementOnly ? "search" : "methods");
      setManagingLabels(labelManagementOnly);
      setLabel(blankLabel());
      setBasis(undefined);
      setCatalogProductId(undefined);
      setBarcode(undefined);
      setProviderSignature(undefined);
      setNote("");
      return;
    }
    setNote(initial.note ?? "");
    const nextBasis: FoodBasis = {
      profileId: initial.profileId,
      catalogProductId: initial.catalogProductId,
      name: initial.name,
      description: initial.description,
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
  }, [initial, labelManagementOnly, visible]);

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
    setEditingProfileId(undefined);
    setLabelProfileId(undefined);
    setLabelAlreadyCorrected(false);
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
    setEditingProfileId(undefined);
    setLabelProfileId(undefined);
    setLabelAlreadyCorrected(false);
    setLabelSource("manual");
    setCatalogProductId(undefined);
    setBarcode(undefined);
    setProviderSignature(undefined);
    setFeedback("");
    setMode("label");
  }

  function currentLabelBasis(): FoodBasis | undefined {
    const calories = numberOrUndefined(label.calories);
    const protein = numberOrUndefined(label.protein);
    if (!label.name.trim() || calories === undefined || protein === undefined) {
      setFeedback("Enter the food name, calories, and protein per serving.");
      return undefined;
    }
    const weight = numberOrUndefined(label.weightAmount);
    const volume = numberOrUndefined(label.volumeAmount);
    const householdAmount = numberOrUndefined(label.householdAmount);
    const householdUnit = normalizeHouseholdUnit(label.householdUnit);
    if (label.weightAmount.trim() && (!weight || weight <= 0)) {
      setFeedback("Serving weight must be greater than zero or left blank.");
      return undefined;
    }
    if (label.volumeAmount.trim() && (!volume || volume <= 0)) {
      setFeedback("Serving volume must be greater than zero or left blank.");
      return undefined;
    }
    if (Boolean(label.householdAmount.trim()) !== Boolean(householdUnit)) {
      setFeedback(
        "Enter both the package/piece amount and its unit, or leave both blank.",
      );
      return undefined;
    }
    if (
      label.householdAmount.trim() &&
      (!householdAmount || householdAmount <= 0)
    ) {
      setFeedback("Package or piece amount must be greater than zero.");
      return undefined;
    }
    if (householdUnit && !isSpecificHouseholdUnit(householdUnit)) {
      setFeedback(
        'Use a specific item unit such as "bottle", "package", or "piece". Put weights and volumes in their matching fields.',
      );
      return undefined;
    }
    if (
      !hasReproducibleServingBasis({
        householdAmount,
        householdUnit,
        weightAmount: weight,
        volumeAmount: volume,
      })
    ) {
      setFeedback(
        "Add a serving weight, serving volume, or a specific item amount and unit.",
      );
      return undefined;
    }
    return {
      profileId: editingProfileId ?? labelProfileId,
      catalogProductId,
      name: label.name.trim(),
      description: label.description.trim() || undefined,
      brand: label.brand.trim() || undefined,
      barcode,
      source: labelSource,
      isUserCorrected:
        labelAlreadyCorrected ||
        (labelSource === "open_food_facts" &&
          providerSignature !== undefined &&
          providerSignature !== formSignature(label)),
      servingLabel: buildServingLabel({
        fallback: label.fallbackServingLabel,
        householdAmount,
        householdUnit: householdUnit || undefined,
        weightAmount: weight,
        weightUnit: label.weightUnit,
        volumeAmount: volume,
        volumeUnit: label.volumeUnit,
      }),
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
  }

  function continueLabel() {
    const nextBasis = currentLabelBasis();
    if (!nextBasis) return;
    const householdAmount = nextBasis.householdQuantityPerServing;
    const householdUnit = nextBasis.householdUnit;
    setBasis(nextBasis);
    setAmount(String(householdAmount ?? 1));
    setUnit(householdAmount && householdUnit ? "household" : "serving");
    setEntryMethod(labelSource === "open_food_facts" ? "barcode" : "label");
    setFeedback("");
    setMode("amount");
  }

  async function saveEditedLabel() {
    const nextBasis = currentLabelBasis();
    if (!nextBasis?.profileId) return;
    setSaving(true);
    setFeedback("");
    try {
      const updated = await updateFoodProfile(userId, nextBasis);
      setSuggestions((current) =>
        current.map((item) =>
          item.basis.profileId === updated.profileId
            ? { ...item, basis: updated }
            : item,
        ),
      );
      setEditingProfileId(undefined);
      setLabelProfileId(undefined);
      setLabelAlreadyCorrected(false);
      setMode("search");
      setFeedback("Food label updated.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not update food label.",
      );
    } finally {
      setSaving(false);
    }
  }

  function editSuggestion(item: FoodSuggestion) {
    if (!item.basis.profileId) return;
    const nextForm = basisForm(item.basis);
    setLabel(nextForm);
    setLabelSource(item.basis.source);
    setCatalogProductId(item.basis.catalogProductId);
    setBarcode(item.basis.barcode);
    setProviderSignature(
      item.basis.source === "open_food_facts"
        ? formSignature(nextForm)
        : undefined,
    );
    setEditingProfileId(item.basis.profileId);
    setLabelProfileId(item.basis.profileId);
    setLabelAlreadyCorrected(item.basis.isUserCorrected);
    setPendingProfileDeletion(undefined);
    setFeedback("");
    setMode("label");
  }

  async function deletePendingProfile() {
    const profileId = pendingProfileDeletion?.basis.profileId;
    if (!profileId) return;
    setSaving(true);
    setFeedback("");
    try {
      await archiveFoodProfile(userId, profileId);
      setSuggestions((current) =>
        current.filter((item) => item.basis.profileId !== profileId),
      );
      setPendingProfileDeletion(undefined);
      setFeedback("Food label deleted. Past food history is unchanged.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not delete food label.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function finishAmount() {
    if (!basis || !calculated) {
      return setFeedback("Enter a valid amount using an available unit.");
    }
    setSaving(true);
    setFeedback("");
    try {
      const shouldUpdateProfile =
        basis.profileId && ["label", "barcode"].includes(entryMethod);
      const finalBasis = shouldUpdateProfile
        ? await updateFoodProfile(userId, basis)
        : basis.profileId
          ? basis
          : await saveFoodProfile(userId, basis);
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

  function chooseSuggestion(item: FoodSuggestion) {
    const units = availableFoodUnits(item.basis);
    setBasis(item.basis);
    setAmount(String(item.defaultAmount));
    setUnit(units.includes(item.defaultUnit) ? item.defaultUnit : "serving");
    setEntryMethod(item.kind === "recent" ? "history" : "profile");
    setNote(
      item.basis.source === "ai"
        ? `AI-estimated label. ${item.basis.description ?? ""}`.trim()
        : (item.basis.description ?? ""),
    );
    setFeedback("");
    setMode("amount");
  }

  function showSavedBarcodeProfile(
    savedProfile: FoodBasis,
    fallbackBarcode: string,
  ) {
    const nextForm = basisForm(savedProfile);
    setLabel(nextForm);
    setEditingProfileId(undefined);
    setLabelProfileId(savedProfile.profileId);
    setLabelAlreadyCorrected(savedProfile.isUserCorrected);
    setLabelSource(savedProfile.source);
    setCatalogProductId(savedProfile.catalogProductId);
    setBarcode(savedProfile.barcode ?? fallbackBarcode);
    setProviderSignature(
      savedProfile.source === "open_food_facts"
        ? formSignature(nextForm)
        : undefined,
    );
    setFeedback(
      hasReproducibleServingBasis({
        householdAmount: savedProfile.householdQuantityPerServing,
        householdUnit: savedProfile.householdUnit,
        weightAmount: savedProfile.servingWeightGrams,
        volumeAmount: savedProfile.servingVolumeMl,
      })
        ? "Using your saved food label for this barcode. Confirm it against the package before continuing."
        : "This saved label needs a serving weight, serving volume, or specific item amount and unit before continuing.",
    );
    setScanLocked(false);
    setMode("label");
  }

  async function lookupBarcode(raw: string, type: string) {
    if (scanLocked || !raw.trim()) return;
    setScanLocked(true);
    setFeedback("Looking up this product...");
    const scannedDigits = raw.replace(/\D/g, "");
    try {
      const savedByBarcode = await getFoodProfileByIdentity(userId, {
        barcode: scannedDigits,
      });
      if (shouldPreferSavedFoodProfile(savedByBarcode)) {
        showSavedBarcodeProfile(savedByBarcode, scannedDigits);
        return;
      }
      const product = await resolveFoodBarcode(raw, type);
      const savedProfile = await getFoodProfileByIdentity(userId, {
        barcode: product.barcode,
        catalogProductId: product.catalogProductId,
      });
      const useSavedProfile = shouldPreferSavedFoodProfile(savedProfile);
      if (useSavedProfile) {
        showSavedBarcodeProfile(savedProfile, product.barcode);
        return;
      }
      const nextForm = productForm(product);
      setLabel(nextForm);
      setEditingProfileId(undefined);
      setLabelProfileId(undefined);
      setLabelAlreadyCorrected(false);
      setLabelSource("open_food_facts");
      setCatalogProductId(product.catalogProductId);
      setBarcode(product.barcode);
      setProviderSignature(formSignature(nextForm));
      const hasServingBasis = hasReproducibleServingBasis({
        householdAmount: product.householdQuantityPerServing,
        householdUnit: product.householdUnit,
        weightAmount: product.servingWeightGrams,
        volumeAmount: product.servingVolumeMl,
      });
      setFeedback(
        !hasServingBasis
          ? "Serving size could not be determined. Add a weight, volume, or specific item amount and unit from the package."
          : product.complete
            ? "Confirm the package nutrition before continuing."
            : "Some serving or nutrition details are missing or inconsistent. Confirm them from the package.",
      );
      setMode("label");
    } catch (error) {
      if (
        error instanceof FoodBarcodeLookupError &&
        error.code === "not_found"
      ) {
        let savedProfile: FoodBasis | undefined;
        try {
          savedProfile = await getFoodProfileByIdentity(userId, {
            barcode: scannedDigits,
          });
        } catch (profileError) {
          setFeedback(
            profileError instanceof Error
              ? profileError.message
              : "Could not load your saved food label.",
          );
          setScanLocked(false);
          return;
        }
        if (savedProfile) {
          showSavedBarcodeProfile(savedProfile, scannedDigits);
          return;
        }
        setLabel(blankLabel());
        setEditingProfileId(undefined);
        setLabelProfileId(undefined);
        setLabelAlreadyCorrected(false);
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
    if (initial) return onClose();
    if (mode === "methods") return onClose();
    if (mode === "label" && editingProfileId) {
      setEditingProfileId(undefined);
      return setMode("search");
    }
    if (managingLabels && mode === "search") return onClose();
    if (mode === "amount" && (labelSource === "open_food_facts" || barcode))
      return setMode("label");
    setManagingLabels(false);
    setMode("methods");
  }

  function cancelProfileDeletion() {
    if (!saving) setPendingProfileDeletion(undefined);
  }

  function requestProfileDeletion(item: FoodSuggestion) {
    Keyboard.dismiss();
    setPendingProfileDeletion(item);
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={() =>
        pendingProfileDeletion ? cancelProfileDeletion() : back()
      }
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
              {initial || mode === "methods" ? "Close" : "Back"}
            </Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {editingProfileId
              ? "Edit food label"
              : modeTitle(mode, Boolean(initial), managingLabels)}
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
                  setManagingLabels(false);
                  setMode("search");
                }}
                onScan={() => {
                  setFeedback("");
                  setScanLocked(false);
                  setMode("scan");
                }}
              />
            ) : null}
            {mode === "label" ? (
              <LabelEditor
                form={label}
                setForm={setLabel}
                provider={labelSource === "open_food_facts"}
                attachedBarcode={labelSource === "manual" ? barcode : undefined}
                actionLabel={
                  editingProfileId
                    ? saving
                      ? "Saving..."
                      : "Save label"
                    : "Continue to amount"
                }
                disabled={saving}
                onContinue={
                  editingProfileId
                    ? () => void saveEditedLabel()
                    : continueLabel
                }
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
                edit={editSuggestion}
                managingLabels={managingLabels}
                requestDelete={requestProfileDeletion}
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
                editing={Boolean(initial)}
                saving={saving}
                onSave={() => void finishAmount()}
              />
            ) : null}
            {feedback ? (
              <Text
                style={
                  feedback.startsWith("Confirm") ||
                  feedback.startsWith("Food label")
                    ? styles.info
                    : styles.feedback
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
        {pendingProfileDeletion ? (
          <DeleteLabelConfirmation
            deleting={saving}
            foodName={pendingProfileDeletion.basis.name}
            onCancel={cancelProfileDeletion}
            onConfirm={() => void deletePendingProfile()}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function modeTitle(
  mode: EditorMode,
  editing: boolean,
  managingLabels: boolean,
) {
  if (editing) return "Edit amount";
  if (managingLabels && mode === "search") return "Manage food labels";
  if (mode === "methods") return "Add food";
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
    ["Find or add food", onSearch],
    ["Scan barcode", onScan],
    ["Create food label", onLabel],
  ] as const;
  return (
    <>
      {methods.map(([title, action]) => (
        <Pressable
          accessibilityRole="button"
          key={title}
          accessibilityLabel={title}
          onPress={action}
          style={styles.methodCard}
        >
          <View style={{ marginRight: 12 }}>
            <Icon
              name={
                title === "Scan barcode"
                  ? "scan"
                  : title === "Create food label"
                    ? "edit"
                    : "food"
              }
              color={colors.blue}
              size={23}
            />
          </View>
          <View style={styles.methodText}>
            <Text style={styles.methodTitle}>{title}</Text>
          </View>
          <Icon name="chevron" size={18} color={colors.secondary} />
        </Pressable>
      ))}
    </>
  );
}

function LabelEditor({
  form,
  setForm,
  provider,
  attachedBarcode,
  actionLabel,
  disabled,
  onContinue,
}: {
  form: LabelForm;
  setForm: React.Dispatch<React.SetStateAction<LabelForm>>;
  provider: boolean;
  attachedBarcode?: string;
  actionLabel: string;
  disabled: boolean;
  onContinue: () => void;
}) {
  const change = (patch: Partial<LabelForm>) =>
    setForm((current) => ({ ...current, ...patch }));
  const selectWeightUnit = (weightUnit: WeightUnit) => {
    const amount = numberOrUndefined(form.weightAmount);
    change({
      weightUnit,
      weightAmount:
        amount === undefined || weightUnit === form.weightUnit
          ? form.weightAmount
          : formatFoodMeasurementAmount(
              convertWeightAmount(amount, form.weightUnit, weightUnit),
            ),
    });
  };
  const selectVolumeUnit = (volumeUnit: VolumeUnit) => {
    const amount = numberOrUndefined(form.volumeAmount);
    change({
      volumeUnit,
      volumeAmount:
        amount === undefined || volumeUnit === form.volumeUnit
          ? form.volumeAmount
          : formatFoodMeasurementAmount(
              convertVolumeAmount(amount, form.volumeUnit, volumeUnit),
            ),
    });
  };
  return (
    <>
      {provider ? (
        <View style={styles.sourceNotice}>
          <Text style={styles.sourceNoticeTitle}>Open Food Facts</Text>
          <Text style={styles.sourceNoticeCopy}>
            Verify against the package. Corrections stay in My Foods.
          </Text>
        </View>
      ) : attachedBarcode ? (
        <View style={styles.sourceNotice}>
          <Text style={styles.sourceNoticeTitle}>Product not found</Text>
          <Text style={styles.sourceNoticeCopy}>
            Enter the package label for {attachedBarcode}.
          </Text>
        </View>
      ) : null}
      <FormField
        label="Food name"
        value={form.name}
        onChangeText={(name) => change({ name })}
      />
      <FormField
        label="Description (optional)"
        value={form.description}
        onChangeText={(description) =>
          change({ description: description.slice(0, 600) })
        }
      />
      <FormField
        label="Brand (optional)"
        value={form.brand}
        onChangeText={(brand) => change({ brand })}
      />
      <Text style={styles.sectionLabel}>Serving size</Text>
      <Text style={styles.help}>
        Required: enter a weight, a volume, or a count with a specific item unit
        such as 1 bottle, 1 package, or 12 pieces. Do not use a generic
        &quot;serving&quot; as the item unit.
      </Text>
      <View style={styles.formRow}>
        <FormField
          compact
          label="Items per serving"
          value={form.householdAmount}
          onChangeText={(householdAmount) => change({ householdAmount })}
          placeholder="Example: 12"
          keyboard
        />
        <FormField
          compact
          label="Item unit"
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
          onSelect={(weightUnit) => selectWeightUnit(weightUnit as WeightUnit)}
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
          onSelect={(volumeUnit) => selectVolumeUnit(volumeUnit as VolumeUnit)}
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
      <PrimaryButton
        disabled={disabled}
        label={actionLabel}
        onPress={onContinue}
      />
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
  edit,
  managingLabels,
  requestDelete,
}: {
  query: string;
  setQuery: (value: string) => void;
  suggestions: FoodSuggestion[];
  searching: boolean;
  choose: (item: FoodSuggestion) => void;
  createLabel: () => void;
  edit: (item: FoodSuggestion) => void;
  managingLabels: boolean;
  requestDelete: (item: FoodSuggestion) => void;
}) {
  const recent = suggestions.filter((item) => item.kind === "recent");
  const profiles = suggestions.filter((item) => item.kind === "profile");
  const managedProfiles = Array.from(
    new Map(
      suggestions
        .filter((item) => item.basis.profileId)
        .map((item) => [item.basis.profileId, item]),
    ).values(),
  );
  const hasExactSavedName = suggestions.some((item) =>
    foodNameMatchesQuery(item.basis.name, query),
  );
  const hasQuery = Boolean(query.trim());
  return (
    <>
      <TextInput
        autoFocus
        accessibilityLabel={
          managingLabels ? "Search food labels" : "Find or add food"
        }
        onChangeText={setQuery}
        placeholder="Enter a food name or brand"
        placeholderTextColor="#9FB3C8"
        style={[styles.input, styles.searchInput]}
        value={query}
      />
      <Text style={styles.help}>
        {managingLabels
          ? "Edit or delete reusable labels saved in My Foods. Past food history will not change."
          : "Select a match from your Recent or My Foods records. If the food does not exist, create a reusable label with its name already filled in."}
      </Text>
      {searching ? <Text style={styles.searchState}>Searching...</Text> : null}
      {managingLabels ? (
        <SuggestionSection
          label="My Foods"
          items={managedProfiles}
          choose={edit}
          edit={edit}
          requestDelete={requestDelete}
          showActions
        />
      ) : (
        <>
          <SuggestionSection
            label="Recent"
            items={recent}
            choose={choose}
            edit={edit}
            requestDelete={requestDelete}
          />
          <SuggestionSection
            label="My Foods"
            items={profiles}
            choose={choose}
            edit={edit}
            requestDelete={requestDelete}
          />
        </>
      )}
      {!searching && managingLabels && !managedProfiles.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {hasQuery ? "No matching food labels" : "No food labels yet"}
          </Text>
          <Text style={styles.emptyCopy}>
            {hasQuery
              ? "Try another food name or brand."
              : "Labels are created automatically when you scan or track food."}
          </Text>
        </View>
      ) : !searching && !managingLabels && hasQuery && !hasExactSavedName ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No exact saved food</Text>
          <Text style={styles.emptyCopy}>
            Create a reusable label for “{query.trim()}”?
          </Text>
          <PrimaryButton label="Create food label" onPress={createLabel} />
        </View>
      ) : !searching && !managingLabels && !hasQuery && !suggestions.length ? (
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

function DeleteLabelConfirmation({
  deleting,
  foodName,
  onCancel,
  onConfirm,
}: {
  deleting: boolean;
  foodName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.profileDeleteOverlay}>
      <View accessibilityViewIsModal style={styles.profileDeleteDialog}>
        <Text style={styles.profileDeleteTitle}>
          Delete {foodName} from My Foods?
        </Text>
        <Text style={styles.profileDeleteCopy}>
          Past food history will not change.
        </Text>
        <View style={styles.profileDeleteActions}>
          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={onCancel}
            style={styles.profileDeleteCancel}
          >
            <Text style={styles.profileDeleteCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={onConfirm}
            style={[
              styles.profileDeleteConfirm,
              deleting && styles.profileDeleteDisabled,
            ]}
          >
            <Text style={styles.profileDeleteConfirmText}>
              {deleting ? "Deleting..." : "Delete label"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SuggestionSection({
  label,
  items,
  choose,
  edit,
  requestDelete,
  showActions = false,
}: {
  label: string;
  items: FoodSuggestion[];
  choose: (item: FoodSuggestion) => void;
  edit: (item: FoodSuggestion) => void;
  requestDelete: (item: FoodSuggestion) => void;
  showActions?: boolean;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.suggestionSection}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {items.map((item) => (
        <View key={item.key} style={styles.suggestionCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => choose(item)}
            style={styles.suggestionSelect}
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
          </Pressable>
          {showActions && item.basis.profileId ? (
            <View style={styles.profileActions}>
              <Pressable
                accessibilityLabel={`Edit ${item.basis.name} food label`}
                accessibilityRole="button"
                onPress={() => edit(item)}
                style={styles.profileActionButton}
              >
                <Text style={styles.profileEditText}>Edit label</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Delete ${item.basis.name} food label`}
                accessibilityRole="button"
                onPress={() => requestDelete(item)}
                style={[styles.profileActionButton, styles.profileDeleteAction]}
              >
                <Text style={styles.profileDeleteText}>Delete label</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
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
  editing,
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
  editing: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <>
      <View style={styles.foodIdentity}>
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
        label={saving ? "Saving..." : editing ? "Save amount" : "Add to meal"}
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
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: "center",
    borderBottomColor: colors.separator,
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 14,
  },
  headerButton: { minWidth: 58, paddingVertical: 10 },
  headerButtonText: { color: colors.blue, fontWeight: "600" },
  headerTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  headerSpacer: { width: 58 },
  content: { padding: 20, paddingBottom: 42 },
  methodCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 11,
    minHeight: 68,
    padding: 15,
  },
  methodText: { flex: 1 },
  methodTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  arrow: { color: colors.blue, fontSize: 22, marginLeft: 10 },
  field: { marginBottom: 14 },
  compactField: { flex: 1, minWidth: 110 },
  fieldLabel: trackingStyles.label,
  input: trackingStyles.input,
  multiline: { minHeight: 82, textAlignVertical: "top" },
  formRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  sectionLabel: { ...trackingStyles.section, marginTop: 8 },
  help: {
    color: colors.tertiary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  unitRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 14,
    marginTop: 7,
  },
  unitChip: trackingStyles.chip,
  unitChipActive: trackingStyles.chipActive,
  unitText: trackingStyles.chipText,
  unitTextActive: trackingStyles.chipTextActive,
  primaryButton: { ...trackingStyles.button, marginTop: 8 },
  primaryDisabled: { opacity: 0.6 },
  primaryText: trackingStyles.buttonText,
  feedback: {
    color: "#B42318",
    lineHeight: 20,
    marginTop: 14,
    textAlign: "center",
  },
  info: {
    color: colors.blue,
    lineHeight: 20,
    marginTop: 14,
    textAlign: "center",
  },
  sourceNotice: {
    backgroundColor: colors.blueSoft,
    borderRadius: 13,
    marginBottom: 16,
    padding: 13,
  },
  sourceNoticeTitle: { color: colors.blue, fontWeight: "600" },
  sourceNoticeCopy: { color: colors.secondary, lineHeight: 18, marginTop: 4 },
  searchInput: { marginBottom: 8 },
  searchState: { color: colors.secondary, marginVertical: 10 },
  suggestionSection: { marginTop: 10 },
  suggestionCard: {
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 13,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  suggestionSelect: {
    alignItems: "flex-start",
    flexDirection: "row",
    padding: 12,
  },
  suggestionMain: { flex: 1 },
  suggestionName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  suggestionBrand: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  suggestionMeta: { color: colors.tertiary, fontSize: 12, marginTop: 4 },
  profileActions: {
    borderTopColor: colors.fill,
    borderTopWidth: 1,
    flexDirection: "row",
  },
  profileActionButton: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  profileDeleteAction: {
    borderLeftColor: colors.fill,
    borderLeftWidth: 1,
  },
  profileEditText: { color: colors.blue, fontSize: 12, fontWeight: "600" },
  profileDeleteText: { color: "#B42318", fontSize: 12, fontWeight: "600" },
  profileDeleteOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(16, 42, 67, 0.52)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 24,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 10,
  },
  profileDeleteDialog: {
    backgroundColor: "#fff",
    borderRadius: 18,
    maxWidth: 420,
    padding: 20,
    width: "100%",
  },
  profileDeleteTitle: { color: colors.text, fontSize: 19, fontWeight: "600" },
  profileDeleteCopy: { color: colors.secondary, lineHeight: 20, marginTop: 8 },
  profileDeleteActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 20,
  },
  profileDeleteCancel: {
    alignItems: "center",
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 15,
  },
  profileDeleteCancelText: { color: colors.secondary, fontWeight: "600" },
  profileDeleteConfirm: {
    alignItems: "center",
    backgroundColor: "#B42318",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 16,
  },
  profileDeleteDisabled: { opacity: 0.6 },
  profileDeleteConfirmText: { color: "#fff", fontWeight: "600" },
  empty: {
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    padding: 18,
  },
  emptyTitle: { color: colors.text, fontWeight: "600" },
  emptyCopy: { color: colors.secondary, lineHeight: 19, marginTop: 5 },
  foodIdentity: { ...trackingStyles.card, marginBottom: 18 },
  foodIdentityName: trackingStyles.section,
  amountInput: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 5,
    maxWidth: 180,
  },
  totalCard: { ...trackingStyles.card, marginBottom: 17 },
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
    marginTop: 5,
  },
  totalMeta: {
    color: colors.secondary,
    fontSize: 15,
    fontWeight: "600",
    marginTop: 3,
  },
  totalDetails: { color: colors.secondary, fontSize: 13, marginTop: 8 },
  scannerPage: { flex: 1 },
  cameraFrame: {
    backgroundColor: colors.text,
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
  torchText: { color: colors.text, fontWeight: "600" },
  permissionCard: {
    backgroundColor: "#fff",
    borderColor: colors.separator,
    borderRadius: 15,
    borderWidth: 1,
    margin: 18,
    padding: 18,
  },
  permissionButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.blue,
    borderRadius: 10,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  permissionButtonText: { color: "#fff", fontWeight: "600" },
  manualCard: {
    backgroundColor: colors.background,
    borderTopColor: colors.separator,
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

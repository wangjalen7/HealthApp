import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  coachExperienceLevels,
  coachGoals,
  coachProfileSchema,
  type CoachProfile,
} from "../../../../../supabase/functions/_shared/coach";
import { Pressable } from "../../ui/pressable";
import { colors, surfaces } from "../../ui/profile-theme";
import { Icon } from "../../ui/icon";
import { trackingStyles as shared } from "../../ui/tracking-styles";

const goalLabels: Record<(typeof coachGoals)[number], string> = {
  muscle_gain: "Muscle gain",
  fat_loss: "Fat loss",
  recomp: "Recomp",
  maintenance: "Maintenance",
  performance: "Performance",
  general_health: "General health",
};
const experienceLabels: Record<(typeof coachExperienceLevels)[number], string> =
  {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
  };

type Form = {
  goals: CoachProfile["goals"];
  experienceLevel: CoachProfile["experienceLevel"];
  trainingDaysPerWeek: string;
  sessionMinutes: string;
  equipment: string;
  limitations: string;
  dietaryPreferences: string;
  dietaryRestrictions: string;
  dislikedFoods: string;
  mealPrepMinutes: string;
  heightInches: string;
  birthYear: string;
  energyEstimationSex: "" | "female" | "male";
  targetWeightChangeLbWeek: string;
  responseStyle: CoachProfile["responseStyle"];
  useNutrition: boolean;
  useTraining: boolean;
  useVitals: boolean;
  useHydration: boolean;
  usePhotoMetadata: boolean;
};

function formFromProfile(profile?: CoachProfile): Form {
  return {
    goals: profile?.goals ?? [],
    experienceLevel: profile?.experienceLevel ?? "beginner",
    trainingDaysPerWeek: String(profile?.trainingDaysPerWeek ?? 3),
    sessionMinutes: String(profile?.sessionMinutes ?? 60),
    equipment: profile?.equipment.join(", ") ?? "",
    limitations: profile?.limitations ?? "",
    dietaryPreferences: profile?.dietaryPreferences.join(", ") ?? "",
    dietaryRestrictions: profile?.dietaryRestrictions.join(", ") ?? "",
    dislikedFoods: profile?.dislikedFoods.join(", ") ?? "",
    mealPrepMinutes:
      profile?.mealPrepMinutes === undefined
        ? ""
        : String(profile.mealPrepMinutes),
    heightInches:
      profile?.heightInches === undefined ? "" : String(profile.heightInches),
    birthYear:
      profile?.birthYear === undefined ? "" : String(profile.birthYear),
    energyEstimationSex: profile?.energyEstimationSex ?? "",
    targetWeightChangeLbWeek:
      profile?.targetWeightChangeLbWeek === undefined
        ? ""
        : String(profile.targetWeightChangeLbWeek),
    responseStyle: profile?.responseStyle ?? "concise",
    useNutrition: profile?.useNutrition ?? true,
    useTraining: profile?.useTraining ?? true,
    useVitals: profile?.useVitals ?? true,
    useHydration: profile?.useHydration ?? true,
    usePhotoMetadata: profile?.usePhotoMetadata ?? true,
  };
}

const list = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
const optionalNumber = (value: string) =>
  value.trim() ? Number(value.replace(",", ".")) : undefined;

export function CoachSetup({
  userId,
  initial,
  saving,
  onSave,
  onCancel,
}: {
  userId: string;
  initial?: CoachProfile;
  saving: boolean;
  onSave: (profile: CoachProfile) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(() => formFromProfile(initial));
  const [consent, setConsent] = useState(Boolean(initial?.consentedAt));
  const [feedback, setFeedback] = useState("");
  const selectedCount = useMemo(
    () =>
      [
        form.useNutrition,
        form.useTraining,
        form.useVitals,
        form.useHydration,
        form.usePhotoMetadata,
      ].filter(Boolean).length,
    [form],
  );

  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setFeedback("");
    if (!consent) {
      setFeedback("Consent is required before AI Coach can use selected data.");
      return;
    }
    if (!selectedCount) {
      setFeedback("Select at least one health-data category.");
      return;
    }
    if (!form.goals.length) {
      setFeedback("Select at least one goal.");
      return;
    }
    const parsed = coachProfileSchema.safeParse({
      userId,
      goals: form.goals,
      experienceLevel: form.experienceLevel,
      trainingDaysPerWeek: Number(form.trainingDaysPerWeek),
      sessionMinutes: Number(form.sessionMinutes),
      equipment: list(form.equipment),
      limitations: form.limitations.trim() || undefined,
      dietaryPreferences: list(form.dietaryPreferences),
      dietaryRestrictions: list(form.dietaryRestrictions),
      dislikedFoods: list(form.dislikedFoods),
      mealPrepMinutes: optionalNumber(form.mealPrepMinutes),
      heightInches: optionalNumber(form.heightInches),
      birthYear: optionalNumber(form.birthYear),
      energyEstimationSex: form.energyEstimationSex || undefined,
      targetWeightChangeLbWeek: optionalNumber(form.targetWeightChangeLbWeek),
      responseStyle: form.responseStyle,
      useNutrition: form.useNutrition,
      useTraining: form.useTraining,
      useVitals: form.useVitals,
      useHydration: form.useHydration,
      usePhotoMetadata: form.usePhotoMetadata,
      consentedAt: initial?.consentedAt ?? new Date().toISOString(),
    });
    if (!parsed.success) {
      setFeedback(parsed.error.issues[0]?.message ?? "Check your Coach setup.");
      return;
    }
    try {
      await onSave(parsed.data);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save Coach setup.",
      );
    }
  }

  return (
    <View style={styles.stack}>
      <View>
        <View style={styles.setupMark}>
          <Icon name="sparkles" size={24} color={colors.onAccent} />
        </View>
        <Text accessibilityRole="header" style={styles.heading}>
          {initial ? "Coach settings" : "Set up your Coach"}
        </Text>
        <Text style={styles.copy}>
          Choose the data and preferences Coach can use. Suggestions are
          estimates and always require your review.
        </Text>
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Your training</Text>
        <MultiChoiceGroup
          label="Goals"
          values={coachGoals}
          selected={form.goals}
          labelFor={(value) => goalLabels[value]}
          onToggle={(value) =>
            update(
              "goals",
              form.goals.includes(value)
                ? form.goals.filter((goal) => goal !== value)
                : [...form.goals, value],
            )
          }
        />
        <ChoiceGroup
          label="Experience"
          values={coachExperienceLevels}
          selected={form.experienceLevel}
          labelFor={(value) => experienceLabels[value]}
          onSelect={(value) => update("experienceLevel", value)}
        />
        <View style={styles.row}>
          <Field
            label="Training days per week"
            value={form.trainingDaysPerWeek}
            onChangeText={(value) => update("trainingDaysPerWeek", value)}
            keyboardType="number-pad"
          />
          <Field
            label="Session length (minutes)"
            value={form.sessionMinutes}
            onChangeText={(value) => update("sessionMinutes", value)}
            keyboardType="number-pad"
          />
        </View>
        <Field
          label="Available equipment"
          value={form.equipment}
          onChangeText={(value) => update("equipment", value)}
          placeholder="Dumbbells, barbell, cable machine"
        />
        <Field
          label="Injuries or limitations"
          value={form.limitations}
          onChangeText={(value) => update("limitations", value)}
          placeholder="Optional"
          multiline
        />
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Nutrition & preferences</Text>
        <Field
          label="Dietary preferences"
          value={form.dietaryPreferences}
          onChangeText={(value) => update("dietaryPreferences", value)}
          placeholder="High protein, quick meals"
        />
        <Field
          label="Dietary restrictions"
          value={form.dietaryRestrictions}
          onChangeText={(value) => update("dietaryRestrictions", value)}
          placeholder="Optional, separated by commas"
        />
        <Field
          label="Disliked foods"
          value={form.dislikedFoods}
          onChangeText={(value) => update("dislikedFoods", value)}
          placeholder="Optional, separated by commas"
        />
      </View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Personal details</Text>
        <View style={styles.row}>
          <Field
            label="Meal prep minutes"
            value={form.mealPrepMinutes}
            onChangeText={(value) => update("mealPrepMinutes", value)}
            keyboardType="number-pad"
            placeholder="Optional"
          />
          <Field
            label="Height (inches)"
            value={form.heightInches}
            onChangeText={(value) => update("heightInches", value)}
            keyboardType="decimal-pad"
            placeholder="Optional"
          />
        </View>
        <View style={styles.row}>
          <Field
            label="Birth year"
            value={form.birthYear}
            onChangeText={(value) => update("birthYear", value)}
            keyboardType="number-pad"
            placeholder="Optional"
          />
          <Field
            label="Weight change (lb/week)"
            value={form.targetWeightChangeLbWeek}
            onChangeText={(value) => update("targetWeightChangeLbWeek", value)}
            keyboardType="numbers-and-punctuation"
            placeholder="Optional"
          />
        </View>
        <ChoiceGroup
          label="Sex used for energy estimates (optional)"
          values={["", "female", "male"] as const}
          selected={form.energyEstimationSex}
          labelFor={(value) =>
            value === ""
              ? "Not provided"
              : value === "female"
                ? "Female"
                : "Male"
          }
          onSelect={(value) => update("energyEstimationSex", value)}
        />
        <ChoiceGroup
          label="Response style"
          values={["concise", "detailed"] as const}
          selected={form.responseStyle}
          labelFor={(value) => (value === "concise" ? "Concise" : "Detailed")}
          onSelect={(value) => update("responseStyle", value)}
        />
      </View>
      <View style={styles.card}>
        <Text style={shared.section}>Data Coach may use</Text>
        <Toggle
          label="Meals and nutrition goals"
          checked={form.useNutrition}
          onPress={() => update("useNutrition", !form.useNutrition)}
        />
        <Toggle
          label="Workouts and exercise performance"
          checked={form.useTraining}
          onPress={() => update("useTraining", !form.useTraining)}
        />
        <Toggle
          label="Weight, blood pressure, and pulse"
          checked={form.useVitals}
          onPress={() => update("useVitals", !form.useVitals)}
        />
        <Toggle
          label="Hydration"
          checked={form.useHydration}
          onPress={() => update("useHydration", !form.useHydration)}
        />
        <Toggle
          label="Progress-photo dates only"
          checked={form.usePhotoMetadata}
          onPress={() => update("usePhotoMetadata", !form.usePhotoMetadata)}
        />
        <Text style={styles.detail}>
          Raw photos and medication or reminder names are excluded.
        </Text>
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="Allow AI Coach to use selected health data"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent((value) => !value)}
        style={styles.consent}
      >
        <View style={[styles.checkbox, consent && styles.checkboxSelected]}>
          {consent ? <Text style={styles.checkmark}>{"\u2713"}</Text> : null}
        </View>
        <Text style={styles.consentText}>
          I allow AI Coach to process the selected structured health data with
          OpenAI to provide personalized guidance.
        </Text>
      </Pressable>
      {feedback ? (
        <Text accessibilityLiveRegion="polite" style={shared.error}>
          {feedback}
        </Text>
      ) : null}
      <Pressable
        accessibilityLabel="Save Coach setup"
        disabled={saving}
        onPress={() => void submit()}
        style={shared.button}
      >
        <Text style={shared.buttonText}>
          {saving ? "Saving..." : "Save setup"}
        </Text>
      </Pressable>
      {onCancel ? (
        <Pressable onPress={onCancel} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={shared.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        maxLength={props.maxLength ?? 1000}
        placeholderTextColor={colors.tertiary}
        style={[surfaces.input, props.multiline && styles.multiline]}
      />
    </View>
  );
}

function ChoiceGroup<T extends string>({
  label,
  values,
  selected,
  labelFor,
  onSelect,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  labelFor: (value: T) => string;
  onSelect: (value: T) => void;
}) {
  return (
    <View>
      <Text style={shared.label}>{label}</Text>
      <View style={styles.chips}>
        {values.map((value) => (
          <Pressable
            key={value || "none"}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === value }}
            onPress={() => onSelect(value)}
            style={[shared.chip, selected === value && shared.chipActive]}
          >
            <Text
              style={
                selected === value ? shared.chipTextActive : shared.chipText
              }
            >
              {labelFor(value)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MultiChoiceGroup<T extends string>({
  label,
  values,
  selected,
  labelFor,
  onToggle,
}: {
  label: string;
  values: readonly T[];
  selected: readonly T[];
  labelFor: (value: T) => string;
  onToggle: (value: T) => void;
}) {
  return (
    <View>
      <Text style={shared.label}>{label}</Text>
      <Text style={styles.detail}>Choose all that apply.</Text>
      <View style={styles.chips}>
        {values.map((value) => {
          const checked = selected.includes(value);
          return (
            <Pressable
              key={value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => onToggle(value)}
              style={[shared.chip, checked && shared.chipActive]}
            >
              <Text style={checked ? shared.chipTextActive : shared.chipText}>
                {labelFor(value)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Toggle({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={styles.toggle}
    >
      <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
        {checked ? <Text style={styles.checkmark}>{"\u2713"}</Text> : null}
      </View>
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  setupMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#183D68",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  sectionCard: { ...surfaces.card, gap: 18, padding: 16 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "600" },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surface,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
  checkmark: { color: colors.onAccent, fontSize: 15, fontWeight: "600" },
  heading: {
    color: colors.text,
    fontSize: 27,
    fontWeight: "700",
    marginBottom: 8,
  },
  copy: { color: colors.secondary, fontSize: 15, lineHeight: 22 },
  detail: { color: colors.secondary, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  field: { flexBasis: 180, flexGrow: 1 },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { ...surfaces.card, padding: 16, gap: 8 },
  toggle: { alignItems: "center", flexDirection: "row", gap: 8, minHeight: 44 },
  toggleText: { color: colors.text, flex: 1, fontSize: 15 },
  check: { color: colors.blue, fontSize: 16, fontWeight: "700" },
  consent: {
    alignItems: "flex-start",
    backgroundColor: colors.blueSoft,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  consentText: { color: colors.text, flex: 1, fontSize: 14, lineHeight: 20 },
  secondaryButton: {
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  secondaryButtonText: { color: colors.blue, fontSize: 16, fontWeight: "600" },
});

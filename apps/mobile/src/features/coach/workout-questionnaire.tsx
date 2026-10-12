import { AiPrivacyDetails } from "../privacy/ai-privacy-details";
import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import {
  workoutPreferencesSchema,
  workoutGoalOptions,
  workoutStyleOptions,
  workoutPreferenceErrors,
  defaultWorkoutPreferences,
  type WorkoutPreferences,
} from "../../../../../supabase/functions/_shared/workout-planning";
import type { CoachProfile } from "../../../../../supabase/functions/_shared/coach";
import { Pressable } from "../../ui/pressable";
import { TextInput } from "../../ui/text-input";
import { colors } from "../../ui/theme";
import { muscleGroupLabel } from "../training/workout-draft";

type Props = {
  initial?: WorkoutPreferences;
  profile?: CoachProfile;
  busy: boolean;
  onGenerate: (
    preferences: WorkoutPreferences,
    includeHistory: boolean,
  ) => Promise<void>;
  onCancel?: () => void;
  onStepChange?: () => void;
};
export function WorkoutQuestionnaire({
  initial,
  profile,
  busy,
  onGenerate,
  onCancel,
  onStepChange,
}: Props) {
  const [step, setStep] = useState(0);
  const [value, setValue] = useState<WorkoutPreferences>(
    () =>
      initial ?? {
        ...defaultWorkoutPreferences,
        experience: profile?.experienceLevel ?? "beginner",
        minutes: Math.min(120, profile?.sessionMinutes ?? 45),
        limitations: profile?.limitations?.slice(0, 500) ?? "",
      },
  );
  const [includeHistory, setIncludeHistory] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    onStepChange?.();
  }, [step, onStepChange]);
  const fieldError = (field: string) =>
    errors[field] ? (
      <Text accessibilityRole="alert" style={styles.error}>
        {errors[field]}
      </Text>
    ) : null;
  const update = (patch: Partial<WorkoutPreferences>) => {
    setValue((current) => ({ ...current, ...patch }));
    setError("");
    setErrors({});
  };
  function choices(
    title: string,
    options: readonly (readonly [string, string])[],
    selected: string | string[],
    change: (id: string) => void,
    multiple = false,
  ) {
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.label}>
          {title}
        </Text>
        <View style={styles.choices}>
          {options.map(([id, label]) => {
            const checked = Array.isArray(selected)
              ? selected.includes(id)
              : selected === id;
            return (
              <Pressable
                key={id}
                accessibilityRole={multiple ? "checkbox" : "radio"}
                accessibilityLabel={label}
                accessibilityState={{ checked }}
                disabled={busy}
                onPress={() => change(id)}
                style={[styles.chip, checked && styles.selected]}
              >
                <Text style={[styles.text, checked && styles.selectedText]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {fieldError(
          (
            {
              "Session type": "sessionType",
              "Muscle focus (optional)": "focus",
              "Workout goals": "goals",
              "Training styles": "styles",
              "Cardio activity": "cardioActivity",
              "Where will you train?": "location",
              "Equipment available": "equipment",
              "Total session time": "minutes",
              "Exercise variety": "novelty",
              Experience: "experience",
              "How do you feel today?": "readiness",
            } as Record<string, string>
          )[title] ?? "",
        )}
      </View>
    );
  }
  const toggle = <T extends string>(items: T[], id: T) =>
    items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
  function otherInput(
    label: string,
    field:
      | "goalOther"
      | "styleOther"
      | "equipmentOther"
      | "locationOther"
      | "cardioOther",
  ) {
    return (
      <View style={{ gap: 6 }}>
        <TextInput
          accessibilityLabel={label}
          placeholder={label}
          value={value[field]}
          onChangeText={(text) => update({ [field]: text })}
          maxLength={160}
          editable={!busy}
          style={styles.input}
        />
        {fieldError(field)}
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <Text style={styles.caption}>STEP {step + 1} OF 3</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {["Session", "Equipment & time", "Preferences"][step]}
      </Text>
      {Object.keys(errors).length ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          Check the highlighted fields before continuing.
        </Text>
      ) : null}
      {step === 0 ? (
        <>
          {choices(
            "Session type",
            [
              ["lifting", "Lifting"],
              ["cardio", "Cardio"],
              ["combo", "Lifting + cardio"],
            ],
            value.sessionType,
            (id) =>
              update({ sessionType: id as WorkoutPreferences["sessionType"] }),
          )}
          {value.sessionType !== "cardio" ? (
            <>
              {choices(
                "Muscle focus (optional)",
                [
                  ["auto", "Recommend for me"],
                  ...["Back", "Chest", "Tri", "Bi", "Delt", "Legs", "Abs"].map(
                    (id) => [id, muscleGroupLabel(id)] as const,
                  ),
                ],
                value.focus.length ? value.focus : ["auto"],
                (id) =>
                  update({
                    focus:
                      id === "auto"
                        ? []
                        : toggle(
                            value.focus,
                            id as WorkoutPreferences["focus"][number],
                          ),
                  }),
                true,
              )}
            </>
          ) : null}
          {choices(
            "Workout goals",
            workoutGoalOptions,
            value.goals,
            (id) =>
              update({
                goals: toggle(
                  value.goals,
                  id as WorkoutPreferences["goals"][number],
                ),
              }),
            true,
          )}
          {value.goals.includes("other")
            ? otherInput("Describe your goal", "goalOther")
            : null}
          {choices(
            "Training styles",
            workoutStyleOptions,
            value.styles,
            (id) =>
              update({
                styles: toggle(
                  value.styles,
                  id as WorkoutPreferences["styles"][number],
                ),
              }),
            true,
          )}
          {value.styles.includes("other")
            ? otherInput("Describe your training style", "styleOther")
            : null}
          {value.sessionType !== "lifting" ? (
            <>
              {choices(
                "Cardio activity",
                [
                  ["auto", "Recommend cardio for me"],
                  ["walk", "Walking"],
                  ["run", "Running"],
                  ["cycle", "Cycling"],
                  ["swim", "Swimming"],
                  ["tennis", "Tennis"],
                  ["other", "Other cardio"],
                ],
                value.cardioActivity,
                (id) =>
                  update({
                    cardioActivity: id as WorkoutPreferences["cardioActivity"],
                  }),
              )}
              {value.cardioActivity === "other"
                ? otherInput("Describe your cardio activity", "cardioOther")
                : null}
            </>
          ) : null}
        </>
      ) : step === 1 ? (
        <>
          {choices(
            "Where will you train?",
            [
              ["gym", "Gym"],
              ["home", "Home"],
              ["outdoors", "Outdoors"],
              ["other", "Other location"],
            ],
            value.location,
            (id) =>
              update({
                location: id as WorkoutPreferences["location"],
                equipment:
                  id === "gym"
                    ? ["dumbbells", "barbell", "bench", "machines", "cables"]
                    : ["bodyweight"],
              }),
          )}
          {value.location === "other"
            ? otherInput("Describe your training location", "locationOther")
            : null}
          {choices(
            "Equipment available",
            [
              ["bodyweight", "No equipment"],
              ["dumbbells", "Dumbbells"],
              ["bands", "Resistance bands"],
              ["barbell", "Barbell and rack"],
              ["bench", "Bench"],
              ["machines", "Machines"],
              ["cables", "Cables"],
              ["pullup_bar", "Pull-up bar"],
              ["kettlebells", "Kettlebells"],
              ["treadmill", "Treadmill"],
              ["bike", "Exercise bike"],
              ["rower", "Rowing machine"],
              ["pool", "Pool"],
              ["other", "Other equipment"],
            ],
            value.equipment,
            (id) =>
              update({
                equipment:
                  id === "bodyweight"
                    ? ["bodyweight"]
                    : (() => {
                        const next = toggle(
                          value.equipment.filter(
                            (item) => item !== "bodyweight",
                          ),
                          id as WorkoutPreferences["equipment"][number],
                        );
                        return next.length ? next : ["bodyweight"];
                      })(),
              }),
            true,
          )}
          {value.equipment.includes("other")
            ? otherInput("Describe your equipment", "equipmentOther")
            : null}
          {choices(
            "Total session time",
            [...new Set([15, 30, 45, 60, 90, 120, value.minutes])]
              .sort((a, b) => a - b)
              .map((n) => [String(n), n + " min"] as const),
            String(value.minutes),
            (id) => update({ minutes: Number(id) }),
          )}
          {choices(
            "Exercise variety",
            [
              ["familiar", "Favor familiar exercises"],
              ["mix", "A mix"],
              ["new", "Open to new exercises"],
            ],
            value.novelty,
            (id) => update({ novelty: id as WorkoutPreferences["novelty"] }),
          )}
        </>
      ) : (
        <>
          {choices(
            "Experience",
            [
              ["beginner", "Beginner"],
              ["intermediate", "Intermediate"],
              ["advanced", "Advanced"],
            ],
            value.experience,
            (id) =>
              update({ experience: id as WorkoutPreferences["experience"] }),
          )}
          {choices(
            "How do you feel today?",
            [
              ["ready", "Ready to train"],
              ["tired", "Low energy"],
              ["sore", "Sore / need easier work"],
            ],
            value.readiness,
            (id) =>
              update({ readiness: id as WorkoutPreferences["readiness"] }),
          )}
          <Text style={styles.label}>Anything to work around? (optional)</Text>
          <TextInput
            accessibilityLabel="Workout limitations and preferences"
            value={value.limitations}
            onChangeText={(limitations) => update({ limitations })}
            multiline
            maxLength={500}
            placeholder="Movements to avoid, sore areas, exercises you enjoy..."
            editable={!busy}
            style={styles.input}
          />
          {fieldError("limitations")}
          <AiPrivacyDetails details="Generate workout plan sends your preferences and typed limitations through Supabase to OpenAI. Avoid identifying details; OpenAI retention policies apply. Workout history is shared only if you enable it below. Cancelling cannot recall a sent request. Manual logging remains available." />
          <View style={styles.consentRow}>
            <Text style={[styles.label, styles.consentLabel]}>
              Include my workout history (optional)
            </Text>
            <Switch
              accessibilityLabel="Include my workout history"
              value={includeHistory}
              disabled={busy}
              onValueChange={setIncludeHistory}
            />
          </View>
          <Text style={styles.copy}>
            AI can make mistakes. Review the draft before logging your workout.
          </Text>
        </>
      )}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.choices}>
        {step > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep(step - 1)}
            disabled={busy}
            style={styles.chip}
          >
            <Text style={styles.text}>Back</Text>
          </Pressable>
        ) : onCancel ? (
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            disabled={busy}
            style={styles.chip}
          >
            <Text style={styles.text}>Cancel</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={styles.primary}
          onPress={async () => {
            const parsed = workoutPreferencesSchema.safeParse(value);
            const problems = parsed.success
              ? []
              : workoutPreferenceErrors(parsed.error.issues);
            const visibleProblems = problems.filter(
              (problem) => step === 2 || problem.step <= step,
            );
            if (visibleProblems.length) {
              setErrors(
                Object.fromEntries(
                  visibleProblems.map((problem) => [
                    problem.field,
                    problem.message,
                  ]),
                ),
              );
              setStep(
                Math.min(...visibleProblems.map((problem) => problem.step)),
              );
              onStepChange?.();
              return;
            }
            setErrors({});
            setError("");
            if (step < 2) {
              setStep(step + 1);
              return;
            }
            if (!parsed.success) return;
            try {
              await onGenerate(parsed.data, includeHistory);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not prepare your plan.",
              );
            }
          }}
        >
          <Text style={styles.selectedText}>
            {busy
              ? "Preparing..."
              : step === 2
                ? "Generate workout plan"
                : "Continue"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: 12, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  label: { fontSize: 16, fontWeight: "600", color: colors.text },
  caption: { fontSize: 12, color: colors.secondary },
  copy: { fontSize: 14, lineHeight: 21, color: colors.secondary },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  consentLabel: { flex: 1, minWidth: 0 },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 12,
    padding: 12,
    justifyContent: "center",
  },
  text: { fontSize: 14, color: colors.text },
  selected: { backgroundColor: colors.blue, borderColor: colors.blue },
  selectedText: { fontSize: 14, fontWeight: "600", color: colors.onAccent },
  primary: {
    backgroundColor: colors.blue,
    minHeight: 48,
    borderRadius: 12,
    padding: 14,
    justifyContent: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 12,
    minHeight: 85,
    padding: 12,
    color: colors.text,
    fontSize: 16,
  },
  error: { color: colors.danger },
});

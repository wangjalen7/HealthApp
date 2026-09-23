import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../auth/auth-provider";
import { useAccountSetup } from "../onboarding/provider";
import { cachedVitals } from "../vitals/storage";
import { latestSample, type VitalSample } from "../../domain/vitals";
import {
  getDailyGoals,
  saveDailyGoals,
  type DailyGoals,
} from "../goals/repository";
import { GoalHelper, type GoalHelperMode } from "../goals/goal-helper";
import {
  calorieDefaults,
  fluidDefaults,
  restoreCalorie,
  restoreFluid,
  displayNumber,
} from "../goals/helper-model";
import {
  poundsToKilograms,
  kilogramsToPounds,
  millilitersToFluidOunces,
  fluidOuncesToMilliliters,
} from "../goals/calculator";
import { Choices } from "../goals/helper-components";
import { SettingsSheet } from "../../ui/settings-sheet";
import {
  DetailScreen,
  FormField,
  SettingsButton,
  ErrorMessage,
  styles,
} from "./settings-ui";
import {
  goalKinds,
  goalLabels,
  goalDisplay,
  automaticProtein,
  type GoalKind,
} from "./goal-display";
import { dayKey, shiftDay } from "../summary/calendar";

export function GoalEditor() {
  const { kind: raw } = useLocalSearchParams<{ kind: string }>();
  const kind = goalKinds.includes(raw as GoalKind)
    ? (raw as GoalKind)
    : undefined;
  const { session } = useAuth();
  const { setup } = useAccountSetup();
  const [units] = useState(setup?.unit_system ?? "us"),
    [fluid] = useState(setup?.fluid_unit ?? "fl_oz");
  const [goals, setGoals] = useState<DailyGoals>(),
    [weight, setWeight] = useState<VitalSample>(),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [manual, setManual] = useState(false),
    [helper, setHelper] = useState<GoalHelperMode>(),
    [revision, setRevision] = useState(0);
  const userId = session?.user.id;
  useEffect(() => {
    let live = true;
    if (!userId) return;
    void Promise.all([getDailyGoals(userId), cachedVitals(userId)])
      .then(([saved, samples]) => {
        if (live) {
          setGoals(saved);
          setWeight(latestSample(samples, "weight"));
          setError("");
        }
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error ? e.message : "Could not load this goal.",
          );
      });
    return () => {
      live = false;
    };
  }, [userId, revision]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 5000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const weightLb = weight
    ? weight.unit === "kg"
      ? kilogramsToPounds(weight.value)
      : weight.value
    : undefined;
  const calorie = goals
    ? restoreCalorie(
        goals.calorieCalculation,
        calorieDefaults(units, "lose", weightLb, goals.weightGoalLb),
        goals.calorieGoal,
      ).result
    : undefined;
  const result =
    kind === "calories"
      ? calorie
      : kind === "fluids" && goals
        ? restoreFluid(
            goals.fluidCalculation,
            fluidDefaults(fluid, goals.waterGoalMl),
            goals.waterGoalMl,
          ).result
        : undefined;
  async function apply(patch: Partial<DailyGoals>, label: string) {
    if (!userId || !goals) throw Error("Please reopen the goal.");
    const saved = await saveDailyGoals(userId, { ...goals, ...patch }, goals);
    setGoals(saved);
    setFeedback(label);
  }
  if (!kind)
    return (
      <DetailScreen title="Goal">
        <Text style={styles.copy}>This goal is unavailable.</Text>
      </DetailScreen>
    );
  return (
    <DetailScreen
      title={kind === "weight" ? "Target Weight" : `${goalLabels[kind]} Goal`}
    >
      <ErrorMessage message={error} />
      {!goals ? (
        error ? (
          <SettingsButton
            label="Retry"
            onPress={() => setRevision((n) => n + 1)}
          />
        ) : (
          <ActivityIndicator />
        )
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>
              {kind === "weight"
                ? "Target weight"
                : kind === "blood-pressure"
                  ? "Saved blood pressure goal"
                  : "Current daily goal"}
            </Text>
            <Text style={styles.bigValue}>
              {goalDisplay(kind, goals, units, fluid, weight)}
            </Text>
            {kind === "protein" && goals.proteinGoal === undefined ? (
              <Text style={styles.copy}>
                {automaticProtein(weight) === undefined
                  ? "Record a weight to resolve your automatic goal."
                  : "Updates automatically from your latest recorded weight."}
              </Text>
            ) : null}
          </View>
          {result ? (
            <View style={styles.card}>
              <Text style={styles.label}>Last calculated estimate</Text>
              <Text style={styles.copy}>
                {result.kind === "calories"
                  ? `${result.target.toLocaleString()} kcal/day`
                  : fluid === "ml"
                    ? `${displayNumber(result.target)} mL/day`
                    : `${displayNumber(millilitersToFluidOunces(result.target), 1)} fl oz/day`}
                {result.calculatedAt
                  ? ` · ${new Date(result.calculatedAt).toLocaleDateString()}`
                  : ""}
              </Text>
              <Text style={styles.copy}>
                The saved estimate is separate from your applied goal. Open it
                to review inputs or recalculate.
              </Text>
              {result.kind === "calories" &&
              result.inputs.weightKg !== undefined ? (
                <Text style={styles.copy}>
                  Weight used in this calculation:{" "}
                  {displayNumber(
                    units === "us"
                      ? kilogramsToPounds(result.inputs.weightKg)
                      : result.inputs.weightKg,
                  )}{" "}
                  {units === "us" ? "lb" : "kg"}.
                </Text>
              ) : null}
            </View>
          ) : null}
          {kind === "weight" ? (
            <View style={styles.card}>
              <Text style={styles.label}>Latest recorded weight</Text>
              <Text style={styles.copy}>
                {weightLb === undefined
                  ? "No reading recorded"
                  : `${displayNumber(units === "us" ? weightLb : poundsToKilograms(weightLb))} ${units === "us" ? "lb" : "kg"} · ${new Date(weight!.occurredAt).toLocaleDateString()}`}
              </Text>
              <Text style={styles.copy}>
                Changing your target does not add a weight reading.
              </Text>
              {calorie?.inputs.targetDate &&
              calorie.inputs.intent === "lose" ? (
                <Text style={styles.copy}>
                  Saved calorie estimate target date:{" "}
                  {calorie.inputs.targetDate}. Review that plan in Calories;
                  this date belongs to the saved calculation.
                </Text>
              ) : null}
            </View>
          ) : null}
          {kind === "calories" || kind === "fluids" ? (
            <>
              <SettingsButton
                label={
                  result
                    ? "Edit & Recalculate"
                    : kind === "calories"
                      ? "Find My Calorie Goal"
                      : "Find My Fluid Goal"
                }
                onPress={() => {
                  setFeedback("");
                  setHelper(kind);
                }}
              />
              <SettingsButton
                label="Edit Manually"
                secondary
                onPress={() => setManual(true)}
              />
            </>
          ) : (
            <SettingsButton
              label={
                kind === "protein"
                  ? "Edit protein goal"
                  : kind === "weight"
                    ? "Edit target weight"
                    : "Edit blood pressure goal"
              }
              onPress={() => setManual(true)}
            />
          )}
          {feedback ? (
            <Text accessibilityLiveRegion="polite" style={styles.copy}>
              {feedback}{" "}
              {kind === "calories" || kind === "protein" || kind === "fluids"
                ? `Streak targets start ${shiftDay(dayKey(), 1)}.`
                : ""}
            </Text>
          ) : null}
          {manual && userId ? (
            <ManualGoalSheet
              kind={kind}
              userId={userId}
              goals={goals}
              units={units}
              fluid={fluid}
              weight={weight}
              onClose={() => setManual(false)}
              onSaved={(saved) => {
                setGoals(saved);
                setManual(false);
                setFeedback("Goal saved.");
              }}
            />
          ) : null}
          <GoalHelper
            visible={Boolean(helper)}
            initialMode={helper ?? "calories"}
            onClose={() => setHelper(undefined)}
            defaultUnitSystem={units}
            defaultFluidUnit={fluid}
            defaultWeightLb={weightLb}
            defaultWeightOccurredAt={weight?.occurredAt}
            savedWeightGoalLb={goals.weightGoalLb}
            savedWaterGoalMl={goals.waterGoalMl}
            onGoalsChange={setGoals}
            onUseCalories={(calorieGoal, weightGoalLb, calorieCalculation) =>
              apply(
                {
                  calorieGoal,
                  calorieCalculation,
                  ...(weightGoalLb === undefined ? {} : { weightGoalLb }),
                },
                "Calorie target saved.",
              )
            }
            onUseFluid={(waterGoalMl, fluidCalculation) =>
              apply({ waterGoalMl, fluidCalculation }, "Fluid goal saved.")
            }
          />
        </>
      )}
    </DetailScreen>
  );
}

function ManualGoalSheet({
  kind,
  userId,
  goals,
  units,
  fluid,
  weight,
  onClose,
  onSaved,
}: {
  kind: GoalKind;
  userId: string;
  goals: DailyGoals;
  units: "us" | "metric";
  fluid: "ml" | "fl_oz";
  weight?: VitalSample;
  onClose: () => void;
  onSaved: (goals: DailyGoals) => void;
}) {
  const [baseline] = useState(goals);
  const [initial] = useState(() => ({
    value:
      kind === "calories"
        ? goals.calorieGoal === undefined
          ? ""
          : String(goals.calorieGoal)
        : kind === "protein"
          ? goals.proteinGoal === undefined
            ? ""
            : String(goals.proteinGoal)
          : kind === "fluids"
            ? goals.waterGoalMl === undefined
              ? ""
              : displayNumber(
                  fluid === "ml"
                    ? goals.waterGoalMl
                    : millilitersToFluidOunces(goals.waterGoalMl),
                  2,
                )
            : kind === "weight"
              ? goals.weightGoalLb === undefined
                ? ""
                : displayNumber(
                    units === "us"
                      ? goals.weightGoalLb
                      : poundsToKilograms(goals.weightGoalLb),
                    2,
                  )
              : goals.systolicGoal === undefined
                ? ""
                : String(goals.systolicGoal),
    second:
      goals.diastolicGoal === undefined ? "" : String(goals.diastolicGoal),
    automatic: goals.proteinGoal === undefined,
  }));
  const [value, setValue] = useState(initial.value),
    [second, setSecond] = useState(initial.second),
    [automatic, setAutomatic] = useState(initial.automatic),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const dirty =
    value !== initial.value ||
    second !== initial.second ||
    automatic !== initial.automatic;
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const number = (raw: string) => {
        if (!raw.trim()) return undefined;
        const n = Number(raw.replace(",", "."));
        if (!Number.isFinite(n)) throw Error("Enter a valid number.");
        return n;
      };
      const n = number(value);
      let patch: Partial<DailyGoals> = {};
      if (kind === "calories")
        patch = {
          calorieGoal: n,
          ...(n !== baseline.calorieGoal
            ? { calorieCalculation: undefined }
            : {}),
        };
      if (kind === "protein") {
        if (!automatic && n === undefined)
          throw Error("Enter a custom protein goal or choose Automatic.");
        patch = { proteinGoal: automatic ? undefined : n };
      }
      if (kind === "fluids") {
        const waterGoalMl =
          value === initial.value
            ? baseline.waterGoalMl
            : n === undefined
              ? undefined
              : fluid === "ml"
                ? n
                : fluidOuncesToMilliliters(n);
        patch = {
          waterGoalMl,
          ...(waterGoalMl !== baseline.waterGoalMl
            ? { fluidCalculation: undefined }
            : {}),
        };
      }
      if (kind === "weight")
        patch = {
          weightGoalLb:
            value === initial.value
              ? baseline.weightGoalLb
              : n === undefined
                ? undefined
                : units === "us"
                  ? n
                  : kilogramsToPounds(n),
        };
      if (kind === "blood-pressure")
        patch = { systolicGoal: n, diastolicGoal: number(second) };
      const saved = await saveDailyGoals(
        userId,
        { ...baseline, ...patch },
        baseline,
      );
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this goal.");
    } finally {
      setBusy(false);
    }
  }
  const label =
    kind === "calories"
      ? "Calories / day"
      : kind === "protein"
        ? "Protein / day (g)"
        : kind === "fluids"
          ? `Fluids / day (${fluid === "ml" ? "mL" : "fl oz"})`
          : kind === "weight"
            ? `Target weight (${units === "us" ? "lb" : "kg"})`
            : "Systolic (mmHg)";
  return (
    <SettingsSheet
      title={`Edit ${kind === "weight" ? "Target Weight" : goalLabels[kind]}`}
      onClose={close}
    >
      {discard ? (
        <>
          <Text style={styles.copy}>Discard your unsaved goal changes?</Text>
          <SettingsButton
            label="Keep editing"
            onPress={() => setDiscard(false)}
          />
          <SettingsButton
            label="Discard changes"
            destructive
            onPress={onClose}
          />
        </>
      ) : (
        <>
          {kind === "protein" ? (
            <>
              <Choices
                value={automatic ? "automatic" : "custom"}
                disabled={busy}
                items={[
                  { value: "automatic", label: "Automatic" },
                  { value: "custom", label: "Custom" },
                ]}
                onChange={(v) => setAutomatic(v === "automatic")}
              />
              <Text style={styles.copy}>
                Automatic uses 0.7 g per pound of your latest recorded weight,
                rounded to whole grams.
                {automaticProtein(weight) !== undefined
                  ? ` Currently ${automaticProtein(weight)} g/day.`
                  : " Record a weight to resolve the amount."}{" "}
                Custom stays fixed until you change it.
              </Text>
            </>
          ) : null}
          {kind !== "protein" || !automatic ? (
            <FormField
              label={label}
              value={value}
              onChange={setValue}
              number
              disabled={busy}
            />
          ) : null}
          {kind === "blood-pressure" ? (
            <>
              <FormField
                label="Diastolic (mmHg)"
                value={second}
                onChange={setSecond}
                number
                disabled={busy}
              />
              <Text style={styles.copy}>
                These values are your tracking goals; changing them does not
                record a blood pressure reading.
              </Text>
            </>
          ) : null}
          {kind !== "protein" ? (
            <Text style={styles.copy}>
              Leave a value blank to remove that goal.
            </Text>
          ) : null}
          {kind === "calories" || kind === "protein" || kind === "fluids" ? (
            <Text style={styles.copy}>
              Changes saved today affect streak targets from{" "}
              {shiftDay(dayKey(), 1)}.
            </Text>
          ) : null}
          <ErrorMessage message={error} />
          <SettingsButton
            label={busy ? "Saving..." : "Save goal"}
            disabled={busy || !dirty}
            onPress={() => void save()}
          />
          <SettingsButton
            label="Cancel"
            secondary
            disabled={busy}
            onPress={close}
          />
        </>
      )}
    </SettingsSheet>
  );
}

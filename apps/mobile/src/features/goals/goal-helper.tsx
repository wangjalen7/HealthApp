import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { TextInput } from "../../ui/text-input";
import { colors, radii, spacing, surfaces } from "../../ui/profile-theme";
import {
  bodyMassIndex,
  calculateMaintenance,
  calculateBmr,
  canUseCalorieTarget,
  calorieTargetForGoal,
  centimetersToFeetAndInches,
  feetAndInchesToCentimeters,
  kilogramsToPounds,
  normalizeWeightGoal,
  lossScenarios,
  poundsToKilograms,
  roundCaloriesForDisplay,
  type EnergyActivity,
  type EnergyEquationSex,
  type LossScenario,
} from "./calculator";

import { FluidGoalForm } from "./fluid-goal-form";

export type GoalHelperMode = "calories" | "fluids";

const activities: { value: EnergyActivity; title: string; copy: string }[] = [
  {
    value: "sedentary",
    title: "Sedentary",
    copy: "Little or no exercise. Activity factor 1.2.",
  },
  {
    value: "light",
    title: "Light",
    copy: "Exercise 1-3 times/week. Activity factor 1.375.",
  },
  {
    value: "moderate",
    title: "Moderate",
    copy: "Exercise 4-5 times/week. Activity factor 1.465.",
  },
  {
    value: "active",
    title: "Active",
    copy: "Daily exercise or intense exercise 3-4 times/week. Activity factor 1.55.",
  },
  {
    value: "very_active",
    title: "Very active",
    copy: "Intense exercise 6-7 times/week. Activity factor 1.725.",
  },
  {
    value: "extra_active",
    title: "Extra active",
    copy: "Very intense exercise daily, or a physical job. Activity factor 1.9.",
  },
];

const number = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatRate = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");

const formatLossRate = (value: number, unitSystem: "us" | "metric") =>
  unitSystem === "metric"
    ? `${formatRate(value * 0.45359237)} kg/week`
    : `${formatRate(value)} lb/week`;

export function GoalHelper({
  defaultWeightLb,
  defaultWeightOccurredAt,
  initialMode,
  onClose,
  onUseCalories,
  onUseFluid,
  savedWaterGoalMl,
  savedWeightGoalLb,
  visible,
}: {
  defaultWeightLb?: number;
  defaultWeightOccurredAt?: string;
  initialMode: GoalHelperMode;
  onClose: () => void;
  onUseCalories: (
    calories: number,
    weightGoalLb?: number,
    calculation?: Record<string, unknown>,
  ) => Promise<void>;
  onUseFluid: (
    milliliters: number,
    calculation?: Record<string, unknown>,
  ) => Promise<void>;
  savedWaterGoalMl?: number;
  savedWeightGoalLb?: number;
  visible: boolean;
}) {
  const [unitSystem, setUnitSystem] = useState<"us" | "metric">("us");
  const [mode, setMode] = useState<GoalHelperMode>(initialMode);
  const [age, setAge] = useState("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [heightMetric, setHeightMetric] = useState("");
  const [heightCm, setHeightCm] = useState<number>();
  const [currentWeight, setCurrentWeight] = useState("");
  const [currentWeightKg, setCurrentWeightKg] = useState<number>();
  const [goalWeight, setGoalWeight] = useState("");
  const [goalWeightKg, setGoalWeightKg] = useState<number>();
  const [timeframeWeeks, setTimeframeWeeks] = useState("");
  const [sex, setSex] = useState<EnergyEquationSex>();
  const [activity, setActivity] = useState<EnergyActivity>("sedentary");
  const [weightIntent, setWeightIntent] = useState<
    "maintain" | "lose" | "gain"
  >("lose");
  const [maintenance, setMaintenance] = useState<number>();
  const [lossOptions, setLossOptions] = useState<LossScenario[]>([]);
  const [timeframeMessage, setTimeframeMessage] = useState("");
  const [selectedCalories, setSelectedCalories] = useState<number>();
  const [selectedLossId, setSelectedLossId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setUnitSystem("us");
    setMode(initialMode);
    setFeedback("");
    setSaving(false);
    setShowMethod(false);
    setMaintenance(undefined);
    setLossOptions([]);
    setTimeframeMessage("");
    setSelectedCalories(undefined);
    setSelectedLossId("");
    setHeightFeet("");
    setHeightInches("");
    setHeightMetric("");
    setHeightCm(undefined);
    setCurrentWeight(defaultWeightLb ? defaultWeightLb.toFixed(1) : "");
    setCurrentWeightKg(
      defaultWeightLb === undefined
        ? undefined
        : poundsToKilograms(defaultWeightLb),
    );
    setGoalWeight(savedWeightGoalLb ? String(savedWeightGoalLb) : "");
    setGoalWeightKg(
      savedWeightGoalLb === undefined
        ? undefined
        : poundsToKilograms(savedWeightGoalLb),
    );
  }, [
    defaultWeightLb,
    initialMode,
    savedWaterGoalMl,
    savedWeightGoalLb,
    visible,
  ]);

  const selectedLossOption = lossOptions.find(
    (option) => option.id === selectedLossId,
  );
  const activityEstimates = useMemo(() => {
    const ageYears = number(age);
    if (
      maintenance === undefined ||
      ageYears === undefined ||
      heightCm === undefined ||
      currentWeightKg === undefined ||
      !sex
    )
      return [];
    return activities.map((item) => ({
      ...item,
      calories: roundCaloriesForDisplay(
        calculateMaintenance({
          ageYears,
          heightCm,
          weightKg: currentWeightKg,
          sex,
          activity: item.value,
        }),
      ),
    }));
  }, [age, currentWeightKg, heightCm, maintenance, sex]);

  function inputsChanged() {
    setMaintenance(undefined);
    setLossOptions([]);
    setSelectedCalories(undefined);
    setSelectedLossId("");
    setTimeframeMessage("");
    setFeedback("");
  }

  function changeCurrentWeight(value: string) {
    setCurrentWeight(value);
    const parsed = number(value);
    setCurrentWeightKg(
      parsed === undefined
        ? undefined
        : unitSystem === "us"
          ? poundsToKilograms(parsed)
          : parsed,
    );
    inputsChanged();
  }

  function changeGoalWeight(value: string) {
    setGoalWeight(value);
    const parsed = number(value);
    setGoalWeightKg(
      parsed === undefined
        ? undefined
        : unitSystem === "us"
          ? poundsToKilograms(parsed)
          : parsed,
    );
    inputsChanged();
  }

  function updateUsHeight(nextFeet: string, nextInches: string) {
    setHeightFeet(nextFeet);
    setHeightInches(nextInches);
    const feet = number(nextFeet);
    const inches = number(nextInches);
    setHeightCm(
      feet === undefined || inches === undefined
        ? undefined
        : feetAndInchesToCentimeters(feet, inches),
    );
    inputsChanged();
  }

  function changeMetricHeight(value: string) {
    setHeightMetric(value);
    setHeightCm(number(value));
    inputsChanged();
  }

  function selectUnitSystem(next: "us" | "metric") {
    if (next === unitSystem) return;
    setUnitSystem(next);
    if (currentWeightKg !== undefined)
      setCurrentWeight(
        next === "metric"
          ? currentWeightKg.toFixed(2)
          : kilogramsToPounds(currentWeightKg).toFixed(1),
      );
    if (goalWeightKg !== undefined)
      setGoalWeight(
        next === "metric"
          ? goalWeightKg.toFixed(2)
          : kilogramsToPounds(goalWeightKg).toFixed(1),
      );
    if (heightCm !== undefined) {
      if (next === "metric") {
        setHeightMetric(heightCm.toFixed(1));
      } else {
        const customary = centimetersToFeetAndInches(heightCm);
        setHeightFeet(String(customary.feet));
        setHeightInches(customary.inches.toFixed(1));
      }
    }
    inputsChanged();
  }

  function calculateCalories(forActivity: EnergyActivity = activity) {
    inputsChanged();
    try {
      const ageYears = number(age);
      const inches = number(heightInches);
      if (
        ageYears === undefined ||
        heightCm === undefined ||
        currentWeightKg === undefined ||
        !sex
      ) {
        return setFeedback(
          "Enter age, height, current weight, and an equation category.",
        );
      }
      if (
        unitSystem === "us" &&
        (inches === undefined || inches < 0 || inches >= 12)
      )
        return setFeedback("Enter height as feet plus 0–11.9 inches.");
      const result = calculateMaintenance({
        ageYears,
        heightCm,
        weightKg: currentWeightKg,
        sex,
        activity: forActivity,
      });
      setMaintenance(result);
      setFeedback("");
      if (weightIntent === "lose") {
        if (goalWeightKg === undefined)
          return setFeedback("Enter your weight-loss goal.");
        if (
          bodyMassIndex(currentWeightKg, heightCm) < 18.5 ||
          bodyMassIndex(goalWeightKg, heightCm) < 18.5
        ) {
          return setFeedback(
            "A weight-loss calorie target is not offered when current or goal BMI is below 18.5. Keep a manual or clinician-directed goal instead.",
          );
        }
        const timeframe = timeframeWeeks.trim()
          ? number(timeframeWeeks)
          : undefined;
        if (timeframeWeeks.trim() && timeframe === undefined)
          throw new Error("Enter a valid timeframe.");
        const options = lossScenarios({
          maintenanceCalories: result,
          currentWeightLb: kilogramsToPounds(currentWeightKg),
          goalWeightLb: kilogramsToPounds(goalWeightKg),
          timeframeWeeks: timeframe,
        });
        setLossOptions(options.scenarios);
        setTimeframeMessage(options.timeframeMessage ?? "");
        const defaultOption =
          options.scenarios.find(
            (item) => item.fromTimeframe && item.available,
          ) ??
          options.scenarios.find(
            (item) => item.rateLbPerWeek === 1 && item.available,
          ) ??
          options.scenarios.find((item) => item.available);
        setSelectedLossId(defaultOption?.id ?? "");
        setSelectedCalories(defaultOption?.displayCalories);
        if (!defaultOption)
          setFeedback(
            "No loss target is available above the calculator minimum. Choose maintenance or a supported custom goal.",
          );
        return;
      }
      const goal = weightIntent === "maintain" ? "maintain" : "gain_5";
      setSelectedCalories(
        roundCaloriesForDisplay(calorieTargetForGoal(result, goal)),
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Check the calculator inputs.",
      );
    }
  }

  async function useCalories() {
    if (
      selectedCalories === undefined ||
      !canUseCalorieTarget(selectedCalories)
    )
      return;
    setSaving(true);
    setFeedback("");
    try {
      await onUseCalories(
        selectedCalories,
        weightIntent === "lose" && goalWeightKg !== undefined
          ? normalizeWeightGoal(kilogramsToPounds(goalWeightKg))
          : undefined,
        {
          method: "mifflin_st_jeor_v1",
          ageYears: number(age),
          heightCm,
          weightKg: currentWeightKg,
          sex,
          activity,
          maintenance,
          intent: weightIntent,
          lossRateLbPerWeek: selectedLossOption?.rateLbPerWeek,
          acceptedAt: new Date().toISOString(),
        },
      );
      onClose();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save this target.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerAction}>
            <Text style={styles.headerActionText}>Close</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Goal helper
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View accessibilityRole="tablist" style={styles.tabs}>
            {(["calories", "fluids"] as const).map((item) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === item }}
                key={item}
                onPress={() => {
                  setMode(item);
                  setFeedback("");
                }}
                style={[styles.tab, mode === item && styles.tabSelected]}
              >
                <Text
                  style={[
                    styles.tabText,
                    mode === item && styles.tabTextSelected,
                  ]}
                >
                  {item === "calories" ? "Calories" : "Fluids"}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "calories" ? (
            <>
              <Text accessibilityRole="header" style={styles.title}>
                Find a starting calorie target
              </Text>
              <Text style={styles.intro}>
                Estimate maintenance first, then compare gradual weight-change
                options. Results are starting estimates, not guaranteed rates.
              </Text>
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  Adults 19+ only. Not for pregnancy, breastfeeding, eating
                  disorder care, or clinician-directed nutrition needs.
                </Text>
              </View>
              <Text style={styles.sectionTitle}>Profile and units</Text>
              <ChoiceRow
                choices={[
                  { value: "us", label: "US customary" },
                  { value: "metric", label: "Metric" },
                ]}
                selected={unitSystem}
                onSelect={(value) => selectUnitSystem(value as "us" | "metric")}
              />
              <View style={styles.fieldRow}>
                <Field
                  label="Age"
                  value={age}
                  onChange={(value) => {
                    setAge(value);
                    inputsChanged();
                  }}
                />
                <Field
                  label={`Current weight (${unitSystem === "us" ? "lb" : "kg"})`}
                  value={currentWeight}
                  onChange={changeCurrentWeight}
                />
              </View>
              {defaultWeightLb && defaultWeightOccurredAt ? (
                <Text style={styles.fieldHelp}>
                  Weight prefilled from your latest reading on{" "}
                  {new Date(defaultWeightOccurredAt).toLocaleDateString()}.
                  Confirm or edit it before calculating.
                </Text>
              ) : null}
              {unitSystem === "us" ? (
                <View style={styles.fieldRow}>
                  <Field
                    label="Height (ft)"
                    value={heightFeet}
                    onChange={(value) => updateUsHeight(value, heightInches)}
                  />
                  <Field
                    label="Height (in)"
                    value={heightInches}
                    onChange={(value) => updateUsHeight(heightFeet, value)}
                  />
                </View>
              ) : (
                <Field
                  label="Height (cm)"
                  value={heightMetric}
                  onChange={changeMetricHeight}
                />
              )}
              <Text style={styles.fieldLabel}>Published equation category</Text>
              <Text style={styles.fieldHelp}>
                These male/female inputs come from the published equation and
                are separate from gender identity. Skip the helper if neither is
                appropriate and keep a manual goal.
              </Text>
              <ChoiceRow
                choices={[
                  { value: "female", label: "Female equation" },
                  { value: "male", label: "Male equation" },
                ]}
                selected={sex}
                onSelect={(value) => {
                  setSex(value as EnergyEquationSex);
                  inputsChanged();
                }}
              />
              <Text style={styles.sectionTitle}>Usual activity</Text>
              <Text style={styles.activityGuidance}>
                Exercise means 15-30 minutes of elevated heart rate; intense
                exercise means 45-120 minutes; very intense means 2+ hours.
                Choose your usual pattern. Workout calories are already
                included.
              </Text>
              {activities.map((item) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: activity === item.value }}
                  key={item.value}
                  onPress={() => {
                    setActivity(item.value);
                    inputsChanged();
                  }}
                  style={[
                    styles.optionCard,
                    activity === item.value && styles.optionCardSelected,
                  ]}
                >
                  <Text style={styles.optionTitle}>{item.title}</Text>
                  <Text style={styles.optionCopy}>{item.copy}</Text>
                </Pressable>
              ))}
              <Text style={styles.sectionTitle}>Goal</Text>
              <ChoiceRow
                choices={[
                  { value: "maintain", label: "Maintain" },
                  { value: "lose", label: "Lose" },
                  { value: "gain", label: "Gain" },
                ]}
                selected={weightIntent}
                onSelect={(value) => {
                  setWeightIntent(value as typeof weightIntent);
                  inputsChanged();
                }}
              />
              {weightIntent === "lose" ? (
                <>
                  <View style={styles.fieldRow}>
                    <Field
                      label={`Goal weight (${unitSystem === "us" ? "lb" : "kg"})`}
                      value={goalWeight}
                      onChange={changeGoalWeight}
                    />
                    <Field
                      label="Time frame (weeks)"
                      optional
                      value={timeframeWeeks}
                      onChange={(value) => {
                        setTimeframeWeeks(value);
                        inputsChanged();
                      }}
                    />
                  </View>
                  <Text style={styles.fieldHelp}>
                    The timeframe adds a comparison when it averages no more
                    than 2 lb/week. You can still choose 0.5, 1, 1.5, or 2.
                  </Text>
                </>
              ) : null}
              <PrimaryButton
                label="Calculate options"
                onPress={() => calculateCalories()}
              />

              {maintenance !== undefined ? (
                <View style={styles.results}>
                  <Text accessibilityRole="header" style={styles.resultsTitle}>
                    Estimated maintenance
                  </Text>
                  <Text style={styles.maintenanceValue}>
                    About{" "}
                    {roundCaloriesForDisplay(maintenance).toLocaleString()}{" "}
                    kcal/day
                  </Text>
                  {sex &&
                  heightCm &&
                  currentWeightKg &&
                  number(age) !== undefined ? (
                    <Text style={styles.resultMeta}>
                      Resting estimate (BMR):{" "}
                      {Math.round(
                        calculateBmr({
                          ageYears: number(age)!,
                          heightCm,
                          weightKg: currentWeightKg,
                          sex,
                          activity,
                        }),
                      ).toLocaleString()}{" "}
                      kcal/day
                    </Text>
                  ) : null}
                  <Text style={styles.estimateCaution}>
                    Formula estimate only. If your weight has been stable for
                    several weeks at a reliably logged lower intake, keep that
                    observed intake as your starting point.
                  </Text>
                  <View style={styles.activityComparison}>
                    <Text style={styles.activityComparisonTitle}>
                      Compare activity assumptions
                    </Text>
                    <Text style={styles.activityComparisonCopy}>
                      Same profile, different activity factor. Tap one to
                      recalculate.
                    </Text>
                    {activityEstimates.map((item) => {
                      const selected = item.value === activity;
                      return (
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          key={item.value}
                          onPress={() => {
                            setActivity(item.value);
                            calculateCalories(item.value);
                          }}
                          style={styles.activityComparisonRow}
                        >
                          <View style={styles.activityComparisonLabel}>
                            <Text style={styles.activityComparisonName}>
                              {item.title.split(" — ")[0]}
                            </Text>
                            {selected ? (
                              <Text style={styles.selectedLabel}>Selected</Text>
                            ) : null}
                          </View>
                          <Text style={styles.activityComparisonValue}>
                            {item.calories.toLocaleString()} kcal/day
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {weightIntent === "lose" ? (
                    <>
                      <Text style={styles.resultInstruction}>
                        Select a planning rate
                      </Text>
                      {lossOptions.map((option) => {
                        const selected = selectedLossId === option.id;
                        return (
                          <Pressable
                            accessibilityRole="radio"
                            accessibilityState={{
                              checked: selected,
                              disabled: !option.available,
                            }}
                            disabled={!option.available}
                            key={option.id}
                            onPress={() => {
                              setSelectedLossId(option.id);
                              setSelectedCalories(option.displayCalories);
                            }}
                            style={[
                              styles.resultOption,
                              selected && styles.resultOptionSelected,
                            ]}
                          >
                            <View style={styles.resultOptionCopy}>
                              {!option.available ? (
                                <Text style={styles.warning}>
                                  Unavailable: below 1,000 kcal/day or outside
                                  the calculator range.
                                </Text>
                              ) : null}
                              <Text style={styles.resultRate}>
                                {option.fromTimeframe
                                  ? `Your timeframe · ${formatLossRate(option.rateLbPerWeek, unitSystem)}`
                                  : formatLossRate(
                                      option.rateLbPerWeek,
                                      unitSystem,
                                    )}
                              </Text>
                              <Text style={styles.resultMeta}>
                                Roughly {Math.ceil(option.estimatedWeeks ?? 0)}{" "}
                                weeks to the entered goal
                              </Text>
                            </View>
                            <Text style={styles.resultCalories}>
                              {option.displayCalories.toLocaleString()}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {timeframeMessage ? (
                        <Text style={styles.warning}>{timeframeMessage}</Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Text style={styles.resultInstruction}>
                        {weightIntent === "maintain"
                          ? "Maintenance starting target"
                          : "Choose a modest surplus"}
                      </Text>
                      {weightIntent === "gain" ? (
                        <ChoiceRow
                          choices={[
                            { value: "gain_5", label: "+5%" },
                            { value: "gain_10", label: "+10%" },
                          ]}
                          selected={
                            selectedCalories ===
                            roundCaloriesForDisplay(
                              calorieTargetForGoal(maintenance, "gain_10"),
                            )
                              ? "gain_10"
                              : "gain_5"
                          }
                          onSelect={(value) =>
                            setSelectedCalories(
                              roundCaloriesForDisplay(
                                calorieTargetForGoal(
                                  maintenance,
                                  value as "gain_5" | "gain_10",
                                ),
                              ),
                            )
                          }
                        />
                      ) : null}
                    </>
                  )}
                  {selectedCalories !== undefined ? (
                    <View style={styles.targetCard}>
                      <Text style={styles.targetEyebrow}>STARTING TARGET</Text>
                      <Text style={styles.targetValue}>
                        About {selectedCalories.toLocaleString()} kcal/day
                      </Text>
                      <Text style={styles.targetCopy}>
                        {weightIntent === "lose" && selectedLossOption
                          ? `About ${Math.round(maintenance - selectedLossOption.targetCalories).toLocaleString()} kcal/day below estimated maintenance. `
                          : weightIntent === "gain"
                            ? `About ${Math.round(selectedCalories - maintenance).toLocaleString()} kcal/day above estimated maintenance. `
                            : "Same as estimated maintenance. "}
                        Review your weight trend and intake consistency over
                        time. Actual change varies as energy needs adapt.
                      </Text>
                      {weightIntent === "lose" &&
                      selectedLossOption &&
                      maintenance - selectedLossOption.targetCalories >
                        maintenance * 0.2 ? (
                        <Text style={styles.warning}>
                          This is more than 20% below estimated maintenance.
                          Consider a slower option or clinician guidance.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  <PrimaryButton
                    disabled={
                      saving ||
                      selectedCalories === undefined ||
                      !canUseCalorieTarget(selectedCalories)
                    }
                    label={saving ? "Saving…" : "Use this target"}
                    onPress={() => void useCalories()}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <>
              <FluidGoalForm
                key={String(visible)}
                savedGoalMl={savedWaterGoalMl}
                onUse={async (ml, calculation) => {
                  await onUseFluid(ml, calculation);
                  onClose();
                }}
              />
            </>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showMethod }}
            onPress={() => setShowMethod((current) => !current)}
            style={styles.methodButton}
          >
            <Text style={styles.methodButtonText}>How this is calculated</Text>
          </Pressable>
          {showMethod ? (
            <View style={styles.methodCard}>
              <Text style={styles.methodText}>
                Calories use Mifflin-St Jeor BMR multiplied by the selected
                Calculator.net activity factor. Workout calories are not added
                again. Loss choices use 250-1,000 kcal/day planning deficits.
                Targets below 1,000 kcal/day are unavailable; this boundary is
                not a recommended intake. Real weight change varies.
              </Text>
              <Text style={styles.methodText}>
                Fluid references come from National Academies Adequate Intake
                data: about 3.0 L/day of beverages for men and 2.2 L/day for
                women. Total-water values of 3.7 L and 2.7 L include food and
                are not used as beverage goals.
              </Text>
              <SourceLink
                label="Calculator.net calorie method"
                url="https://www.calculator.net/calorie-calculator.html"
              />
              <SourceLink
                label="National Academies water reference"
                url="https://www.nationalacademies.org/read/10925/chapter/6"
              />
              <SourceLink
                label="NIDDK dynamic weight-planning research"
                url="https://www.niddk.nih.gov/research-funding/at-niddk/labs-branches/laboratory-biological-modeling/integrative-physiology-section/research/body-weight-planner"
              />
            </View>
          ) : null}
          {feedback ? (
            <Text accessibilityLiveRegion="polite" style={styles.feedback}>
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
  onChange,
  optional = false,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  optional?: boolean;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? " (optional)" : ""}
      </Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType="decimal-pad"
        onChangeText={onChange}
        placeholder={optional ? "Optional" : "Required"}
        placeholderTextColor={colors.tertiary}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function ChoiceRow({
  choices,
  onSelect,
  selected,
}: {
  choices: { value: string; label: string }[];
  onSelect: (value: string) => void;
  selected?: string;
}) {
  return (
    <View style={styles.choiceRow}>
      {choices.map((choice) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: choice.value === selected }}
          key={choice.value}
          onPress={() => onSelect(choice.value)}
          style={[
            styles.choice,
            choice.value === selected && styles.choiceSelected,
          ]}
        >
          <Text
            style={[
              styles.choiceText,
              choice.value === selected && styles.choiceTextSelected,
            ]}
          >
            {choice.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function PrimaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabled]}
    >
      {disabled && label.startsWith("Saving") ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function SourceLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      style={styles.sourceLink}
    >
      <Text style={styles.sourceLinkText}>{label}</Text>
    </Pressable>
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
    paddingHorizontal: spacing.md,
  },
  headerAction: { justifyContent: "center", minHeight: 44, minWidth: 64 },
  headerActionText: { color: colors.blue, fontSize: 16, fontWeight: "600" },
  headerTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSpacer: { width: 64 },
  content: { padding: spacing.lg, paddingBottom: 48 },
  tabs: {
    backgroundColor: colors.fill,
    borderRadius: 12,
    flexDirection: "row",
    gap: 3,
    marginBottom: 22,
    padding: 3,
  },
  tab: {
    alignItems: "center",
    borderRadius: 9,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
  },
  tabSelected: { backgroundColor: colors.surface },
  tabText: { color: colors.secondary, fontWeight: "600" },
  tabTextSelected: { color: colors.text },
  title: { color: colors.text, fontSize: 26, fontWeight: "700" },
  intro: {
    color: colors.secondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  notice: {
    backgroundColor: colors.orangeSoft,
    borderRadius: radii.control,
    marginTop: 14,
    padding: 13,
  },
  noticeText: { color: colors.orange, fontSize: 13, lineHeight: 19 },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 22,
  },
  fieldRow: { flexDirection: "row", gap: 10 },
  field: { flex: 1, marginTop: 10 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  fieldHelp: {
    color: colors.tertiary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  input: { ...surfaces.input, marginTop: 6 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  choice: {
    alignItems: "center",
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  choiceSelected: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.blue,
  },
  choiceText: { color: colors.secondary, fontSize: 13, fontWeight: "600" },
  choiceTextSelected: { color: colors.blue },
  optionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: radii.control,
    borderWidth: 1,
    marginBottom: 8,
    padding: 13,
  },
  optionCardSelected: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.blue,
  },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  optionCopy: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  activityGuidance: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  primaryButton: {
    ...surfaces.button,
    marginTop: 18,
  },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  results: {
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 24,
    paddingTop: 20,
  },
  resultsTitle: { color: colors.secondary, fontSize: 13, fontWeight: "700" },
  maintenanceValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    marginTop: 4,
  },
  estimateCaution: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  activityComparison: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: radii.control,
    borderWidth: 1,
    marginTop: 16,
    padding: 13,
  },
  activityComparisonTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  activityComparisonCopy: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
    marginTop: 3,
  },
  activityComparisonRow: {
    alignItems: "center",
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: 8,
  },
  activityComparisonLabel: {
    alignItems: "flex-start",
    flex: 1,
  },
  activityComparisonName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  selectedLabel: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  activityComparisonValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 12,
  },
  resultInstruction: {
    color: colors.text,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 18,
  },
  resultOption: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
    minHeight: 66,
    padding: 12,
  },
  resultOptionSelected: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.blue,
  },
  resultOptionCopy: { flex: 1 },
  resultRate: { color: colors.text, fontSize: 14, fontWeight: "700" },
  resultMeta: { color: colors.tertiary, fontSize: 11, marginTop: 4 },
  resultCalories: { color: colors.blue, fontSize: 18, fontWeight: "800" },
  targetCard: { ...surfaces.card, marginTop: 12, padding: 16 },
  targetEyebrow: {
    color: colors.secondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  targetValue: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "700",
    marginTop: 5,
  },
  targetCopy: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  warning: {
    color: colors.orange,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  methodButton: {
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
    marginTop: 22,
  },
  methodButtonText: { color: colors.blue, fontSize: 14, fontWeight: "700" },
  methodCard: { ...surfaces.card, padding: 15 },
  methodText: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  sourceLink: { justifyContent: "center", minHeight: 40 },
  sourceLinkText: { color: colors.blue, fontSize: 13, fontWeight: "600" },
  feedback: {
    color: colors.danger,
    lineHeight: 20,
    marginTop: 14,
    textAlign: "center",
  },
});

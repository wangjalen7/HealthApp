import { ActivityIndicator, Text, View } from "react-native";
import { useHelperState } from "./use-helper-state";
import {
  appliedCalculation,
  calorieDefaults,
  calorieDraftSchema,
  calorieUnits,
  calculateCalorieResult,
  restoreCalorie,
  displayNumber,
  parseNumber,
  targetWeeks,
  type CalorieDraft,
} from "./helper-model";
import {
  feetAndInchesToCentimeters,
  kilogramsToPounds,
  poundsToKilograms,
  normalizeWeightGoal,
  ENERGY_ACTIVITY_FACTORS,
} from "./calculator";
import { localEntryDay } from "../../lib/entry-date";
import {
  Choices,
  Disclosure,
  Field,
  GenderField,
  Group,
  HelperButton,
  ResultCard,
  helperStyles as s,
} from "./helper-components";
import { TargetDateField } from "./target-date-field";
import type { DailyGoals } from "./repository";

const activities = [
  { value: "sedentary", label: "Sedentary", detail: "Little or no exercise" },
  { value: "light", label: "Light", detail: "Exercise 1-3 times a week" },
  { value: "moderate", label: "Moderate", detail: "Exercise 4-5 times a week" },
  {
    value: "active",
    label: "Active",
    detail: "Daily exercise or intense sessions 3-4 times a week",
  },
  {
    value: "very_active",
    label: "Very active",
    detail: "Intense exercise 6-7 times a week",
  },
  {
    value: "extra_active",
    label: "Extra active",
    detail: "Very intense daily exercise or a physical job",
  },
] as const;
const rateText = (rate: number, units: CalorieDraft["unitSystem"]) =>
  `${displayNumber(units === "us" ? rate : poundsToKilograms(rate))} ${units === "us" ? "lb" : "kg"}/week`;
export function CalorieGoalForm({
  userId,
  defaultUnitSystem = "us",
  defaultIntent = "lose",
  defaultWeightLb,
  defaultWeightOccurredAt,
  savedWeightGoalLb,
  onGoalsChange,
  onUse,
}: {
  userId: string;
  defaultUnitSystem?: CalorieDraft["unitSystem"];
  defaultIntent?: CalorieDraft["intent"];
  defaultWeightLb?: number;
  defaultWeightOccurredAt?: string;
  savedWeightGoalLb?: number;
  onGoalsChange?: (goals: DailyGoals) => void;
  onUse: (
    calories: number,
    weightGoalLb?: number,
    calculation?: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const defaults = calorieDefaults(
    defaultUnitSystem,
    defaultIntent,
    defaultWeightLb,
    savedWeightGoalLb,
  );
  const h = useHelperState({
    userId,
    kind: "calories",
    schema: calorieDraftSchema,
    defaults,
    onGoalsChange,
    restore: (goals) => {
      const restored = restoreCalorie(
        goals.calorieCalculation,
        calorieDefaults(
          defaultUnitSystem,
          defaultIntent,
          defaultWeightLb,
          goals.weightGoalLb,
        ),
        goals.calorieGoal,
      );
      if (!goals.calorieCalculation) {
        const other = goals.fluidCalculation?.latestCalculation as
          { inputs?: { sex?: unknown } } | undefined;
        const sex = other?.inputs?.sex ?? goals.fluidCalculation?.sex;
        if (sex === "male" || sex === "female") restored.inputs.sex = sex;
      }
      return restored;
    },
  });
  const d = h.inputs,
    r = h.result;
  const change = (patch: Partial<CalorieDraft>) => h.change({ ...d, ...patch });
  const height = (heightFeet: string, heightInches: string) => {
    const feet = parseNumber(heightFeet),
      inches = parseNumber(heightInches);
    change({
      heightFeet,
      heightInches,
      heightCm:
        feet === undefined || inches === undefined
          ? undefined
          : feetAndInchesToCentimeters(feet, inches),
    });
  };
  let dateSummary = "";
  if (
    d.intent === "lose" &&
    d.lossPlan === "date" &&
    d.targetDate &&
    d.weightKg !== undefined &&
    d.goalWeightKg !== undefined &&
    d.weightKg > d.goalWeightKg
  ) {
    try {
      const weeks = targetWeeks(localEntryDay(), d.targetDate);
      dateSummary = `${displayNumber(weeks, 1)} weeks · approximately ${rateText(kilogramsToPounds(d.weightKg - d.goalWeightKg) / weeks, d.unitSystem)}`;
    } catch (e) {
      dateSummary = e instanceof Error ? e.message : "Choose a valid date.";
    }
  }
  if (!h.loaded)
    return (
      <View>
        {h.error ? (
          <>
            <Text style={s.error}>{h.error}</Text>
            <HelperButton label="Retry" onPress={h.retry} />
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  return (
    <View>
      <Text accessibilityRole="header" style={s.title}>
        Daily calorie goal
      </Text>
      {!h.editing && r ? (
        <>
          <ResultCard
            accent="calories"
            target={`${r.target.toLocaleString()} kcal/day`}
            calculatedAt={r.calculatedAt}
            applied={h.goals.calorieGoal === r.target}
            summary={
              [
                r.inputs.age ? r.inputs.age + " years" : "",
                r.inputs.sex
                  ? (r.inputs.sex === "male" ? "Male" : "Female") + " reference"
                  : "",
                r.inputs.weightKg !== undefined
                  ? r.inputs.currentWeight +
                    " " +
                    (r.inputs.unitSystem === "us" ? "lb" : "kg")
                  : "",
                r.inputs.heightCm !== undefined
                  ? r.inputs.unitSystem === "us"
                    ? r.inputs.heightFeet +
                      " ft " +
                      r.inputs.heightInches +
                      " in"
                    : r.inputs.heightMetric + " cm"
                  : "",
                r.assumptions.activity
                  ? activities.find((a) => a.value === r.inputs.activity)?.label
                  : "",
              ]
                .filter(Boolean)
                .join(" \u00b7 ") ||
              "Saved calculation; some original inputs are unavailable"
            }
          >
            <Text style={s.copy}>
              {r.inputs.intent === "maintain"
                ? "Maintain weight"
                : r.inputs.intent === "gain"
                  ? `Gain · ${r.inputs.gain === "gain_10" ? "+10%" : "+5%"} surplus`
                  : `Lose toward ${r.inputs.goalWeight || "your saved goal"} ${r.inputs.unitSystem === "us" ? "lb" : "kg"}`}
            </Text>
            {r.maintenance ? (
              <Text style={s.copy}>
                Maintenance: {Math.round(r.maintenance).toLocaleString()}{" "}
                kcal/day
              </Text>
            ) : null}
            {r.rateLbPerWeek !== undefined ? (
              <Text style={s.copy}>
                {r.weeks ? `${displayNumber(r.weeks, 1)} weeks · ` : ""}
                approximately {rateText(r.rateLbPerWeek, r.inputs.unitSystem)}
              </Text>
            ) : null}
            {r.inputs.intent === "lose" ? (
              <Text style={s.copy}>
                {r.inputs.lossPlan === "date" && r.inputs.targetDate
                  ? `Target date: ${new Date(`${r.inputs.targetDate}T12:00:00`).toLocaleDateString()}`
                  : "Alternative rate; not a target-date plan"}
              </Text>
            ) : null}
            {r.maintenance &&
            r.inputs.intent === "lose" &&
            r.maintenance - r.target > r.maintenance * 0.2 ? (
              <Text style={s.error}>
                More than 20% below estimated maintenance. Consider a slower
                option or clinician guidance.
              </Text>
            ) : null}
          </ResultCard>
          {h.hasDraft ? (
            <Text style={s.copy}>
              Unfinished edits are saved on this device.
            </Text>
          ) : null}
          <HelperButton
            label={h.busy ? "Saving..." : "Use This Goal"}
            disabled={h.busy}
            onPress={() =>
              void h.apply((result) =>
                onUse(
                  result.target,
                  result.inputs.intent === "lose" &&
                    result.inputs.goalWeightKg !== undefined
                    ? normalizeWeightGoal(
                        kilogramsToPounds(result.inputs.goalWeightKg),
                      )
                    : undefined,
                  appliedCalculation(result),
                ),
              )
            }
          />
          <HelperButton
            label="Edit & Recalculate"
            secondary
            disabled={h.busy}
            onPress={h.edit}
          />
        </>
      ) : (
        <>
          {r ? (
            <Text style={[s.copy, { marginBottom: 16 }]}>
              Previous estimate: {r.target.toLocaleString()} kcal/day.
              Recalculate explicitly to update it; your applied goal stays
              unchanged.
            </Text>
          ) : null}
          <Text style={[s.copy, { marginBottom: 16 }]}>
            For adults 19+. Not for pregnancy, breastfeeding, eating-disorder
            care or clinician-directed nutrition needs. You can keep a manual
            goal in Profile.
          </Text>
          <Group title="Your Details" icon="person">
            <Choices
              value={d.unitSystem}
              onChange={(units) => h.change(calorieUnits(d, units))}
              disabled={h.busy}
              items={[
                { value: "us", label: "US customary" },
                { value: "metric", label: "Metric" },
              ]}
            />
            <View style={s.row}>
              <Field
                label="Age"
                value={d.age}
                disabled={h.busy}
                onChange={(age) => change({ age })}
              />
              <Field
                label={`Current weight (${d.unitSystem === "us" ? "lb" : "kg"})`}
                value={d.currentWeight}
                disabled={h.busy}
                onChange={(currentWeight) => {
                  const n = parseNumber(currentWeight);
                  change({
                    currentWeight,
                    weightKg:
                      n === undefined
                        ? undefined
                        : d.unitSystem === "us"
                          ? poundsToKilograms(n)
                          : n,
                  });
                }}
              />
            </View>
            {defaultWeightLb !== undefined &&
            (d.weightKg === undefined ||
              Math.abs(poundsToKilograms(defaultWeightLb) - d.weightKg) >
                0.00001) ? (
              <>
                <HelperButton
                  label="Use Latest Weight"
                  secondary
                  disabled={h.busy}
                  onPress={() =>
                    change({
                      weightKg: poundsToKilograms(defaultWeightLb),
                      currentWeight: displayNumber(
                        d.unitSystem === "us"
                          ? defaultWeightLb
                          : poundsToKilograms(defaultWeightLb),
                      ),
                    })
                  }
                />
                <Text style={s.copy}>
                  Latest:{" "}
                  {displayNumber(
                    d.unitSystem === "us"
                      ? defaultWeightLb
                      : poundsToKilograms(defaultWeightLb),
                  )}{" "}
                  {d.unitSystem === "us" ? "lb" : "kg"}
                  {defaultWeightOccurredAt
                    ? ` · ${new Date(defaultWeightOccurredAt).toLocaleDateString()}`
                    : ""}
                </Text>
              </>
            ) : null}
            {d.unitSystem === "us" ? (
              <View style={s.row}>
                <Field
                  label="Height (ft)"
                  value={d.heightFeet}
                  disabled={h.busy}
                  onChange={(feet) => height(feet, d.heightInches)}
                />
                <Field
                  label="Height (in)"
                  value={d.heightInches}
                  disabled={h.busy}
                  onChange={(inches) => height(d.heightFeet, inches)}
                />
              </View>
            ) : (
              <Field
                label="Height (cm)"
                value={d.heightMetric}
                disabled={h.busy}
                onChange={(heightMetric) =>
                  change({ heightMetric, heightCm: parseNumber(heightMetric) })
                }
              />
            )}
            <GenderField
              value={d.sex}
              onChange={(sex) => change({ sex })}
              disabled={h.busy}
            />
          </Group>
          <Group title="Activity" icon="workout">
            <Choices
              items={[...activities]}
              value={d.activity}
              onChange={(activity) => change({ activity })}
              disabled={h.busy}
            />
          </Group>
          <Group title="Your Goal" icon="weight">
            <Choices
              value={d.intent}
              onChange={(intent) => change({ intent })}
              disabled={h.busy}
              items={[
                { value: "maintain", label: "Maintain" },
                { value: "lose", label: "Lose" },
                { value: "gain", label: "Gain" },
              ]}
            />
            {d.intent === "lose" ? (
              <>
                <Field
                  label={`Goal weight (${d.unitSystem === "us" ? "lb" : "kg"})`}
                  value={d.goalWeight}
                  disabled={h.busy}
                  onChange={(goalWeight) => {
                    const n = parseNumber(goalWeight);
                    change({
                      goalWeight,
                      goalWeightKg:
                        n === undefined
                          ? undefined
                          : d.unitSystem === "us"
                            ? poundsToKilograms(n)
                            : n,
                    });
                  }}
                />
                <TargetDateField
                  value={d.targetDate}
                  onChange={(targetDate) =>
                    change({ targetDate, lossPlan: "date" })
                  }
                  disabled={h.busy}
                />
                {dateSummary ? <Text style={s.copy}>{dateSummary}</Text> : null}
                {d.lossPlan === "rate" ? (
                  <Text style={s.copy}>
                    Using an alternative rate of{" "}
                    {rateText(d.lossRate, d.unitSystem)}. This does not target
                    the selected date.
                  </Text>
                ) : null}
                <Disclosure title="Compare Other Options">
                  <Choices
                    value={d.lossPlan === "date" ? "date" : String(d.lossRate)}
                    disabled={h.busy}
                    onChange={(value) =>
                      change(
                        value === "date"
                          ? { lossPlan: "date" }
                          : { lossPlan: "rate", lossRate: Number(value) },
                      )
                    }
                    items={[
                      { value: "date", label: "Use Target Date" },
                      ...[0.5, 1, 1.5, 2].map((rate) => ({
                        value: String(rate),
                        label: rateText(rate, d.unitSystem),
                        detail: `About ${rate * 500} kcal/day below maintenance`,
                      })),
                    ]}
                  />
                  <Text style={s.copy}>
                    Choosing a comparison rate changes the plan. Calculate to
                    check whether it is supported.
                  </Text>
                </Disclosure>
              </>
            ) : d.intent === "gain" ? (
              <Choices
                value={d.gain}
                onChange={(gain) => change({ gain })}
                disabled={h.busy}
                items={[
                  { value: "gain_5", label: "+5%" },
                  { value: "gain_10", label: "+10%" },
                ]}
              />
            ) : null}
            {h.error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {h.error}
              </Text>
            ) : null}
          </Group>
          <HelperButton
            label={
              h.busy ? "Saving calculation..." : r ? "Recalculate" : "Calculate"
            }
            disabled={h.busy}
            onPress={() => void h.calculate(calculateCalorieResult)}
          />
          {r ? (
            <HelperButton
              label="Cancel edits"
              secondary
              disabled={h.busy}
              onPress={() => void h.cancel()}
            />
          ) : null}
        </>
      )}
      {!h.editing && h.error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {h.error}
        </Text>
      ) : null}
      <Disclosure title="How calorie estimates work">
        <Text style={s.copy}>
          Mifflin-St Jeor estimates resting energy from age, height, weight and
          the selected reference category. Activity multiplies this estimate;
          workout calories are already included.
        </Text>
        <Text style={s.copy}>
          {activities
            .map((a) => `${a.label}: ${ENERGY_ACTIVITY_FACTORS[a.value]}`)
            .join(" · ")}
        </Text>
        <Text style={s.copy}>
          Exercise means 15-30 minutes of elevated heart rate; intense exercise
          means 45-120 minutes, and very intense means 2+ hours.
        </Text>
        <Text style={s.copy}>
          Loss uses a short-term planning estimate of 500 kcal/day per lb/week,
          supporting 0.1-2 lb/week over 1-520 weeks. Gain uses a 5% or 10%
          surplus. Actual weight change varies as energy needs adapt.
        </Text>
        <Text style={s.copy}>
          Generated targets below 1,000 kcal/day are unavailable. This boundary
          is not a recommended intake. Review your weight trend and intake over
          time.
        </Text>
        {r?.bmr ? (
          <Text style={s.copy}>
            Saved resting estimate: {Math.round(r.bmr).toLocaleString()}{" "}
            kcal/day.
          </Text>
        ) : null}
      </Disclosure>
    </View>
  );
}

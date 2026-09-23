import { ActivityIndicator, Text, View } from "react-native";
import { useHelperState } from "./use-helper-state";
import {
  appliedCalculation,
  fluidDefaults,
  fluidDraftSchema,
  fluidUnits,
  calculateFluidResult,
  restoreFluid,
  displayNumber,
  parseNumber,
  type FluidDraft,
} from "./helper-model";
import {
  fluidActivities,
  fluidOuncesToMilliliters,
  millilitersToFluidOunces,
} from "./calculator";
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
import type { DailyGoals } from "./repository";
import { useAuth } from "../auth/auth-provider";

export function FluidGoalForm({
  initialUnit = "fl_oz",
  onPreview,
  savedGoalMl,
  onUse,
  onGoalsChange,
}: {
  initialUnit?: "fl_oz" | "ml";
  onPreview?: (ml: number) => void;
  savedGoalMl?: number;
  onUse: (ml: number, calculation: Record<string, unknown>) => Promise<void>;
  onGoalsChange?: (goals: DailyGoals) => void;
}) {
  const { session } = useAuth();
  return session ? (
    <FluidForm
      key={session.user.id}
      userId={session.user.id}
      initialUnit={initialUnit}
      onPreview={onPreview}
      savedGoalMl={savedGoalMl}
      onUse={onUse}
      onGoalsChange={onGoalsChange}
    />
  ) : null;
}
function FluidForm({
  userId,
  initialUnit,
  onPreview,
  savedGoalMl,
  onUse,
  onGoalsChange,
}: {
  userId: string;
  initialUnit: FluidDraft["unit"];
  onPreview?: (ml: number) => void;
  savedGoalMl?: number;
  onUse: (ml: number, calculation: Record<string, unknown>) => Promise<void>;
  onGoalsChange?: (goals: DailyGoals) => void;
}) {
  const defaults = fluidDefaults(initialUnit, savedGoalMl);
  const h = useHelperState({
    userId,
    kind: "fluids",
    schema: fluidDraftSchema,
    defaults,
    onGoalsChange,
    restore: (goals) => {
      const restored = restoreFluid(
        goals.fluidCalculation,
        fluidDefaults(initialUnit, goals.waterGoalMl),
        goals.waterGoalMl,
      );
      // Reuse an explicitly supplied category from the other helper only for a new form.
      if (!goals.fluidCalculation) {
        const other = goals.calorieCalculation?.latestCalculation as
          { inputs?: { sex?: unknown } } | undefined;
        const sex = other?.inputs?.sex ?? goals.calorieCalculation?.sex;
        if (sex === "male" || sex === "female") restored.inputs.sex = sex;
      }
      return restored;
    },
  });
  const d = h.inputs,
    r = h.result;
  const change = (patch: Partial<FluidDraft>) => h.change({ ...d, ...patch });
  const units = (
    <Choices
      value={d.unit}
      onChange={(unit) => h.change(fluidUnits(d, unit))}
      disabled={h.busy}
      items={[
        { value: "fl_oz", label: "US fl oz" },
        { value: "ml", label: "Milliliters" },
      ]}
    />
  );
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
        Daily fluid goal
      </Text>
      {!h.editing && r ? (
        <>
          <ResultCard
            accent="fluids"
            target={
              d.unit === "ml"
                ? `${displayNumber(r.target, 0)} mL/day`
                : `${displayNumber(millilitersToFluidOunces(r.target), 1)} US fl oz/day`
            }
            summary={
              r.inputs.mode === "custom"
                ? "Your custom daily beverage goal"
                : `${r.inputs.sex === "male" ? "Male" : r.inputs.sex === "female" ? "Female" : "Saved"} reference · ${fluidActivities.find((a) => a.id === r.inputs.activity)?.label ?? "Saved activity"}`
            }
            calculatedAt={r.calculatedAt}
            applied={
              h.goals.waterGoalMl !== undefined &&
              Math.abs(h.goals.waterGoalMl - r.target) < 0.000001
            }
          >
            {units}
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
              void h.apply(async (result) => {
                await onUse(result.target, appliedCalculation(result));
              })
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
              Your saved estimate is from the previous calculation. Recalculate
              to update it; your applied goal stays unchanged.
            </Text>
          ) : null}
          <Group title="Goal Type" icon="water">
            <Choices
              value={d.mode}
              onChange={(mode) => change({ mode })}
              disabled={h.busy}
              items={[
                { value: "suggested", label: "Suggested" },
                { value: "custom", label: "Custom" },
              ]}
            />
            <Text style={s.copy}>
              For a prescribed fluid limit, use Custom.
            </Text>
          </Group>
          {d.mode === "suggested" ? (
            <Group title="Your Details" icon="person">
              <GenderField
                value={d.sex}
                onChange={(sex) => change({ sex })}
                disabled={h.busy}
              />
              <Text style={s.label}>Usual activity</Text>
              <Choices
                value={d.activity}
                onChange={(activity) => change({ activity })}
                disabled={h.busy}
                items={fluidActivities.map((a) => ({
                  value: a.id,
                  label: a.label,
                  detail: a.detail,
                }))}
              />
            </Group>
          ) : null}
          <Group title="Units and Amount" icon="water">
            {units}
            {d.mode === "custom" ? (
              <Field
                label={`Custom beverage goal (${d.unit === "ml" ? "mL" : "US fl oz"})`}
                value={d.custom}
                disabled={h.busy}
                onChange={(custom) => {
                  const n = parseNumber(custom);
                  change({
                    custom,
                    customMl:
                      n === undefined
                        ? undefined
                        : d.unit === "ml"
                          ? n
                          : fluidOuncesToMilliliters(n),
                  });
                }}
              />
            ) : (
              <Text style={s.copy}>Choose how to display your daily goal.</Text>
            )}
          </Group>
          {h.error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {h.error}
            </Text>
          ) : null}
          <HelperButton
            label={
              h.busy ? "Saving calculation..." : r ? "Recalculate" : "Calculate"
            }
            disabled={h.busy}
            onPress={() =>
              void h.calculate((input) => {
                const result = calculateFluidResult(input);
                onPreview?.(result.target);
                return result;
              })
            }
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
      <Disclosure title="How fluid estimates work">
        <Text style={s.copy}>
          Suggested mode starts with 3.0 L for the male reference or 2.2 L for
          the female reference, from beverages. Food water is already accounted
          for. These are flexible adult population references, not individual
          minimums.
        </Text>
        <Text style={s.copy}>
          Usual activity adds 0, 250, 500 or 750 mL. These app planning
          allowances do not measure your fluid losses. Adjust for thirst and
          sweating. Custom mode uses only the amount you enter.
        </Text>
        <Text style={s.copy}>
          This is a daily beverage goal, not a measurement of hydration status.
        </Text>
      </Disclosure>
    </View>
  );
}

import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../ui/profile-theme";
import {
  bodyMassIndex,
  calorieTargetForLossRate,
  canUseCalorieTarget,
  poundsToKilograms,
} from "../goals/calculator";
import { displayNumber, type CalorieResult } from "../goals/helper-model";
import { styles } from "./settings-ui";

/** Compare the saved snapshot; never recalculate from newer readings or apply a goal. */
export function CalorieOptions({
  result,
  currentGoal,
  units,
}: {
  result: CalorieResult;
  currentGoal?: number;
  units: "us" | "metric";
}) {
  const maintenance = result.maintenance;
  if (!maintenance || !Number.isFinite(maintenance) || maintenance <= 0)
    return null;
  const { heightCm, weightKg, goalWeightKg } = result.inputs;
  let lossRestricted = false;
  if (heightCm !== undefined && weightKg !== undefined) {
    try {
      lossRestricted =
        bodyMassIndex(weightKg, heightCm) < 18.5 ||
        (goalWeightKg !== undefined &&
          bodyMassIndex(goalWeightKg, heightCm) < 18.5);
    } catch {
      lossRestricted = true;
    }
  }
  return (
    <View style={styles.card} testID="calorie-options">
      <Text accessibilityRole="header" style={styles.label}>
        Calculated options
      </Text>
      <Text style={styles.caption}>
        Based on your last saved calculation. Weight-change rates are estimates.
      </Text>
      {[0, 0.5, 1, 1.5, 2].map((rate) => {
        const target =
          rate === 0
            ? maintenance
            : calorieTargetForLossRate(maintenance, rate);
        const available =
          canUseCalorieTarget(target) && !(rate > 0 && lossRestricted);
        const label =
          rate === 0
            ? "Maintenance"
            : `-${displayNumber(units === "us" ? rate : poundsToKilograms(rate))} ${units === "us" ? "lb" : "kg"}/week`;
        const current = available && Math.round(target) === currentGoal;
        return (
          <View
            key={rate}
            testID={`calorie-option-${rate}`}
            style={optionStyles.row}
          >
            <View style={optionStyles.label}>
              <Text style={styles.label}>{label}</Text>
              {current ? (
                <Text style={optionStyles.current}>Current goal</Text>
              ) : null}
            </View>
            <Text style={optionStyles.value}>
              {available
                ? `${Math.round(target).toLocaleString()} kcal/day`
                : "Unavailable"}
            </Text>
          </View>
        );
      })}
      {lossRestricted ? (
        <Text style={styles.caption}>
          Review your saved height and weight inputs before comparing loss
          targets.
        </Text>
      ) : null}
      <Text style={styles.caption}>
        Options outside the calculator's supported range are unavailable. Review
        or change your plan with Edit &amp; Recalculate.
      </Text>
    </View>
  );
}

const optionStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 12,
    rowGap: 4,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  label: { flexShrink: 1 },
  current: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});

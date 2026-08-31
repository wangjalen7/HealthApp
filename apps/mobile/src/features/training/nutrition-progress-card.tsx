import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

const radius = 31;
const circumference = 2 * Math.PI * radius;

function progressFraction(value: number, goal: number | undefined): number {
  if (!goal || goal <= 0) return 0;
  return Math.max(0, Math.min(1, value / goal));
}

export function NutritionProgressCard({
  label,
  value,
  goal,
  unit,
  onPress,
}: {
  label: string;
  value: number;
  goal: number | undefined;
  unit: string;
  onPress: () => void;
}) {
  const fraction = progressFraction(value, goal);
  const roundedValue = Math.round(value);
  const roundedGoal = goal === undefined ? undefined : Math.round(goal);
  const hasGoal = roundedGoal !== undefined && roundedGoal > 0;
  const percentage = hasGoal ? Math.round(fraction * 100) : undefined;
  const accent = hasGoal && value > roundedGoal ? "#C05621" : "#16776A";

  return (
    <Pressable
      accessibilityHint="Opens food logging."
      accessibilityLabel={
        hasGoal
          ? `${label}: ${roundedValue} of ${roundedGoal} ${unit}`
          : `${label}: ${roundedValue} ${unit}, no goal set`
      }
      accessibilityRole="button"
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {roundedValue} {unit}
        </Text>
        <Text style={styles.detail}>
          {hasGoal ? `Goal ${roundedGoal} ${unit}` : "Set goal in Profile"}
        </Text>
      </View>
      <Svg height="76" width="76" viewBox="0 0 76 76">
        <Circle
          cx="38"
          cy="38"
          fill="none"
          r={radius}
          stroke="#DCE7E5"
          strokeWidth="8"
        />
        {hasGoal ? (
          <Circle
            cx="38"
            cy="38"
            fill="none"
            r={radius}
            rotation="-90"
            origin="38, 38"
            stroke={accent}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - fraction)}
            strokeLinecap="round"
            strokeWidth="8"
          />
        ) : null}
        <SvgText
          fill="#102A43"
          fontSize="14"
          fontWeight="800"
          textAnchor="middle"
          x="38"
          y="40"
        >
          {percentage === undefined ? "—" : `${percentage}%`}
        </SvgText>
        <SvgText
          fill="#627D98"
          fontSize="8"
          textAnchor="middle"
          x="38"
          y="52"
        >
          {hasGoal ? "today" : "no goal"}
        </SvgText>
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: "#E6F7F3",
    borderRadius: 16,
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 102,
    padding: 13,
  },
  copy: { flex: 1, paddingRight: 4 },
  label: { color: "#486581", fontSize: 13 },
  value: { color: "#102A43", fontSize: 19, fontWeight: "800", marginTop: 4 },
  detail: { color: "#627D98", fontSize: 11, marginTop: 5 },
});

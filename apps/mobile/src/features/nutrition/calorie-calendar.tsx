import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

import {
  calorieCalendarCells,
  localDateKey,
  type DailyCalorieTotal,
} from "./calendar";

const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
const radius = 14;
const circumference = 2 * Math.PI * radius;

function DayRing({
  day,
  total,
  goal,
  future,
}: {
  day: number;
  total: DailyCalorieTotal | undefined;
  goal: number | undefined;
  future: boolean;
}) {
  const hasGoal = Boolean(goal && goal > 0);
  const hasEntries = Boolean(total?.entryCount);
  const fraction =
    hasGoal && total ? Math.max(0, Math.min(1, total.calories / goal!)) : 0;
  const accent =
    hasEntries && hasGoal
      ? total!.calories > goal!
        ? "#C2413A"
        : colors.blue
      : "#CBD5E1";
  return (
    <View
      accessibilityLabel={
        hasEntries
          ? `${day}: ${Math.round(total!.calories)} calories${hasGoal ? (total!.calories > goal! ? ", over goal" : ", under goal") : ""}`
          : `${day}: no food logged`
      }
      style={[styles.day, future && styles.future]}
    >
      <Svg height="38" width="38" viewBox="0 0 38 38">
        <Circle
          cx="19"
          cy="19"
          fill="none"
          r={radius}
          stroke={colors.fill}
          strokeWidth="5"
        />
        {hasEntries ? (
          <Circle
            cx="19"
            cy="19"
            fill="none"
            r={radius}
            transform="rotate(-90 19 19)"
            stroke={accent}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - (hasGoal ? fraction : 1))}
            strokeLinecap="round"
            strokeWidth="5"
          />
        ) : null}
        <SvgText
          fill={colors.text}
          fontSize="11"
          fontWeight="800"
          textAnchor="middle"
          x="19"
          y="23"
        >
          {day}
        </SvgText>
      </Svg>
      <Text style={styles.calories}>
        {hasEntries ? Math.round(total!.calories) : ""}
      </Text>
    </View>
  );
}

export function CalorieCalendar({
  totals,
  goal,
  reference = new Date(),
  canGoNext = true,
  onNext,
  onPrevious,
}: {
  totals: Record<string, DailyCalorieTotal>;
  goal: number | undefined;
  reference?: Date;
  canGoNext?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
}) {
  const cells = calorieCalendarCells(reference);
  const todayKey = localDateKey(new Date());
  const title = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(reference);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Show previous month"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onPrevious}
          style={({ pressed }) => [
            styles.monthButton,
            pressed && styles.monthButtonPressed,
          ]}
        >
          <Text style={styles.monthButtonText}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          {title} Calories
        </Text>
        <Pressable
          accessibilityLabel="Show next month"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoNext }}
          disabled={!canGoNext}
          hitSlop={8}
          onPress={onNext}
          style={({ pressed }) => [
            styles.monthButton,
            !canGoNext && styles.monthButtonDisabled,
            pressed && canGoNext && styles.monthButtonPressed,
          ]}
        >
          <Text style={styles.monthButtonText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekdays}>
        {weekdays.map((day, index) => (
          <Text key={`${day}-${index}`} style={styles.weekday}>
            {day}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell, index) =>
          cell ? (
            <DayRing
              day={cell.day}
              future={cell.dateKey > todayKey}
              goal={goal}
              key={cell.dateKey}
              total={totals[cell.dateKey]}
            />
          ) : (
            <View key={`empty-${index}`} style={styles.day} />
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.separator,
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 18,
    padding: 14,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  monthButton: {
    alignItems: "center",
    borderColor: colors.separator,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  monthButtonDisabled: { opacity: 0.3 },
  monthButtonPressed: { backgroundColor: colors.fill },
  monthButtonText: {
    color: colors.blue,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 29,
  },
  weekdays: { flexDirection: "row", marginBottom: 3 },
  weekday: {
    color: colors.tertiary,
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    width: "14.2857%",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  day: { alignItems: "center", minHeight: 52, width: "14.2857%" },
  future: { opacity: 0.42 },
  calories: { color: colors.tertiary, fontSize: 8, marginTop: -1 },
});

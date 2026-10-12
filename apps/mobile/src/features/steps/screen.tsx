import { useCallback, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../auth/auth-provider";
import { getDailyGoals, type DailyGoals } from "../goals/repository";
import { dayKey } from "../summary/calendar";
import { ScreenScrollView } from "../../ui/screen-scroll-view";
import { SegmentedControl } from "../../ui/segmented-control";
import { Pressable } from "../../ui/pressable";
import { Icon } from "../../ui/icon";
import { colors } from "../../ui/theme";
import {
  completedAverage,
  moveStepPeriod,
  stepPeriod,
  stepRanges,
  stepChartRows,
  type StepRange,
} from "./model";
import { useSteps } from "./use-steps";
import { StepChart } from "./step-chart";

export function StepsScreen() {
  const { session } = useAuth();
  return <StepsContent key={session?.user.id} user={session?.user.id ?? ""} />;
}
function StepsContent({ user }: { user: string }) {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [range, setRange] = useState<StepRange>("D");
  const [selected, setSelected] = useState<string>();
  const [bar, setBar] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [goals, setGoals] = useState<DailyGoals>();
  const [goalError, setGoalError] = useState(false);
  const steps = useSteps(user, range, selected);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void getDailyGoals(user)
        .then((g) => {
          if (live) {
            setGoals(g);
            setGoalError(false);
          }
        })
        .catch(() => {
          if (live) setGoalError(true);
        });
      return () => {
        live = false;
      };
    }, [user]),
  );
  const day = selected ?? dayKey(steps.now);
  const period = stepPeriod(range, day);
  const rows =
    (range === "D" ? steps.data?.hourly : steps.data?.daily)?.filter(
      (b) =>
        new Date(b.start) >= period.start &&
        new Date(b.start) < period.end &&
        new Date(b.start) <= steps.now,
    ) ?? [];
  const average = completedAverage(rows, steps.now);
  const total =
    steps.data?.daily.find((b) => dayKey(new Date(b.start)) === day)?.total ??
    undefined;
  const value = range === "D" ? total : average.value;
  const chartRows = stepChartRows(
    rows,
    period.start,
    period.end,
    range,
    steps.now,
  );
  const current = stepPeriod(range, dayKey(steps.now));
  const isCurrent = current.start.getTime() === period.start.getTime();
  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const lastDay = new Date(period.end);
  lastDay.setDate(lastDay.getDate() - 1);
  const dateLabel =
    range === "D"
      ? formatDate(period.start)
      : range === "Y" || range === "6M"
        ? `${period.start.toLocaleDateString(undefined, { month: "short", year: "numeric" })} \u2013 ${lastDay.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
        : range === "M"
          ? period.start.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })
          : `${formatDate(period.start)} – ${formatDate(lastDay)}`;
  const navigate = (direction: -1 | 1) => {
    setSelected(moveStepPeriod(range, day, direction));
    setBar(undefined);
  };
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={styles.button}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
  return (
    <ScreenScrollView
      contentContainerStyle={styles.page}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void steps.refresh(true).finally(() => setRefreshing(false));
          }}
          tintColor={colors.blue}
        />
      }
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back from Steps"
          onPress={() =>
            router.replace(
              from === "workout"
                ? "/(app)/workout"
                : from === "health"
                  ? "/profile/health"
                  : "/(app)",
            )
          }
          style={styles.iconButton}
        >
          <Icon name="back" />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Steps
        </Text>
      </View>
      <View style={styles.card}>
        <SegmentedControl
          label="Steps time range"
          style={styles.range}
          options={stepRanges.map((value) => ({ value, label: value }))}
          value={range}
          onChange={(value) => {
            setRange(value);
            setBar(undefined);
          }}
        />
        <View style={styles.period}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous steps period"
            onPress={() => navigate(-1)}
            style={styles.iconButton}
          >
            <Icon name="back" size={19} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isCurrent ? dateLabel : `${dateLabel}. Return to current period`
            }
            disabledOpacity={1}
            disabled={isCurrent}
            accessibilityState={{ disabled: isCurrent }}
            onPress={() => {
              setSelected(undefined);
              setBar(undefined);
            }}
            style={styles.dateButton}
          >
            <Text style={styles.date}>{dateLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next steps period"
            accessibilityState={{ disabled: isCurrent }}
            disabled={isCurrent}
            onPress={() => navigate(1)}
            style={styles.iconButton}
          >
            <Icon
              name="chevron"
              size={19}
              color={isCurrent ? colors.tertiary : colors.blue}
            />
          </Pressable>
        </View>
        <View style={styles.metrics}>
          <Text style={styles.caption}>
            {range === "D" ? "TOTAL" : "DAILY AVERAGE"}
          </Text>
          <Text style={styles.value}>
            {value === undefined
              ? "\u2014"
              : Math.round(value).toLocaleString()}
            <Text style={styles.unit}> steps</Text>
          </Text>
          <Text style={styles.copy}>
            {range === "D"
              ? day === dayKey(steps.now)
                ? "Today so far"
                : "Selected day"
              : `${average.days} completed ${average.days === 1 ? "day" : "days"}`}
          </Text>
        </View>
        <StepChart
          rows={chartRows}
          start={period.start}
          end={period.end}
          range={range}
          now={steps.now}
          selected={bar}
          onSelect={setBar}
        />
      </View>
      {steps.unavailable ? (
        <Text style={styles.copy}>{steps.unavailable}</Text>
      ) : !steps.data?.connected ? (
        <View style={styles.card}>
          <Text style={styles.copy}>
            Connect steps, weight, blood pressure and paired pulse. Step totals
            stay on this device; other readings sync to your private account.
          </Text>
          {button(
            steps.connecting ? "Connecting..." : "Connect Apple Health",
            () => void steps.connect(),
            steps.connecting,
          )}
        </View>
      ) : null}
      {steps.error ? (
        <Text accessibilityRole="alert" style={styles.copy}>
          {steps.error}
        </Text>
      ) : null}
      {rows.length ? (
        <Text style={styles.caption}>
          Updated{" "}
          {new Date(
            rows.reduce(
              (old, b) => (b.refreshedAt < old ? b.refreshedAt : old),
              rows[0]!.refreshedAt,
            ),
          ).toLocaleString()}
          {steps.error ? " · Saved data" : ""}
        </Text>
      ) : null}
      <View style={styles.goal}>
        <Text style={styles.copy}>
          {goalError
            ? "Goal unavailable"
            : goals?.stepGoal === undefined
              ? "No daily step goal"
              : `Daily goal · ${goals.stepGoal.toLocaleString()} steps`}
        </Text>
        {button(goals?.stepGoal === undefined ? "Add goal" : "Edit goal", () =>
          router.push({
            pathname: "/profile/goal/[kind]",
            params: {
              kind: "steps",
              returnTo: "steps",
              stepFrom: from ?? "summary",
            },
          }),
        )}
      </View>
    </ScreenScrollView>
  );
}
const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { fontSize: 30, fontWeight: "700", color: colors.text, flex: 1 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  period: { flexDirection: "row", alignItems: "center", gap: 4 },
  date: {
    textAlign: "center",
    fontWeight: "600",
    fontSize: 16,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    gap: 4,
  },
  range: { marginBottom: 0 },
  metrics: { gap: 2, marginBottom: 8 },
  dateButton: { flex: 1, minHeight: 44, justifyContent: "center" },
  caption: { fontSize: 12, fontWeight: "600", color: colors.secondary },
  value: {
    fontSize: 38,
    fontWeight: "700",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  unit: { fontSize: 16, fontWeight: "500", color: colors.secondary },
  copy: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  button: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  link: { fontSize: 14, fontWeight: "600", color: colors.blue },
  goal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
});

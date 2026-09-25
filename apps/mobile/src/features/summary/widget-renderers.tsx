import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Icon } from "../../ui/icon";
import { Pressable } from "../../ui/pressable";
import { SegmentedControl } from "../../ui/segmented-control";
import { colors } from "../../ui/theme";
import {
  deduplicateVitalSamples,
  latestSample,
  trendRanges,
  type TrendRange,
  type VitalSample,
} from "../../domain/vitals";
import type { DailyGoals } from "../goals/repository";
import { mlToFluidOunces } from "../hydration/model";
import {
  startOfCalendarMonth,
  type DailyCalorieTotal,
} from "../nutrition/calendar";
import { CalorieCalendar } from "../nutrition/calorie-calendar";
import { NutritionProgressCard } from "../training/nutrition-progress-card";
import type { TodaySummary } from "../training/repository";
import { classifyBloodPressure } from "../vitals/blood-pressure";
import { TrendCard, BloodPressureTrendCard } from "../vitals/trend-card";
import { pairedReadings } from "../streaks/engine";
import { registry, type Widget, type WidgetType } from "./layout";
import type { useSummary } from "./use-summary";
import { WidgetSkeleton } from "./widget-skeleton";
import { ExtraWidget } from "./extra-widgets";
import { Action } from "./dashboard";
export type WidgetContext = {
  samples: VitalSample[];
  goals: DailyGoals;
  summary: TodaySummary;
  waterMl: number;
  pendingFluidMl: number;
  calendarMonth: Date;
  monthCalories: Record<string, DailyCalorieTotal>;
  moveCalendarMonth: (offset: -1 | 1) => void;
  resources: ReturnType<typeof useSummary>;
  setChartSwipeActive: (active: boolean) => void;
  now: Date;
  user: string;
};
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function BaseWidget({
  widget,
  context,
}: {
  widget: Widget;
  context: WidgetContext;
}) {
  const router = useRouter();
  const [range, setRange] = useState<TrendRange>("W");
  const {
    samples,
    goals,
    summary,
    waterMl,
    pendingFluidMl,
    calendarMonth,
    monthCalories,
    moveCalendarMonth,
    setChartSwipeActive,
  } = context;
  useEffect(() => () => setChartSwipeActive(false), [setChartSwipeActive]);
  const combinedSamples = deduplicateVitalSamples(samples);
  const weight = latestSample(combinedSamples, "weight");
  const systolic = pairedReadings(samples).sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  )[0];
  const diastolic = systolic
    ? samples.find(
        (d) =>
          !d.deletedAt &&
          d.kind === "diastolic_bp" &&
          d.source === systolic.source &&
          (systolic.correlationId
            ? d.correlationId === systolic.correlationId
            : !d.correlationId && d.occurredAt === systolic.occurredAt),
      )
    : undefined;
  const bloodPressureCategory =
    systolic && diastolic
      ? classifyBloodPressure(systolic.value, diastolic.value)
      : undefined;
  const weightPounds = weight
    ? weight.unit === "kg"
      ? weight.value * 2.20462
      : weight.value
    : undefined;
  const automaticProteinGoal =
    weightPounds === undefined ? undefined : Math.round(weightPounds * 0.7);
  const proteinGoal = goals.proteinGoal ?? automaticProteinGoal;

  const resources = context.resources;
  const resource =
    widget.type === "calendar"
      ? resources.calendar
      : widget.type === "fluids"
        ? resources.fluids
        : ["calories", "protein"].includes(widget.type)
          ? resources.nutrition
          : resources.vitals;
  const missing = resource.data === undefined;
  if (missing && widget.type !== "calendar")
    return (
      <WidgetSkeleton
        widget={widget}
        error={resource.error}
        retry={
          <Action
            label={"Retry " + registry[widget.type].title}
            onPress={() => void resource.refresh()}
          />
        }
        controls={
          widget.type.endsWith("_trend") ? (
            <SegmentedControl
              label={registry[widget.type].title + " time range"}
              options={trendRanges.map((value) => ({ value, label: value }))}
              value={range}
              onChange={setRange}
            />
          ) : undefined
        }
      />
    );
  switch (widget.type) {
    case "weight":
      return (
        <Metric
          large={widget.size === "wide"}
          label="Weight"
          onPress={() =>
            router.push({
              pathname: "/(app)/history",
              params: { view: "weight" },
            })
          }
          value={weight ? `${weight.value}` : "--"}
          unit={weight?.unit}
          detail={
            weight
              ? `Measured ${formatDateTime(weight.occurredAt)}${goals.weightGoalLb ? ` · Goal: ${goals.weightGoalLb} lb` : ""}`
              : goals.weightGoalLb
                ? `Goal: ${goals.weightGoalLb} lb`
                : "No measurement"
          }
        />
      );
    case "bp":
      return (
        <Metric
          large={widget.size === "wide"}
          label="Blood pressure"
          unit="mmHg"
          onPress={() =>
            router.push({
              pathname: "/(app)/history",
              params: { view: "blood_pressure" },
            })
          }
          value={
            systolic && diastolic
              ? `${systolic.value}/${diastolic.value}`
              : "--"
          }
          valueColor={bloodPressureCategory?.color}
          detail={
            systolic
              ? `Measured ${formatDateTime(systolic.occurredAt)} · Goal: ${goals.systolicGoal ?? 120}/${goals.diastolicGoal ?? 80}`
              : `Goal: ${goals.systolicGoal ?? 120}/${goals.diastolicGoal ?? 80}`
          }
        />
      );
    case "calories":
      return (
        <NutritionProgressCard
          size={widget.size}
          goalLoading={
            resources.goals.data === undefined && !resources.goals.error
          }
          goalUnavailable={
            resources.goals.data === undefined && !!resources.goals.error
          }
          accessibilityHint="Opens Food history."
          label="Calories"
          goal={goals.calorieGoal}
          onPress={() =>
            router.push({
              pathname: "/(app)/history",
              params: { view: "food" },
            })
          }
          unit="cal"
          value={summary.calories}
        />
      );
    case "protein":
      return (
        <NutritionProgressCard
          size={widget.size}
          goalLoading={
            resources.goals.data === undefined && !resources.goals.error
          }
          goalUnavailable={
            resources.goals.data === undefined && !!resources.goals.error
          }
          accessibilityHint="Opens Food history."
          label="Protein"
          goal={proteinGoal}
          onPress={() =>
            router.push({
              pathname: "/(app)/history",
              params: { view: "food" },
            })
          }
          unit="g"
          value={summary.protein}
        />
      );
    case "fluids":
      return (
        <NutritionProgressCard
          size={widget.size}
          goalLoading={
            resources.goals.data === undefined && !resources.goals.error
          }
          goalUnavailable={
            resources.goals.data === undefined && !!resources.goals.error
          }
          label={pendingFluidMl > 0 ? "Fluids (some pending)" : "Fluids"}
          goal={
            goals.waterGoalMl === undefined
              ? undefined
              : mlToFluidOunces(goals.waterGoalMl)
          }
          onPress={() => router.push("/(app)/water")}
          unit="fl oz"
          value={mlToFluidOunces(waterMl)}
        />
      );
    case "calendar":
      return (
        <CalorieCalendar
          canGoNext={
            calendarMonth.getTime() < startOfCalendarMonth(new Date()).getTime()
          }
          goal={goals.calorieGoal}
          onNext={() => moveCalendarMonth(1)}
          onPrevious={() => moveCalendarMonth(-1)}
          reference={calendarMonth}
          totals={monthCalories}
          loading={missing || resources.goals.data === undefined}
          error={resource.error}
          unavailable={
            (missing && !!resource.error) ||
            (resources.goals.data === undefined && !!resources.goals.error)
          }
          onRetry={() => void resource.refresh()}
        />
      );
    case "weight_trend":
      return (
        <View>
          {
            <TrendCard
              controls={
                <SegmentedControl
                  label="Weight trend time range"
                  options={trendRanges.map((item) => ({
                    value: item,
                    label: item,
                  }))}
                  value={range}
                  onChange={setRange}
                />
              }
              title="Weight"
              kind="weight"
              samples={combinedSamples}
              range={range}
              onHorizontalGestureChange={setChartSwipeActive}
            />
          }
        </View>
      );
    case "bp_trend":
      return (
        <View>
          {
            <BloodPressureTrendCard
              controls={
                <SegmentedControl
                  label="Blood pressure trend time range"
                  options={trendRanges.map((item) => ({
                    value: item,
                    label: item,
                  }))}
                  value={range}
                  onChange={setRange}
                />
              }
              samples={combinedSamples}
              range={range}
              onHorizontalGestureChange={setChartSwipeActive}
            />
          }
        </View>
      );

    default:
      return null;
  }
}
// The gallery definitions and renderers use the same type/configuration registry.
export const widgetRegistry = Object.fromEntries(
  Object.entries(registry).map(([type, definition]) => [
    type,
    {
      ...definition,
      render: (widget: Widget, context: WidgetContext) => {
        const extras = ["training", "meals", "actions", "streaks"].includes(
          type,
        );
        const r = context.resources;
        const resource =
          type === "calendar"
            ? r.calendar
            : type === "fluids"
              ? r.fluids
              : ["calories", "protein"].includes(type)
                ? r.nutrition
                : type === "training"
                  ? r.training
                  : type === "meals"
                    ? r.meals
                    : type === "actions"
                      ? r.actions
                      : type === "streaks"
                        ? r.streaks
                        : r.vitals;
        const extra =
          type === "training"
            ? r.training
            : type === "meals"
              ? r.meals
              : type === "actions"
                ? r.actions
                : r.streaks;
        return (
          <View style={{ flex: 1 }}>
            {extras ? (
              <ExtraWidget
                widget={widget}
                data={extra.data}
                now={context.now}
                user={context.user}
                loading={extra.loading}
                error={extra.error}
                reload={() => void extra.refresh()}
              />
            ) : (
              <BaseWidget widget={widget} context={context} />
            )}
            {resource.data !== undefined &&
            resource.error &&
            type !== "calendar" ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void resource.refresh()}
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ color: colors.secondary, fontSize: 12 }}>
                  Could not update. Showing saved data. Retry
                </Text>
              </Pressable>
            ) : null}
            {[
              "calories",
              "protein",
              "fluids",
              "calendar",
              "weight",
              "bp",
            ].includes(type) && r.goals.error ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void r.goals.refresh()}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.secondary, fontSize: 12 }}>
                  Goal could not update. Retry
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      },
    },
  ]),
) as Record<
  WidgetType,
  (typeof registry)[WidgetType] & {
    render: (widget: Widget, context: WidgetContext) => ReactNode;
  }
>;
function Metric({
  label,
  value,
  detail,
  onPress,
  valueColor,
  large,
  unit,
}: {
  label: string;
  value: string;
  detail?: string;
  onPress?: () => void;
  valueColor?: string;
  large?: boolean;
  unit?: string;
}) {
  return (
    <Pressable
      accessibilityHint={
        onPress ? "Opens the matching detailed log." : undefined
      }
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={styles.metric}
    >
      <View style={styles.metricHeading}>
        <Icon
          name={label === "Weight" ? "weight" : "heart"}
          size={17}
          color={label === "Weight" ? colors.purple : colors.pink}
        />
        <Text style={styles.metricLabel}>{label}</Text>
        <Icon name="chevron" size={11} color={colors.tertiary} />
      </View>
      <Text
        style={[
          styles.metricValue,
          large && { fontSize: 34 },
          valueColor ? { color: valueColor } : undefined,
        ]}
      >
        {value}
        {unit ? (
          <Text
            style={{ fontSize: 14, color: colors.secondary, fontWeight: "500" }}
          >
            {" "}
            {unit}
          </Text>
        ) : null}
      </Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  metric: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    flex: 1,
    padding: 16,
  },
  metricHeading: { flexDirection: "row", alignItems: "center", gap: 5 },
  metricLabel: {
    color: colors.secondary,
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  metricValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.8,
    marginTop: 12,
  },
  metricDetail: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 8,
  },
});

import { Icon } from "../../src/ui/icon";
import { SegmentedControl } from "../../src/ui/segmented-control";
import { surfaces } from "../../src/ui/theme";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import {
  deduplicateVitalSamples,
  latestSample,
  trendRanges,
  type TrendRange,
  type VitalSample,
} from "../../src/domain/vitals";
import { useAuth } from "../../src/features/auth/auth-provider";
import {
  getDailyGoals,
  type DailyGoals,
} from "../../src/features/goals/repository";
import { mlToFluidOunces } from "../../src/features/hydration/model";
import { getTodayHydrationMl } from "../../src/features/hydration/repository";
import {
  importHealthKitData,
  loadHealthKitSyncState,
} from "../../src/features/healthkit/sync";
import {
  shiftCalendarMonth,
  startOfCalendarMonth,
  type DailyCalorieTotal,
} from "../../src/features/nutrition/calendar";
import { CalorieCalendar } from "../../src/features/nutrition/calorie-calendar";
import { getCurrentMonthCalorieTotals } from "../../src/features/nutrition/repository";
import {
  getTodaySummary,
  type TodaySummary,
} from "../../src/features/training/repository";
import { NutritionProgressCard } from "../../src/features/training/nutrition-progress-card";
import { classifyBloodPressure } from "../../src/features/vitals/blood-pressure";
import {
  BloodPressureTrendCard,
  TrendCard,
} from "../../src/features/vitals/trend-card";
import {
  loadCachedVitals,
  loadLastVitalSyncAt,
  syncVitals,
} from "../../src/features/vitals/sync";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
type UnifiedSyncResult = {
  lastSyncedAt?: string;
  message: string;
};
export default function SummaryScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session, configured } = useAuth();
  const insets = useSafeAreaInsets();
  const [samples, setSamples] = useState<VitalSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const [range, setRange] = useState<TrendRange>("W");
  const [chartSwipeActive, setChartSwipeActive] = useState(false);
  const [summary, setSummary] = useState<TodaySummary>({
    calories: 0,
    protein: 0,
  });
  const [waterMl, setWaterMl] = useState(0);
  const [monthCalories, setMonthCalories] = useState<
    Record<string, DailyCalorieTotal>
  >({});
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfCalendarMonth(new Date()),
  );
  const [goals, setGoals] = useState<DailyGoals>({
    systolicGoal: 120,
    diastolicGoal: 80,
  });
  const syncInFlight = useRef<Promise<UnifiedSyncResult> | undefined>(
    undefined,
  );
  const loadedUserId = useRef<string | undefined>(undefined);
  const calendarMonthRef = useRef(calendarMonth);
  const monthRequestId = useRef(0);
  calendarMonthRef.current = calendarMonth;
  const loadMonthCalories = useCallback(
    async (userId: string, reference: Date) => {
      const requestId = monthRequestId.current + 1;
      monthRequestId.current = requestId;
      const totals = await getCurrentMonthCalorieTotals(userId, reference);
      if (monthRequestId.current === requestId) setMonthCalories(totals);
    },
    [],
  );
  const moveCalendarMonth = useCallback((offset: -1 | 1) => {
    const next = shiftCalendarMonth(calendarMonthRef.current, offset);
    if (next > startOfCalendarMonth(new Date())) return;
    calendarMonthRef.current = next;
    monthRequestId.current += 1;
    setMonthCalories({});
    setCalendarMonth(next);
  }, []);
  const synchronize = useCallback(
    async (userId: string): Promise<UnifiedSyncResult> => {
      if (!configured) {
        return { message: "Saved on this device. Supabase is not configured." };
      }
      if (syncInFlight.current) return syncInFlight.current;

      const operation = (async () => {
        const healthKitState = await loadHealthKitSyncState(userId);
        if (healthKitState.connected) {
          try {
            const imported = await importHealthKitData(userId);
            const importedCount =
              imported.weightCount + imported.bloodPressureCount;
            return {
              lastSyncedAt: imported.lastImportedAt,
              message: importedCount
                ? `Sync complete. Imported ${importedCount} Apple Health reading${importedCount === 1 ? "" : "s"}.`
                : "",
            };
          } catch (error) {
            const vitalResult = await syncVitals(userId);
            const reason =
              error instanceof Error
                ? error.message
                : "Could not import Apple Health data.";
            return vitalResult.error
              ? { message: `Sync waiting: ${vitalResult.error}` }
              : {
                  lastSyncedAt: vitalResult.lastSyncedAt,
                  message: `Synced Supabase. Apple Health needs attention: ${reason}`,
                };
          }
        }

        const vitalResult = await syncVitals(userId);
        return vitalResult.error
          ? { message: `Sync waiting: ${vitalResult.error}` }
          : {
              lastSyncedAt: vitalResult.lastSyncedAt,
              message: "",
            };
      })();
      syncInFlight.current = operation;
      try {
        return await operation;
      } finally {
        if (syncInFlight.current === operation) {
          syncInFlight.current = undefined;
        }
      }
    },
    [configured],
  );
  const load = useCallback(
    async (sync = false, isPullRefresh = false) => {
      if (!session) return;
      const isInitialLoad = loadedUserId.current !== session.user.id;
      if (isInitialLoad) setLoading(true);
      if (isPullRefresh) setRefreshing(true);
      if (sync) setSyncing(true);
      try {
        const cached = await loadCachedVitals(session.user.id);
        setSamples(cached);
        setLastSyncedAt(await loadLastVitalSyncAt(session.user.id));
        if (sync) {
          const result = await synchronize(session.user.id);
          setStatus(result.message);
          if (result.lastSyncedAt) setLastSyncedAt(result.lastSyncedAt);
          setSamples(await loadCachedVitals(session.user.id));
        }
        const [today, savedGoals, todayWater] = await Promise.all([
          getTodaySummary(session.user.id),
          getDailyGoals(session.user.id),
          getTodayHydrationMl(session.user.id),
          loadMonthCalories(session.user.id, calendarMonthRef.current),
        ]);
        setSummary(today);
        setGoals(savedGoals);
        setWaterMl(todayWater);
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Could not load summary.",
        );
      } finally {
        loadedUserId.current = session.user.id;
        if (isInitialLoad) setLoading(false);
        if (isPullRefresh) setRefreshing(false);
        if (sync) setSyncing(false);
      }
    },
    [loadMonthCalories, session, synchronize],
  );
  useEffect(() => {
    if (!session) return;
    void loadMonthCalories(session.user.id, calendarMonth).catch((error) =>
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not load calorie calendar.",
      ),
    );
  }, [calendarMonth, loadMonthCalories, session]);
  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );
  const combinedSamples = deduplicateVitalSamples(samples);
  const weight = latestSample(combinedSamples, "weight");
  const systolic = latestSample(combinedSamples, "systolic_bp");
  const diastolic = latestSample(combinedSamples, "diastolic_bp");
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
  const rawFirstName = session?.user.user_metadata?.first_name;
  const rawDisplayName = session?.user.user_metadata?.display_name;
  const firstName =
    (typeof rawFirstName === "string" && rawFirstName.trim()) ||
    (typeof rawDisplayName === "string" &&
      rawDisplayName.trim().split(/\s+/)[0]) ||
    "there";
  return (
    <ScreenScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
      alwaysBounceVertical
      directionalLockEnabled
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.blue}
          colors={[colors.blue]}
          progressViewOffset={insets.top + 12}
          title={refreshing ? "Syncing..." : "Pull to sync"}
          titleColor={colors.secondary}
          onRefresh={() => void load(true, true)}
        />
      }
      scrollEnabled={!chartSwipeActive}
    >
      <Text style={styles.date}>
        {new Intl.DateTimeFormat(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(new Date())}
      </Text>
      <View style={styles.summaryHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, width < 360 && { fontSize: 28 }]}>
            Hi {firstName},
          </Text>
          <Text style={styles.snapshot}>Your daily snapshot</Text>
        </View>
        <View style={styles.syncArea}>
          <Pressable
            accessibilityLabel="Sync now"
            accessibilityRole="button"
            accessibilityState={{ busy: syncing, disabled: syncing }}
            disabled={syncing}
            onPress={() => void load(true)}
            style={({ pressed }) => [
              styles.sync,
              pressed && styles.syncPressed,
              syncing && styles.syncDisabled,
            ]}
          >
            {syncing ? (
              <ActivityIndicator
                accessibilityLabel="Syncing summary"
                color={colors.blue}
                size="small"
              />
            ) : (
              <Svg
                {...(Platform.OS === "web"
                  ? { "aria-hidden": true }
                  : { accessibilityElementsHidden: true })}
                height="16"
                viewBox="0 0 24 24"
                width="16"
              >
                <Path
                  d="M20 12a8 8 0 1 1-2.34-5.66M20 3v6h-6"
                  fill="none"
                  stroke={colors.blue}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </Svg>
            )}
            <Text style={styles.syncText}>Sync</Text>
          </Pressable>
          <Text style={styles.syncTime}>
            {lastSyncedAt
              ? `Synced ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(lastSyncedAt))}`
              : "Not synced yet"}
          </Text>
        </View>
      </View>
      {status ? <Text style={styles.copy}>{status}</Text> : null}
      <Text style={styles.sectionTitle}>Latest readings</Text>
      <View style={styles.metrics}>
        <Metric
          label="Weight"
          onPress={() =>
            router.push({
              pathname: "/(app)/history",
              params: { view: "weight" },
            })
          }
          value={weight ? `${weight.value} ${weight.unit}` : "--"}
          detail={
            weight
              ? `Measured ${formatDateTime(weight.occurredAt)}${goals.weightGoalLb ? ` · Goal: ${goals.weightGoalLb} lb` : ""}`
              : goals.weightGoalLb
                ? `Goal: ${goals.weightGoalLb} lb`
                : "No measurement"
          }
        />
        <Metric
          label="Blood pressure"
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
      </View>
      <Text style={styles.sectionTitle}>Today's nutrition</Text>
      <View style={styles.nutritionMetrics}>
        <NutritionProgressCard
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
        <NutritionProgressCard
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
      </View>
      <View style={styles.waterMetric}>
        <NutritionProgressCard
          label="Water"
          goal={
            goals.waterGoalMl === undefined
              ? undefined
              : mlToFluidOunces(goals.waterGoalMl)
          }
          onPress={() => router.push("/(app)/water")}
          unit="fl oz"
          value={mlToFluidOunces(waterMl)}
        />
      </View>
      <CalorieCalendar
        canGoNext={
          calendarMonth.getTime() < startOfCalendarMonth(new Date()).getTime()
        }
        goal={goals.calorieGoal}
        onNext={() => moveCalendarMonth(1)}
        onPrevious={() => moveCalendarMonth(-1)}
        reference={calendarMonth}
        totals={monthCalories}
      />
      <Text style={styles.sectionTitle}>Trends</Text>
      <SegmentedControl
        label="Trend time range"
        options={trendRanges.map((item) => ({ value: item, label: item }))}
        value={range}
        onChange={setRange}
      />
      {loading && samples.length === 0 ? (
        <ActivityIndicator color={colors.blue} />
      ) : (
        <>
          <TrendCard
            title="Weight"
            kind="weight"
            samples={combinedSamples}
            range={range}
            onHorizontalGestureChange={setChartSwipeActive}
          />
          <BloodPressureTrendCard
            onHorizontalGestureChange={setChartSwipeActive}
            samples={combinedSamples}
            range={range}
          />
        </>
      )}
    </ScreenScrollView>
  );
}
function Metric({
  label,
  value,
  detail,
  onPress,
  valueColor,
}: {
  label: string;
  value: string;
  detail?: string;
  onPress?: () => void;
  valueColor?: string;
}) {
  return (
    <Pressable
      accessibilityHint={
        onPress ? "Opens the matching detailed log." : undefined
      }
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[surfaces.card, styles.metric]}
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
          valueColor ? { color: valueColor } : undefined,
        ]}
      >
        {value}
      </Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  date: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  metricHeading: { flexDirection: "row", alignItems: "center", gap: 5 },
  gestureHint: {
    color: colors.secondary,
    fontSize: 12,
    marginTop: -7,
    marginBottom: 16,
  },
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 20 },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1,
    marginTop: 3,
  },
  snapshot: { color: colors.secondary, fontSize: 15, marginTop: 3 },
  summaryHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  copy: { color: colors.secondary, marginBottom: 18, marginTop: -8 },
  metrics: { flexDirection: "row", gap: 12, marginBottom: 12 },
  nutritionMetrics: { flexDirection: "row", gap: 12, marginBottom: 12 },
  waterMetric: { flexDirection: "row", marginBottom: 12 },
  metric: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderCurve: "continuous",
    flex: 1,
    padding: 14,
  },
  metricLabel: {
    color: colors.secondary,
    flex: 1,
    fontSize: 12,
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
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: 12,
    marginBottom: 12,
  },
  syncArea: { alignItems: "flex-end", maxWidth: 100, marginLeft: 10 },
  sync: {
    alignItems: "center",
    backgroundColor: colors.blueSoft,
    borderColor: colors.blueSoft,
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
  },
  syncPressed: { backgroundColor: "#DCEBFF" },
  syncDisabled: { opacity: 0.55 },
  syncText: { color: colors.blue, fontWeight: "700" },
  syncTime: {
    color: colors.tertiary,
    fontSize: 10,
    marginTop: 5,
    textAlign: "right",
  },
});

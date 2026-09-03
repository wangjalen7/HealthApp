import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
  const { session, configured } = useAuth();
  const insets = useSafeAreaInsets();
  const [samples, setSamples] = useState<VitalSample[]>([]);
  const [loading, setLoading] = useState(true);
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
              message: "Sync complete",
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
    async (sync = false) => {
      if (!session) return;
      setLoading(true);
      const cached = await loadCachedVitals(session.user.id);
      setSamples(cached);
      setLastSyncedAt(await loadLastVitalSyncAt(session.user.id));
      if (sync) {
        const result = await synchronize(session.user.id);
        setStatus(result.message);
        if (result.lastSyncedAt) setLastSyncedAt(result.lastSyncedAt);
        setSamples(await loadCachedVitals(session.user.id));
      }
      try {
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
      }
      setLoading(false);
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
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
      directionalLockEnabled
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void load(true)}
        />
      }
      scrollEnabled={!chartSwipeActive}
    >
      <View style={styles.summaryHeader}>
        <View>
          <Text style={styles.title}>Hi {firstName},</Text>
          <Text style={styles.snapshot}>Your daily snapshot</Text>
        </View>
        <View style={styles.syncArea}>
          <Pressable
            accessibilityLabel="Sync now"
            accessibilityRole="button"
            accessibilityState={{ busy: loading, disabled: loading }}
            disabled={loading}
            onPress={() => void load(true)}
            style={({ pressed }) => [
              styles.sync,
              pressed && styles.syncPressed,
              loading && styles.syncDisabled,
            ]}
          >
            <Svg
              accessibilityElementsHidden
              height="16"
              viewBox="0 0 24 24"
              width="16"
            >
              <Path
                d="M20 12a8 8 0 1 1-2.34-5.66M20 3v6h-6"
                fill="none"
                stroke="#16776A"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </Svg>
            <Text style={styles.syncText}>Sync</Text>
          </Pressable>
          <Text style={styles.syncTime}>
            {lastSyncedAt
              ? `Last synced ${formatDateTime(lastSyncedAt)}`
              : "Not synced yet"}
          </Text>
        </View>
      </View>
      {status ? <Text style={styles.copy}>{status}</Text> : null}
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
      <View style={styles.filters}>
        {trendRanges.map((item) => (
          <RangeChip
            key={item}
            label={item}
            active={range === item}
            onPress={() => setRange(item)}
          />
        ))}
      </View>
      {loading && samples.length === 0 ? (
        <ActivityIndicator color="#16776A" />
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
    </ScrollView>
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
      style={styles.metric}
    >
      <Text style={styles.metricLabel}>{label}</Text>
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
function RangeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.rangeChip, active && styles.rangeChipActive]}
    >
      <Text style={active ? styles.rangeTextActive : styles.rangeText}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  title: { color: "#102A43", fontSize: 32, fontWeight: "800", marginTop: 3 },
  snapshot: { color: "#627D98", fontSize: 15, marginTop: 3 },
  summaryHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  copy: { color: "#627D98", marginBottom: 18, marginTop: -8 },
  metrics: { flexDirection: "row", gap: 12, marginBottom: 12 },
  nutritionMetrics: { flexDirection: "row", gap: 12, marginBottom: 12 },
  waterMetric: { flexDirection: "row", marginBottom: 12 },
  metric: {
    backgroundColor: "#E6F7F3",
    borderRadius: 16,
    flex: 1,
    padding: 14,
  },
  metricLabel: { color: "#486581", fontSize: 13 },
  metricValue: {
    color: "#102A43",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  metricDetail: { color: "#627D98", fontSize: 11, marginTop: 5 },
  sectionTitle: {
    color: "#243B53",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
  },
  syncArea: { alignItems: "flex-end" },
  sync: {
    alignItems: "center",
    backgroundColor: "#E6F7F3",
    borderColor: "#B8E4DA",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  syncPressed: { backgroundColor: "#D4F0E9" },
  syncDisabled: { opacity: 0.55 },
  syncText: { color: "#16776A", fontWeight: "700" },
  syncTime: { color: "#7B8794", fontSize: 10, marginTop: 3 },
  filters: { flexDirection: "row", gap: 8, marginBottom: 12 },
  rangeChip: {
    alignItems: "center",
    backgroundColor: "#E6EEF3",
    borderRadius: 18,
    minWidth: 39,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  rangeChipActive: { backgroundColor: "#102A43" },
  rangeText: { color: "#486581", fontSize: 12, fontWeight: "800" },
  rangeTextActive: { color: "#fff", fontSize: 12, fontWeight: "800" },
});

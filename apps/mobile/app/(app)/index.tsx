import { useCallback, useRef, useState } from "react";
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
import type { DailyCalorieTotal } from "../../src/features/nutrition/calendar";
import { CalorieCalendar } from "../../src/features/nutrition/calorie-calendar";
import { getCurrentMonthCalorieTotals } from "../../src/features/nutrition/repository";
import {
  getTodaySummary,
  type TodaySummary,
} from "../../src/features/training/repository";
import { NutritionProgressCard } from "../../src/features/training/nutrition-progress-card";
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
  const [summary, setSummary] = useState<TodaySummary>({
    calories: 0,
    protein: 0,
  });
  const [waterMl, setWaterMl] = useState(0);
  const [monthCalories, setMonthCalories] = useState<
    Record<string, DailyCalorieTotal>
  >({});
  const [goals, setGoals] = useState<DailyGoals>({
    systolicGoal: 120,
    diastolicGoal: 80,
  });
  const syncInFlight = useRef<Promise<UnifiedSyncResult> | undefined>(
    undefined,
  );
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
                : "Sync complete. Apple Health is up to date.",
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
        const [today, savedGoals, todayWater, monthlyCalories] =
          await Promise.all([
            getTodaySummary(session.user.id),
            getDailyGoals(session.user.id),
            getTodayHydrationMl(session.user.id),
            getCurrentMonthCalorieTotals(session.user.id),
          ]);
        setSummary(today);
        setGoals(savedGoals);
        setWaterMl(todayWater);
        setMonthCalories(monthlyCalories);
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Could not load summary.",
        );
      }
      setLoading(false);
    },
    [session, synchronize],
  );
  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );
  const combinedSamples = deduplicateVitalSamples(samples);
  const weight = latestSample(combinedSamples, "weight");
  const systolic = latestSample(combinedSamples, "systolic_bp");
  const diastolic = latestSample(combinedSamples, "diastolic_bp");
  const weightPounds = weight
    ? weight.unit === "kg"
      ? weight.value * 2.20462
      : weight.value
    : undefined;
  const automaticProteinGoal =
    weightPounds === undefined ? undefined : Math.round(weightPounds * 0.7);
  const proteinGoal = goals.proteinGoal ?? automaticProteinGoal;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void load(true)}
        />
      }
    >
      <Text style={styles.eyebrow}>YOUR DAILY SNAPSHOT</Text>
      <Text style={styles.title}>Summary</Text>
      <Text style={styles.copy}>
        {status || "Your measurements stay on this device until they can sync."}
      </Text>
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
              ? `Measured ${formatDateTime(weight.occurredAt)}${goals.weightGoalLb ? ` goal ${goals.weightGoalLb} lb` : ""}`
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
          detail={
            systolic
              ? `Measured ${formatDateTime(systolic.occurredAt)} goal ${goals.systolicGoal ?? 120}/${goals.diastolicGoal ?? 80}`
              : `Goal ${goals.systolicGoal ?? 120}/${goals.diastolicGoal ?? 80}`
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
      <CalorieCalendar goal={goals.calorieGoal} totals={monthCalories} />
      <View style={styles.controls}>
        <Text style={styles.sectionTitle}>Trends</Text>
        <View>
          <Pressable onPress={() => void load(true)} style={styles.sync}>
            <Text style={styles.syncText}>Sync now</Text>
          </Pressable>
          <Text style={styles.syncTime}>
            {lastSyncedAt
              ? `Last synced ${formatDateTime(lastSyncedAt)}`
              : "Not synced yet"}
          </Text>
        </View>
      </View>
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
          />
          <BloodPressureTrendCard samples={combinedSamples} range={range} />
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
}: {
  label: string;
  value: string;
  detail?: string;
  onPress?: () => void;
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
      <Text style={styles.metricValue}>{value}</Text>
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
  eyebrow: {
    color: "#16776A",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 6,
  },
  title: { color: "#102A43", fontSize: 32, fontWeight: "800", marginTop: 3 },
  copy: { color: "#627D98", marginBottom: 18, marginTop: 6 },
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
  controls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { color: "#243B53", fontSize: 20, fontWeight: "800" },
  sync: { alignItems: "flex-end", padding: 5 },
  syncText: { color: "#16776A", fontWeight: "700" },
  syncTime: { color: "#7B8794", fontSize: 10, marginTop: 1 },
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

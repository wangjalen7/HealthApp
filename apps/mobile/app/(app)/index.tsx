import { useCallback, useState } from "react";
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

import {
  latestSample,
  trendRanges,
  type TrendRange,
  type VitalSample,
  type VitalSource,
} from "../../src/domain/vitals";
import { useAuth } from "../../src/features/auth/auth-provider";
import {
  getDailyGoals,
  type DailyGoals,
} from "../../src/features/goals/repository";
import {
  getTodaySummary,
  type TodaySummary,
} from "../../src/features/training/repository";
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
function progress(value: number, goal: number | undefined, unit = ""): string {
  return goal === undefined ? `${value}${unit}` : `${value} / ${goal}${unit}`;
}
export default function SummaryScreen() {
  const router = useRouter();
  const { session, configured } = useAuth();
  const [samples, setSamples] = useState<VitalSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const [sourceFilter, setSourceFilter] = useState<"all" | VitalSource>("all");
  const [range, setRange] = useState<TrendRange>("M");
  const [summary, setSummary] = useState<TodaySummary>({
    calories: 0,
    protein: 0,
    workoutCount: 0,
    cardioMinutes: 0,
  });
  const [goals, setGoals] = useState<DailyGoals>({
    systolicGoal: 120,
    diastolicGoal: 80,
  });
  const load = useCallback(
    async (sync = false) => {
      if (!session) return;
      setLoading(true);
      const cached = await loadCachedVitals(session.user.id);
      setSamples(cached);
      setLastSyncedAt(await loadLastVitalSyncAt(session.user.id));
      if (sync && configured) {
        const result = await syncVitals(session.user.id);
        setStatus(
          result.error ? `Sync waiting: ${result.error}` : "Sync complete",
        );
        if (result.lastSyncedAt) setLastSyncedAt(result.lastSyncedAt);
        setSamples(await loadCachedVitals(session.user.id));
      }
      try {
        const [today, savedGoals] = await Promise.all([
          getTodaySummary(session.user.id),
          getDailyGoals(session.user.id),
        ]);
        setSummary(today);
        setGoals(savedGoals);
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Could not load summary.",
        );
      }
      setLoading(false);
    },
    [configured, session],
  );
  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );
  const weight = latestSample(samples, "weight");
  const systolic = latestSample(samples, "systolic_bp");
  const diastolic = latestSample(samples, "diastolic_bp");
  const weightPounds = weight
    ? weight.unit === "kg"
      ? weight.value * 2.20462
      : weight.value
    : undefined;
  const automaticProteinGoal =
    weightPounds === undefined ? undefined : Math.round(weightPounds * 0.7);
  const proteinGoal = goals.proteinGoal ?? automaticProteinGoal;
  const filteredSamples =
    sourceFilter === "all"
      ? samples
      : samples.filter((sample) => sample.source === sourceFilter);
  return (
    <ScrollView
      contentContainerStyle={styles.page}
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
      <View style={styles.metrics}>
        <Metric
          label="Calories"
          onPress={() => router.push("/(app)/nutrition")}
          value={progress(summary.calories, goals.calorieGoal)}
          detail="Today / daily goal"
        />
        <Metric
          label="Protein"
          onPress={() => router.push("/(app)/nutrition")}
          value={progress(Math.round(summary.protein), proteinGoal, "g")}
          detail={
            goals.proteinGoal !== undefined
              ? "Today / set goal"
              : proteinGoal === undefined
                ? "Log weight to calculate target"
                : "Today / 0.7 g per lb"
          }
        />
      </View>
      <View style={styles.activity}>
        <Text style={styles.activityText}>
          {summary.workoutCount
            ? `${summary.workoutCount} lift session today`
            : "No lift logged today"}
        </Text>
        <Text style={styles.activityText}>
          {summary.cardioMinutes
            ? `${summary.cardioMinutes} cardio min`
            : "No cardio logged"}
        </Text>
      </View>
      <View style={styles.goalsCard}>
        <Text style={styles.goalsTitle}>Your goals</Text>
        <GoalLine
          label="Calories"
          value={
            goals.calorieGoal === undefined
              ? "Not set"
              : `${goals.calorieGoal} cal/day`
          }
        />
        <GoalLine
          label="Weight"
          value={
            goals.weightGoalLb === undefined
              ? "Not set"
              : `${goals.weightGoalLb} lb`
          }
        />
        <GoalLine
          label="Blood pressure"
          value={`${goals.systolicGoal ?? 120}/${goals.diastolicGoal ?? 80} mmHg`}
        />
        <GoalLine
          label="Protein"
          value={
            proteinGoal === undefined
              ? "Log weight to calculate"
              : `${proteinGoal} g/day`
          }
        />
        <Text style={styles.goalsHint}>
          Change goals in Profile. Protein uses 0.7 g per lb of your latest
          weight unless you set a custom protein target.
        </Text>
      </View>
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
      <View style={styles.filters}>
        <SourceChip
          label="All sources"
          active={sourceFilter === "all"}
          onPress={() => setSourceFilter("all")}
        />
        <SourceChip
          label="Manual"
          active={sourceFilter === "manual"}
          onPress={() => setSourceFilter("manual")}
        />
      </View>
      {loading && samples.length === 0 ? (
        <ActivityIndicator color="#16776A" />
      ) : (
        <>
          <TrendCard
            title="Weight"
            kind="weight"
            samples={filteredSamples}
            range={range}
          />
          <BloodPressureTrendCard samples={filteredSamples} range={range} />
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
function GoalLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.goalLine}>
      <Text style={styles.goalLabel}>{label}</Text>
      <Text style={styles.goalValue}>{value}</Text>
    </View>
  );
}
function SourceChip({
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
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={active ? styles.filterTextActive : styles.filterText}>
        {label}
      </Text>
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
  activity: {
    backgroundColor: "#fff",
    borderRadius: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    padding: 13,
  },
  activityText: { color: "#486581", fontSize: 13, fontWeight: "700" },
  goalsCard: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 22,
    padding: 15,
  },
  goalsTitle: {
    color: "#243B53",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 7,
  },
  goalLine: {
    alignItems: "center",
    borderTopColor: "#E6EEF3",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
  },
  goalLabel: { color: "#486581", fontWeight: "700" },
  goalValue: { color: "#102A43", fontWeight: "800" },
  goalsHint: { color: "#627D98", fontSize: 12, lineHeight: 17, marginTop: 4 },
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
  filterChip: {
    backgroundColor: "#E6EEF3",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipActive: { backgroundColor: "#16776A" },
  filterText: { color: "#486581", fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: "#fff", fontSize: 12, fontWeight: "800" },
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

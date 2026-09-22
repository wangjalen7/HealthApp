import { useAccountSetup } from "../../src/features/onboarding/provider";
import { SetupCard } from "../../src/features/onboarding/setup-card";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dashboard } from "../../src/features/summary/dashboard";
import { widgetRegistry } from "../../src/features/summary/widget-renderers";
import {
  loadSummaryData,
  type SummaryData,
} from "../../src/features/summary/data";
import { type Widget } from "../../src/features/summary/layout";
import { dayKey, deviceZone } from "../../src/features/summary/calendar";
import { useFocusEffect } from "expo-router";
import {
  AppState,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../../src/ui/icon";
import { initializeWidgetHabits } from "../../src/features/streaks/initialize";

import type { VitalSample } from "../../src/domain/vitals";
import { useAuth } from "../../src/features/auth/auth-provider";
import {
  getDailyGoals,
  type DailyGoals,
} from "../../src/features/goals/repository";
import { getTodayHydrationTotals } from "../../src/features/hydration/repository";
import { synchronizeHealthData } from "../../src/features/healthkit/unified-sync";
import {
  shiftCalendarMonth,
  startOfCalendarMonth,
  type DailyCalorieTotal,
} from "../../src/features/nutrition/calendar";
import { getCurrentMonthCalorieTotals } from "../../src/features/nutrition/repository";
import {
  getTodaySummary,
  type TodaySummary,
} from "../../src/features/training/repository";
import {
  loadCachedVitals,
} from "../../src/features/vitals/sync";

export default function SummaryScreen() {
  const { session } = useAuth();
  return <SummaryContent key={session?.user.id ?? "signed-out"} />;
}
function SummaryContent() {
  const { width } = useWindowDimensions();
  const { session, configured } = useAuth();
  const insets = useSafeAreaInsets();
  const [samples, setSamples] = useState<VitalSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [baseError, setBaseError] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [extraData, setExtraData] = useState<SummaryData>();
  const [extraLoading, setExtraLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState(false);
  const calendarClock = dayKey(now) + deviceZone();
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const [chartSwipeActive, setChartSwipeActive] = useState(false);
  const [summary, setSummary] = useState<TodaySummary>({
    calories: 0,
    protein: 0,
  });
  const [pendingFluidMl, setPendingFluidMl] = useState(0);
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
  const loadedUserId = useRef<string | undefined>(undefined);
  const calendarMonthRef = useRef(calendarMonth);
  const monthRequestId = useRef(0);
  const monthLoads = useRef(
    new Map<string, Promise<Record<string, DailyCalorieTotal>>>(),
  );
  calendarMonthRef.current = calendarMonth;
  const loadMonthCalories = useCallback(
    async (userId: string, reference: Date) => {
      const requestId = monthRequestId.current + 1;
      monthRequestId.current = requestId;
      const key = userId + ":" + reference.getTime();
      let operation = monthLoads.current.get(key);
      if (!operation) {
        operation = getCurrentMonthCalorieTotals(userId, reference);
        monthLoads.current.set(key, operation);
      }
      try {
        const totals = await operation;
        if (live.current && monthRequestId.current === requestId)
          setMonthCalories(totals);
      } finally {
        if (monthLoads.current.get(key) === operation)
          monthLoads.current.delete(key);
      }
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
  const load = useCallback(
    async (sync = false, isPullRefresh = false) => {
      if (!session) return;
      const isInitialLoad = loadedUserId.current !== session.user.id;
      if (isInitialLoad) setLoading(true);
      if (isPullRefresh) setRefreshing(true);
      try {
        const cached = await loadCachedVitals(session.user.id);
        setSamples(cached);
        if (sync) {
          await synchronizeHealthData(session.user.id, configured);
          setSamples(await loadCachedVitals(session.user.id));
        }
        const [today, savedGoals, todayWater] = await Promise.all([
          getTodaySummary(session.user.id),
          getDailyGoals(session.user.id),
          getTodayHydrationTotals(session.user.id),
          loadMonthCalories(session.user.id, calendarMonthRef.current),
        ]);
        setBaseError(false);
        setSummary(today);
        setGoals(savedGoals);
        setWaterMl(todayWater.countedMl);
        setPendingFluidMl(todayWater.pendingMl);
      } catch (error) {
        setBaseError(true);
        setStatus(
          error instanceof Error ? error.message : "Could not load summary.",
        );
      } finally {
        if (live.current) setRevision((value) => value + 1);
        loadedUserId.current = session.user.id;
        if (isInitialLoad) setLoading(false);
        if (isPullRefresh) setRefreshing(false);
      }
    },
    [loadMonthCalories, session, configured],
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
  const previousClock = useRef(calendarClock);
  useEffect(() => {
    if (previousClock.current !== calendarClock) {
      previousClock.current = calendarClock;
      void load(false);
    }
  }, [calendarClock, load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setNow(new Date());
        void load(true);
      }
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [load]);
  useEffect(() => {
    if (!session || !widgets.length) return;
    let current = true;
    setExtraLoading(true);
    void loadSummaryData(session.user.id, widgets, new Date(), samples, !editing)
      .then((data) => {
        if (current) setExtraData(data);
      })
      .catch((error) => {
        if (current)
          setStatus(
            error instanceof Error
              ? error.message
              : "Could not refresh dashboard.",
          );
      })
      .finally(() => {
        if (current) setExtraLoading(false);
      });
    return () => {
      current = false;
    };
    // Samples are refreshed as part of revision; do not reload once per setter.
  }, [session?.user.id, widgets, revision, calendarClock, editing]);
  const { setup: accountSetup } = useAccountSetup();
  const rawFirstName = session?.user.user_metadata?.first_name;
  const rawDisplayName = session?.user.user_metadata?.display_name;
  const firstName =
    accountSetup?.preferred_name ||
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
          title={refreshing ? "Refreshing..." : "Pull to refresh"}
          titleColor={colors.secondary}
          onRefresh={() => void load(false, true)}
        />
      }
      scrollEnabled={!chartSwipeActive && !editing}
    >
      <Text style={styles.date}>
        {new Intl.DateTimeFormat(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(new Date())}
      </Text>
      <SetupCard
        needed={
          !accountSetup?.preferred_name ||
          goals.calorieGoal === undefined ||
          goals.waterGoalMl === undefined
        }
      />
      {status ? <Text style={styles.copy}>{status}</Text> : null}
      {session ? (
        <Dashboard
          header={(begin, ready) => (<>
      <View style={styles.summaryHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            style={[styles.title, width < 360 && { fontSize: 28 }]}
          >
            Hi {firstName},
          </Text>
          <Text style={styles.snapshot}>Your daily snapshot</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit Summary" disabled={!ready} onPress={begin} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderRadius: 24 }}><Icon name="edit" color={colors.blue} size={23} /></Pressable>
      </View>
          </>)}
          reminders={extraData?.reminders.filter((r) => r.enabled && r.repeat !== "once").map((r) => ({ id: r.id, label: r.name || r.kind.replaceAll("_", " ") }))}
          onCommit={async (layout) => { await initializeWidgetHabits(session.user.id, layout.widgets); setRevision((v) => v + 1); }}
          user={session.user.id}
          onLayoutChange={setWidgets}
          onEditingChange={(value) => {
            setEditing(value);
            setChartSwipeActive(false);
          }}
          render={(widget) =>
            widgetRegistry[widget.type].render(widget, {
              samples,
              goals,
              summary,
              waterMl,
              pendingFluidMl,
              calendarMonth,
              monthCalories,
              moveCalendarMonth,
              loading,
              setChartSwipeActive,
              baseError,
              retry: () => void load(false),
              extraData,
              extraLoading,
              now,
              user: session.user.id,
              reloadExtras: () => setRevision((v) => v + 1),
            })
          }
        />
      ) : null}
    </ScreenScrollView>
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
  syncPressed: { backgroundColor: colors.blueSoft },
  syncDisabled: { opacity: 0.55 },
  syncText: { color: colors.blue, fontWeight: "700" },
  syncTime: {
    color: colors.tertiary,
    fontSize: 10,
    marginTop: 5,
    textAlign: "right",
  },
});

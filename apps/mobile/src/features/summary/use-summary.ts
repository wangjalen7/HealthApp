import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useResource } from "../../lib/use-resource";
import { subscribeDataChanges } from "../../lib/data-changes";
import { useAuth } from "../auth/auth-provider";
import { getDailyGoals } from "../goals/repository";
import { getTodayHydrationTotals } from "../hydration/repository";
import { getTodaySummary } from "../training/repository";
import { getCurrentMonthCalorieTotals } from "../nutrition/repository";
import {
  startOfCalendarMonth,
  shiftCalendarMonth,
} from "../nutrition/calendar";
import { loadCachedVitals } from "../vitals/sync";
import { synchronizeHealthData } from "../healthkit/unified-sync";
import { loadSummaryData } from "./data";
import { dayKey, deviceZone } from "./calendar";
import type { Widget, WidgetType } from "./layout";

export function useSummary(widgets: Widget[], editing: boolean) {
  const { session, configured } = useAuth();
  const user = session?.user.id ?? "";
  const [now, setNow] = useState(() => new Date());
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfCalendarMonth(new Date()),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [syncIssue, setSyncIssue] = useState("");
  const [initialVitalsSettled, setInitialVitalsSettled] = useState(!configured);
  const day = dayKey(now),
    zone = deviceZone(),
    scope = `${user}:${day}:${zone}`;
  const vitals = useResource(user, () => loadCachedVitals(user), !!user);
  const goals = useResource(scope, () => getDailyGoals(user), !!user);
  const nutrition = useResource(
    scope,
    () => getTodaySummary(user, now),
    !!user,
  );
  const fluids = useResource(
    scope,
    () => getTodayHydrationTotals(user, now),
    !!user,
  );
  const calendar = useResource(
    `${scope}:${calendarMonth.getTime()}`,
    () => getCurrentMonthCalorieTotals(user, calendarMonth),
    !!user,
  );
  const extra = (type: WidgetType) => {
    const selected = widgets.filter((w) => w.type === type);
    return {
      key: `${scope}:${type}:${JSON.stringify(selected)}:${editing}`,
      enabled: !!user && !!selected.length,
      read: async () => {
        const data = await loadSummaryData(
          user,
          selected,
          now,
          type === "streaks" ? await loadCachedVitals(user) : [],
          !editing,
        );
        if (data.errors.length) throw new Error(data.errors.join(" "));
        return data;
      },
    };
  };
  const mealRead = extra("meals"),
    trainingRead = extra("training"),
    streakRead = extra("streaks"),
    actionRead = extra("actions");
  const meals = useResource(mealRead.key, mealRead.read, mealRead.enabled);
  const training = useResource(
    trainingRead.key,
    trainingRead.read,
    trainingRead.enabled,
  );
  const streaks = useResource(
    streakRead.key,
    streakRead.read,
    streakRead.enabled,
  );
  const actions = useResource(
    actionRead.key,
    actionRead.read,
    actionRead.enabled,
  );
  const current = useRef({
    vitals,
    goals,
    nutrition,
    fluids,
    calendar,
    meals,
    training,
    streaks,
    actions,
  });
  current.current = {
    vitals,
    goals,
    nutrition,
    fluids,
    calendar,
    meals,
    training,
    streaks,
    actions,
  };
  const mounted = useRef(true);
  const focused = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const syncOperation = useRef<Promise<void> | undefined>(undefined);
  const sync = useCallback(() => {
    if (!user) return Promise.resolve();
    if (syncOperation.current) return syncOperation.current;
    const work = synchronizeHealthData(user, configured)
      .then(async (result) => {
        if (!mounted.current) return;
        setSyncIssue(
          result.message.startsWith("Sync complete")
            ? ""
            : "Readings could not fully update. Saved data is shown.",
        );
        // Local/imported weight can change automatic protein goals and streak evidence.
        await Promise.all([
          current.current.vitals.refresh(true).then(() => {
            if (mounted.current) setInitialVitalsSettled(true);
          }),
          current.current.goals.refresh(true),
          current.current.streaks.refresh(true),
        ]);
      })
      .catch(() => {
        if (mounted.current) {
          setSyncIssue("Readings could not fully update. Saved data is shown.");
          setInitialVitalsSettled(true);
        }
      })
      .finally(() => {
        syncOperation.current = undefined;
      });
    syncOperation.current = work;
    return work;
  }, [configured, user]);
  const refresh = useCallback(async (pull = false, invalidate = false) => {
    if (pull) setRefreshing(true);
    try {
      await Promise.all(
        Object.values(current.current).map((resource) =>
          resource.refresh(invalidate),
        ),
      );
    } finally {
      if (pull && mounted.current) setRefreshing(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setNow(new Date());
      void refresh();
      void sync();
      return () => {
        focused.current = false;
      };
    }, [refresh, sync]),
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (focused.current) setNow(new Date());
    }, 30000);
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused.current) {
        setNow(new Date());
        void refresh();
        void sync();
      }
    });
    return () => {
      clearInterval(timer);
      foreground.remove();
    };
  }, [refresh, sync]);
  useEffect(
    () =>
      subscribeDataChanges((owner, table) => {
        if (owner !== user) return;
        const r = current.current;
        if (table === "nutrition_entries" || table === "food_profiles") {
          void r.nutrition.refresh(true);
          void r.calendar.refresh(true);
          void r.meals.refresh(true);
        }
        if (table === "hydration_entries") void r.fluids.refresh(true);
        if (table === "workout_sessions" || table === "cardio_entries")
          void r.training.refresh(true);
        if (table === "profiles") void r.goals.refresh(true);
        // Vital cache updates commit after their server reply; sync completion reads the cache.
        if (table !== "vital_samples") void r.streaks.refresh(true);
      }),
    [user],
  );
  const previousToday = useRef(startOfCalendarMonth(now).getTime());
  useEffect(() => {
    const month = startOfCalendarMonth(now).getTime();
    if (previousToday.current !== month) {
      const previous = previousToday.current;
      setCalendarMonth((selected) =>
        selected.getTime() === previous ? new Date(month) : selected,
      );
      previousToday.current = month;
    }
  }, [now]);
  const moveCalendarMonth = (offset: -1 | 1) =>
    setCalendarMonth((previous) => {
      const next = shiftCalendarMonth(previous, offset);
      return next > startOfCalendarMonth(new Date()) ? previous : next;
    });
  const noCachedReadings = !vitals.data?.length;
  const pendingVitals = noCachedReadings && !initialVitalsSettled;
  const unavailableVitals =
    noCachedReadings && initialVitalsSettled && configured && !!syncIssue;
  const visibleVitals = {
    ...vitals,
    data: pendingVitals || unavailableVitals ? undefined : vitals.data,
    loading: pendingVitals || vitals.loading,
    error: unavailableVitals ? syncIssue : vitals.error,
    refresh: (invalidate = false) => {
      if (unavailableVitals) void sync();
      return vitals.refresh(invalidate);
    },
  };
  return {
    ...current.current,
    vitals: visibleVitals,
    now,
    calendarMonth,
    moveCalendarMonth,
    refreshing,
    syncIssue,
    refresh,
    sync,
  };
}

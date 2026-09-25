import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useResource } from "../../lib/use-resource";
import { subscribeDataChanges } from "../../lib/data-changes";
import { getWorkoutHistory, getCardioHistory } from "./repository";
import { getFoodHistory } from "../nutrition/repository";
import { getHydrationHistory } from "../hydration/repository";
import { loadCachedVitals, syncVitals } from "../vitals/sync";

function useList<T>(user: string, read: () => Promise<T[]>) {
  const resource = useResource(user, read, !!user);
  const empty = useRef<T[]>([]).current;
  const set = (value: SetStateAction<T[]>) =>
    resource.setData((previous) =>
      typeof value === "function" ? value(previous ?? []) : value,
    );
  return { ...resource, items: resource.data ?? empty, set };
}
export function useHistoryData(user: string, configured: boolean) {
  const workouts = useList(user, () => getWorkoutHistory(user));
  const cardio = useList(user, () => getCardioHistory(user));
  const food = useList(user, () => getFoodHistory(user));
  const fluids = useList(user, () => getHydrationHistory(user));
  const vitals = useList(user, () => loadCachedVitals(user));
  const current = useRef({ workouts, cardio, food, fluids, vitals });
  current.current = { workouts, cardio, food, fluids, vitals };
  const [refreshing, setRefreshing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [initialVitalsSettled, setInitialVitalsSettled] = useState(!configured);
  const live = useRef(true),
    sync = useRef<Promise<void> | undefined>(undefined);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const load = useCallback(
    async (pull = false) => {
      if (pull) setRefreshing(true);
      const reads = Promise.all(
        Object.values(current.current).map((r) => r.refresh(pull)),
      );
      if (configured && user && !sync.current) {
        sync.current = syncVitals(user)
          .then(async (result) => {
            if (!live.current) return;
            setSyncError(
              result.error
                ? "Readings could not fully update. Saved readings are shown."
                : "",
            );
            await current.current.vitals.refresh(true);
            if (live.current) setInitialVitalsSettled(true);
          })
          .catch(() => {
            if (live.current) {
              setSyncError(
                "Readings could not fully update. Saved readings are shown.",
              );
              setInitialVitalsSettled(true);
            }
          })
          .finally(() => {
            sync.current = undefined;
          });
      }
      await reads;
      if (live.current && pull) setRefreshing(false);
    },
    [configured, user],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
      });
      return () => listener.remove();
    }, [load]),
  );
  useEffect(
    () =>
      subscribeDataChanges((owner, table) => {
        if (owner !== user || table === "vital_samples") return;
        const r = current.current;
        if (table === "workout_sessions") void r.workouts.refresh(true);
        if (table === "cardio_entries") void r.cardio.refresh(true);
        if (table === "nutrition_entries") void r.food.refresh(true);
        if (table === "hydration_entries") void r.fluids.refresh(true);
      }),
    [user],
  );
  const pendingVitals = !vitals.items.length && !initialVitalsSettled;
  const unavailableVitals =
    !vitals.items.length && initialVitalsSettled && !!syncError;
  return {
    ...current.current,
    vitals: {
      ...vitals,
      data: pendingVitals || unavailableVitals ? undefined : vitals.data,
      loading: pendingVitals || vitals.loading,
      error: unavailableVitals ? syncError : vitals.error,
    },
    refreshing,
    syncError,
    load,
  };
}

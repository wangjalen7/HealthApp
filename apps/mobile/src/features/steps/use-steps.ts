import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { dayKey, deviceZone } from "../summary/calendar";
import { readStepCache, refreshSteps } from "./storage";
import { connectHealthKit } from "../healthkit/sync";
import { stepAvailability } from "./reader";
import { stepPeriod, type StepRange, type StepCache } from "./model";

export function useSteps(
  user: string,
  range: StepRange = "D",
  selected?: string,
  enabled = true,
  includeHours = true,
) {
  const [clock, setClock] = useState(() => new Date());
  const day = selected ?? dayKey(clock),
    zone = deviceZone();
  const scope = `${user}:${zone}`;
  const [state, setState] = useState<{
    scope: string;
    data?: StepCache;
    error?: string;
    unavailable?: string;
  }>({ scope });
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const live = useRef(true);
  const focused = useRef(false);
  const connectingRef = useRef(false);
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      generation.current++;
    };
  }, []);
  const refresh = useCallback(
    async (force = false) => {
      if (!user || !enabled) return;
      const id = ++generation.current;
      const valid = () => live.current && id === generation.current;
      setLoading(true);
      const period = stepPeriod(range, day);
      try {
        const cached = await readStepCache(user, zone);
        if (!valid()) return;
        setState({ scope, data: cached });
        const availability = await stepAvailability();
        if (!valid()) return;
        if (!availability.available) {
          setState({ scope, data: cached, unavailable: availability.reason });
          return;
        }
        const data = await refreshSteps(
          user,
          period.start,
          period.end,
          range === "D" && includeHours,
          force,
          zone,
        );
        if (valid()) setState({ scope, data });
      } catch {
        if (valid())
          setState((s) => ({
            ...(s.scope === scope ? s : { scope }),
            error:
              "Could not refresh Apple Health steps. Saved data is shown where available. Unlock your iPhone and pull to refresh.",
          }));
      } finally {
        if (valid()) setLoading(false);
      }
    },
    [user, enabled, range, day, zone, scope, includeHours],
  );
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void refresh();
      return () => {
        focused.current = false;
      };
    }, [refresh]),
  );
  useEffect(() => {
    const foreground = AppState.addEventListener("change", (s) => {
      if (s === "active" && focused.current) {
        setClock(new Date());
        void refresh();
      }
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && focused.current) {
        setClock(new Date());
        void refresh();
      }
    }, 60000);
    return () => {
      foreground.remove();
      clearInterval(timer);
    };
  }, [refresh]);
  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(true);
    try {
      await connectHealthKit(user);
      await refresh(true);
    } catch (e) {
      if (live.current)
        setState((s) => ({
          ...s,
          error:
            e instanceof Error
              ? e.message
              : "Could not open Apple Health access. Try again.",
        }));
    } finally {
      connectingRef.current = false;
      if (live.current) setConnecting(false);
    }
  }, [user, refresh]);
  return {
    ...(state.scope === scope ? state : { scope }),
    loading,
    refresh,
    connect,
    connecting,
    now: clock,
  };
}

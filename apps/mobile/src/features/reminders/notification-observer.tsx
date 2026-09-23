import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { router, usePathname, useRootNavigationState } from "expo-router";
import { AppState } from "react-native";
import { useAuth } from "../auth/auth-provider";
import { useAccountSetup } from "../onboarding/provider";
import { useAccountDeletion } from "../auth/account-deletion";
import { observeNotificationTaps, clearStartupResponse } from "./device";
import {
  observeIntent,
  loadIntent,
  saveTap,
  consumeIntent,
  restoreDeferredIntent,
} from "./intent-storage";
import {
  intentDecision,
  intentDestination,
  type IntentState,
  type NotificationTap,
} from "./navigation-model";
import { activateReminderAccount, refreshReminderSchedules } from "./service";
import { listReminders } from "./repository";
import { useEntry } from "../auth/entry-provider";
import { entryCanResolve } from "../auth/entry-state";

async function capture(tap: NotificationTap) {
  const data = tap.data as Record<string, unknown> | null;
  // Old notifications have no account identifier. Resolve only against a unique
  // account-owned reminder; never trust their URL as a route.
  if (
    data?.v === undefined &&
    data?.url === "/(app)/reminders" &&
    typeof data.reminderId === "string"
  ) {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) =>
      k.startsWith("healthapp:reminders:"),
    );
    const owners: string[] = [];
    for (const key of keys) {
      const user = key.slice("healthapp:reminders:".length);
      if (
        (await listReminders(user, true)).some(
          (r) => r.id === data.reminderId && r.userId === user,
        )
      )
        owners.push(user);
    }
    if (owners.length !== 1) return;
    tap = {
      ...tap,
      data: {
        v: 2,
        source: "custom",
        userId: owners[0],
        reminderId: data.reminderId,
      },
    };
  }
  await saveTap(tap);
}
export function ReminderNotificationObserver() {
  const entry = useEntry();
  const { session, loading, sessionReady, biometricLocked } = useAuth();
  const { setup } = useAccountSetup();
  const deletion = useAccountDeletion();
  const nav = useRootNavigationState(),
    path = usePathname();
  const [intent, setIntent] = useState<IntentState>({ seen: [] });
  const [startupReady, setStartupReady] = useState(false);
  const [routePass, setRoutePass] = useState(0);
  const resolvedAttempt = useRef(0);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const authNow = useRef({
    user: session?.user.id,
    locked: biometricLocked,
    foreground,
  });
  authNow.current = {
    user: session?.user.id,
    locked: biometricLocked,
    foreground,
  };
  const routing = useRef(false),
    loginKey = useRef("");
  useEffect(() => {
    let live = true;
    let readVersion = 0;
    const read = () => {
      const version = ++readVersion;
      void loadIntent()
        .then((s) => {
          if (live && version === readVersion) setIntent(s);
        })
        .catch(() => undefined);
    };
    const stop = observeIntent(read);
    const startupCaptures: Promise<void>[] = [];
    let subscribing = true;
    let captures = Promise.resolve();
    const stopTaps = observeNotificationTaps((tap) => {
      const operation = captures
        .then(() => capture(tap))
        .catch(() => undefined);
      captures = operation;
      if (subscribing) startupCaptures.push(operation);
      void operation.then(read);
    });
    subscribing = false;
    // The native adapter delivers its last response synchronously on subscribe.
    void Promise.all(startupCaptures)
      .then(async () => {
        const version = ++readVersion;
        const state = await loadIntent();
        if (live) {
          if (version === readVersion) setIntent(state);
          setStartupReady(true);
        }
      })
      .catch(() => {
        if (live) setStartupReady(true);
      });
    return () => {
      live = false;
      stop();
      stopTaps();
    };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (s) => {
      setForeground(s === "active");
      if (s === "active") void loadIntent().then(setIntent);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!intent.pending) return;
    const wait = Math.max(0, intent.pending.expiresAt - Date.now());
    const key = intent.pending.key;
    const timer = setTimeout(() => {
      void consumeIntent(key)
        .then((consumed) => {
          if (consumed) clearStartupResponse();
        })
        .catch(() => undefined);
    }, wait);
    return () => clearTimeout(timer);
  }, [intent.pending?.key, intent.pending?.expiresAt]);
  useEffect(() => {
    if (!session?.user.id || loading || deletion.pending) return;
    void activateReminderAccount(session.user.id).catch(() => undefined);
    const subscription = AppState.addEventListener("change", (s) => {
      if (s === "active")
        void refreshReminderSchedules(session.user.id).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [session?.user.id, loading, deletion.pending]);
  useEffect(() => {
    if (
      !startupReady ||
      !nav?.key ||
      !foreground ||
      deletion.pending ||
      routing.current
    )
      return;
    const attempt = entry.attempt;
    const entering = entryCanResolve(
      attempt,
      {
        userId: session?.user.id,
        loading: loading || !sessionReady,
        locked: biometricLocked,
      },
      Boolean(setup),
    );
    if (attempt && !entering) return;
    if (entering && !setup?.completed_at) {
      if (
        resolvedAttempt.current !== attempt!.id ||
        attempt!.phase === "resolving"
      ) {
        resolvedAttempt.current = attempt!.id;
        entry.resolve(attempt!.id, "/onboarding");
      }
      return;
    }
    if (!intent.pending) {
      if (
        entering &&
        (resolvedAttempt.current !== attempt!.id ||
          attempt!.phase === "resolving")
      ) {
        resolvedAttempt.current = attempt!.id;
        entry.resolve(
          attempt!.id,
          attempt!.kind === "unlock" ? undefined : attempt!.fallback,
        );
      }
      return;
    }
    const authPage = [
      "/sign-in",
      "/sign-up",
      "/forgot-password",
      "/reset-password",
      "/check-email",
      "/onboarding",
      "/welcome",
    ].includes(path);
    const decision = intentDecision(
      intent,
      {
        userId: session?.user.id,
        loading,
        locked: biometricLocked,
        ready: Boolean(setup?.completed_at) && (entering || !authPage),
      },
      Date.now(),
    );
    if (decision === "clear") {
      void consumeIntent(intent.pending.key)
        .then((consumed) => {
          if (consumed) clearStartupResponse();
        })
        .catch(() => undefined);
      return;
    }
    if (!session && !loading && loginKey.current !== intent.pending.key) {
      loginKey.current = intent.pending.key;
      router.replace("/(auth)/sign-in");
      return;
    }
    if (decision !== "navigate") return;
    const current = intent.pending;
    routing.current = true;
    void consumeIntent(current.key)
      .then((consumed) => {
        if (
          consumed &&
          authNow.current.user === current.payload.userId &&
          !authNow.current.locked &&
          authNow.current.foreground
        ) {
          clearStartupResponse();
          if (attempt) {
            resolvedAttempt.current = attempt.id;
            entry.resolve(attempt.id, intentDestination(current.payload));
          } else router.replace(intentDestination(current.payload));
        } else if (
          consumed &&
          authNow.current.user === current.payload.userId
        ) {
          void restoreDeferredIntent(current);
        }
      })
      .catch(() => {
        if (attempt) entry.routingError(attempt.id);
      })
      .finally(() => {
        routing.current = false;
        setRoutePass((v) => v + 1);
      });
  }, [
    intent,
    nav?.key,
    foreground,
    deletion.pending,
    path,
    session?.user.id,
    loading,
    sessionReady,
    biometricLocked,
    setup?.completed_at,
    setup,
    entry,
    startupReady,
    routePass,
  ]);
  return null;
}

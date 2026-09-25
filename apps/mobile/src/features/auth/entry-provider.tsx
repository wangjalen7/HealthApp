import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  AppState,
  Platform,
  Keyboard,
  useWindowDimensions,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, usePathname, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "./auth-provider";
import { useAccountSetup } from "../onboarding/provider";
import { useReducedMotion } from "../../ui/motion";
import { useAppAppearance } from "../../ui/appearance";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { SustainBrand, sustainPalette } from "./sustain-brand";
import {
  completeAttempt,
  entryRoutePath,
  type EntryAttempt,
  type EntryKind,
} from "./entry-state";

type EntryContextValue = {
  attempt?: EntryAttempt;
  begin: (kind: EntryKind, fallback?: string) => number;
  complete: (id: number, userId: string) => void;
  cancel: (id: number) => void;
  resolve: (id: number, destination?: Href) => void;
  routingError: (id: number) => void;
};
const Context = createContext<EntryContextValue | undefined>(undefined);

export function EntryProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const auth = useAuth();
  const setup = useAccountSetup();
  const reduced = useReducedMotion();
  const { resolvedScheme } = useAppAppearance();
  const path = usePathname();
  const [attempt, setAttempt] = useState<EntryAttempt>();
  const current = useRef(attempt);
  current.current = attempt;
  const sequence = useRef(0);
  const target = useRef<string | undefined>(undefined);
  const [routeRevision, setRouteRevision] = useState(0);
  const alpha = useRef(new Animated.Value(1)).current;
  const hapticAttempt = useRef(0);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [slow, setSlow] = useState(false);
  const [successId, setSuccessId] = useState(0);
  const publish = useCallback((value: EntryAttempt | undefined) => {
    current.current = value;
    setAttempt(value);
  }, []);
  const begin = useCallback(
    (kind: EntryKind, fallback = "/(app)") => {
      const id = ++sequence.current;
      Keyboard.dismiss();
      alpha.stopAnimation();
      alpha.setValue(1);
      target.current = undefined;
      publish({ id, kind, fallback, phase: "authenticating" });
      return id;
    },
    [alpha, publish],
  );
  const complete = useCallback(
    (id: number, userId: string) =>
      publish(completeAttempt(current.current, id, userId)),
    [publish],
  );
  const cancel = useCallback(
    (id: number) => {
      if (current.current?.id === id) publish(undefined);
    },
    [publish],
  );
  const resolve = useCallback(
    (id: number, destination?: Href) => {
      const active = current.current;
      if (
        !active ||
        active.id !== id ||
        !["resolving", "entering"].includes(active.phase)
      )
        return;
      const nextPath = destination
        ? entryRoutePath(
            typeof destination === "string"
              ? destination
              : destination.pathname,
          )
        : path;
      target.current = nextPath;
      if (destination) router.replace(destination);
      publish({ ...active, phase: "entering" });
      setRouteRevision((v) => v + 1);
    },
    [path, publish],
  );
  const routingError = useCallback(
    (id: number) => {
      if (current.current?.id === id)
        publish({ ...current.current, phase: "error" });
    },
    [publish],
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => sub.remove();
  }, []);
  const covered = Boolean(
    attempt &&
    (attempt.phase !== "authenticating" ||
      attempt.kind === "manual" ||
      attempt.kind === "biometric"),
  );
  useEffect(() => {
    if (!attempt || attempt.phase === "authenticating") return;
    if (
      !auth.session ||
      auth.session.user.id !== attempt.userId ||
      auth.biometricLocked
    ) {
      alpha.stopAnimation();
      alpha.setValue(1);
      publish(undefined);
    }
  }, [alpha, attempt, auth.biometricLocked, auth.session, publish]);
  const ready =
    attempt?.phase === "entering" &&
    target.current === path &&
    foreground &&
    auth.sessionReady &&
    Boolean(setup.setup) &&
    !setup.error &&
    !auth.biometricLocked &&
    auth.session?.user.id === attempt.userId;
  useEffect(() => {
    setSlow(false);
    if (
      !covered ||
      ready ||
      attempt?.phase === "error" ||
      attempt?.phase === "authenticating"
    )
      return;
    const timer = setTimeout(() => {
      setSlow(true);
      if (attempt) routingError(attempt.id);
    }, 12000);
    return () => clearTimeout(timer);
  }, [attempt?.id, attempt?.phase, covered, ready, routingError]);
  useEffect(() => {
    if (!ready || !attempt) {
      alpha.setValue(1);
      return;
    }
    const id = attempt.id;
    setSuccessId(id);
    const returning = attempt.kind === "unlock" || attempt.kind === "restore";
    if (
      attempt.kind !== "restore" &&
      !reduced &&
      hapticAttempt.current !== id &&
      Platform.OS === "ios"
    ) {
      hapticAttempt.current = id;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
        () => undefined,
      );
    }
    const animation = Animated.sequence([
      Animated.delay(
        reduced || attempt.kind === "restore" ? 0 : returning ? 180 : 320,
      ),
      Animated.timing(alpha, {
        toValue: 0,
        duration: reduced ? 0 : returning ? 140 : 200,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished && current.current?.id === id) publish(undefined);
    });
    // Never strand a ready route if an animation callback is interrupted or the clock is frozen.
    const fallback = setTimeout(
      () => {
        if (current.current?.id === id) publish(undefined);
      },
      reduced ? 0 : attempt.kind === "restore" ? 220 : returning ? 400 : 600,
    );
    return () => {
      clearTimeout(fallback);
      animation.stop();
    };
  }, [
    alpha,
    attempt?.id,
    attempt?.kind,
    publish,
    ready,
    reduced,
    routeRevision,
  ]);
  const value = useMemo(
    () => ({ attempt, begin, complete, cancel, resolve, routingError }),
    [attempt, begin, complete, cancel, resolve, routingError],
  );
  const failed =
    attempt?.phase !== "authenticating" &&
    (attempt?.phase === "error" ||
      Boolean(setup.error || auth.sessionSecurityError) ||
      slow);
  return (
    <Context.Provider value={value}>
      <View style={{ flex: 1 }}>
        <View
          style={{ flex: 1 }}
          pointerEvents={covered ? "none" : "auto"}
          accessibilityElementsHidden={covered}
          importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
          {...(Platform.OS === "web"
            ? { inert: covered, "aria-hidden": covered }
            : {})}
        >
          {children}
        </View>
        {covered ? (
          <Animated.View
            testID="sustain-entry-cover"
            accessibilityViewIsModal
            style={[
              styles.cover,
              {
                backgroundColor: sustainPalette[resolvedScheme],
                opacity: alpha,
              },
              {
                paddingTop: insets.top + 24,
                paddingBottom: insets.bottom + 24,
              },
            ]}
          >
            <SustainBrand
              size={
                attempt?.kind === "unlock"
                  ? 112
                  : Math.min(144, width * 0.36, height * 0.2)
              }
              motion={
                successId === attempt?.id && attempt?.kind !== "restore"
                  ? "success"
                  : failed
                    ? "idle"
                    : "pending"
              }
              compactSuccess={attempt?.kind === "unlock"}
            />
            <Text accessibilityLiveRegion="polite" style={styles.message}>
              {failed
                ? auth.sessionSecurityError ||
                  setup.error ||
                  "We couldn't finish opening your account. Try again."
                : attempt?.phase === "authenticating"
                  ? attempt.kind === "biometric"
                    ? "Signing in…"
                    : "Signing in…"
                  : ready
                    ? "Ready for your day."
                    : "Opening your account…"}
            </Text>
            {failed ? (
              <View style={{ gap: 12 }}>
                <Pressable
                  onPress={() => {
                    if (!attempt) return;
                    setSlow(false);
                    publish({ ...attempt, phase: "resolving" });
                    if (!auth.sessionReady) void auth.retrySessionSecurity();
                    void setup.reload();
                  }}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>Try again</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void auth.signOut().catch(() => routingError(attempt!.id));
                  }}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>Sign out</Text>
                </Pressable>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </Context.Provider>
  );
}
export function useEntry() {
  const value = useContext(Context);
  if (!value) throw Error("EntryProvider required");
  return value;
}
export function SustainLoading() {
  const { resolvedScheme } = useAppAppearance();
  return (
    <View
      style={[
        styles.cover,
        { backgroundColor: sustainPalette[resolvedScheme] },
      ]}
    >
      <SustainBrand
        size={(112 * 401) / 475}
        wordmarkVisible={false}
        enhanceDark={false}
      />
    </View>
  );
}
/** Resolve setup completion and restored sessions without an intermediate Summary. */
export function ContinueEntry() {
  const { session, loading, biometricLocked } = useAuth();
  const { attempt, begin, complete } = useEntry();
  useEffect(() => {
    if (!session || loading || biometricLocked || attempt) return;
    const id = begin("restore");
    complete(id, session.user.id);
  }, [attempt, begin, complete, session, loading, biometricLocked]);
  return <SustainLoading />;
}
const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 100,
  },
  message: {
    color: colors.secondary,
    fontSize: 15,
    textAlign: "center",
    marginTop: 28,
    maxWidth: 330,
    lineHeight: 22,
  },
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: 20 },
  actionText: {
    color: colors.text,
    fontSize: 16,
    textAlign: "center",
    fontWeight: "600",
  },
});

import { prepareReminderSignOut } from "../reminders/lifecycle";
import type { Session } from "@supabase/supabase-js";
import { finishWelcomeIntro } from "./welcome-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Linking } from "react-native";

import { supabaseConfig } from "../../lib/config";
import {
  removeLegacyPersistedSupabaseSession,
  supabase,
} from "../../lib/supabase";
import { authCallbackFromUrl } from "./auth-callback";
import {
  authenticateWithFaceId,
  enrollFaceIdLoginCredential,
  getFaceIdAvailability,
  isFaceIdEnabled,
  revokeFaceIdLoginCredential,
  type FaceIdAuthenticationResult,
  type FaceIdAvailability,
} from "./biometric-auth";

type PasswordRecoveryState = {
  error?: string;
  status: "idle" | "loading" | "ready" | "error";
};

type AuthState = {
  session: Session | null;
  loading: boolean;
  sessionReady: boolean;
  sessionSecurityError: string;
  retrySessionSecurity: () => Promise<void>;
  configured: boolean;
  biometricLocked: boolean;
  faceIdAvailability: FaceIdAvailability;
  faceIdEnabled: boolean;
  passwordRecovery: PasswordRecoveryState;
  clearPasswordRecovery: () => void;
  refreshFaceIdAvailability: () => Promise<FaceIdAvailability>;
  setFaceIdEnabled: (
    enabled: boolean,
    password?: string,
    otp?: string,
  ) => Promise<FaceIdAuthenticationResult>;
  signOut: () => Promise<void>;
  unlockWithFaceId: () => Promise<FaceIdAuthenticationResult>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionSecurityError, setSessionSecurityError] = useState("");
  const [biometricLocked, setBiometricLocked] = useState(false);
  const [faceIdAvailability, setFaceIdAvailability] =
    useState<FaceIdAvailability>({ available: false });
  const [faceIdEnabled, setFaceIdEnabledState] = useState(false);
  const [passwordRecovery, setPasswordRecovery] =
    useState<PasswordRecoveryState>({ status: "idle" });
  const sessionRef = useRef<Session | null>(null);
  const faceIdEnabledRef = useRef(false);
  const authenticatingRef = useRef(false);
  const retrySecurityGeneration = useRef(0);
  const retrySessionSecurity = useCallback(async () => {
    const checked = sessionRef.current;
    if (!checked) return;
    const generation = ++retrySecurityGeneration.current;
    setSessionSecurityError("");
    try {
      const [enabled, availability] = await Promise.all([
        isFaceIdEnabled(checked.user.id),
        getFaceIdAvailability(),
      ]);
      if (
        sessionRef.current?.user.id !== checked.user.id ||
        generation !== retrySecurityGeneration.current
      )
        return;
      setFaceIdEnabledState(enabled);
      setFaceIdAvailability(availability);
      setSessionReady(true);
    } catch {
      if (
        sessionRef.current?.user.id === checked.user.id &&
        generation === retrySecurityGeneration.current
      )
        setSessionSecurityError(
          "Could not read this device's security settings. Try again or sign out.",
        );
    }
  }, []);

  useEffect(() => {
    faceIdEnabledRef.current = faceIdEnabled;
  }, [faceIdEnabled]);

  useEffect(() => {
    if (!supabaseConfig.isConfigured) {
      setLoading(false);
      return;
    }
    let active = true;
    let generation = 0;
    let securityGeneration = 0;
    const initialGeneration = generation;
    void removeLegacyPersistedSupabaseSession()
      .catch(() => {
        // The client no longer reads persisted sessions; cleanup can retry on
        // the next launch if the old storage item is temporarily unavailable.
      })
      .then(() => supabase.auth.getSession())
      .then(async ({ data }) => {
        const restoredSession = data.session;
        if (!active || generation !== initialGeneration) return;
        if (restoredSession) {
          const [enabled, availability] = await Promise.all([
            isFaceIdEnabled(restoredSession.user.id),
            getFaceIdAvailability(),
          ]);
          if (!active || generation !== initialGeneration) return;
          setFaceIdEnabledState(enabled);
          setFaceIdAvailability(availability);
          setBiometricLocked(enabled);
        }
        sessionRef.current = restoredSession;
        setSession(restoredSession);
        setSessionReady(true);
        setLoading(false);
      })
      .catch(() => {
        if (!active || generation !== initialGeneration) return;
        // Never reveal an unverified restored session after a storage failure.
        sessionRef.current = null;
        setSession(null);
        setLoading(false);
      });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === "INITIAL_SESSION") return;
        generation++;
        retrySecurityGeneration.current++;
        sessionRef.current = nextSession;
        setSession(nextSession);
        setLoading(false);
        if (!nextSession) {
          securityGeneration++;
          setSessionReady(false);
          setBiometricLocked(false);
          setFaceIdEnabledState(false);
          return;
        }
        if (event === "SIGNED_IN") {
          setSessionSecurityError("");
          const checkGeneration = ++securityGeneration;
          setSessionReady(false);
          void finishWelcomeIntro().catch(() => undefined);
          void Promise.all([
            isFaceIdEnabled(nextSession.user.id),
            getFaceIdAvailability(),
          ])
            .then(([enabled, availability]) => {
              if (
                !active ||
                securityGeneration !== checkGeneration ||
                sessionRef.current?.user.id !== nextSession.user.id
              )
                return;
              setFaceIdEnabledState(enabled);
              setFaceIdAvailability(availability);
              setBiometricLocked(
                enabled &&
                  ["inactive", "background"].includes(AppState.currentState),
              );
              setSessionReady(true);
            })
            .catch(() => {
              if (!active || securityGeneration !== checkGeneration) return;
              setSessionSecurityError(
                "Could not read this device's security settings. Try again or sign out.",
              );
            });
        }
      },
    );
    async function handleAuthUrl(url: string) {
      let callback;
      try {
        callback = authCallbackFromUrl(url);
      } catch {
        return;
      }
      const isRecovery =
        callback.type === "recovery" || url.includes("reset-password");
      if (
        !isRecovery ||
        (!callback.code && (!callback.accessToken || !callback.refreshToken))
      )
        return;
      setPasswordRecovery({ status: "loading" });
      try {
        const result = callback.code
          ? await supabase.auth.exchangeCodeForSession(callback.code)
          : await supabase.auth.setSession({
              access_token: callback.accessToken!,
              refresh_token: callback.refreshToken!,
            });
        if (result.error) throw result.error;
        setPasswordRecovery({ status: "ready" });
      } catch (error) {
        setPasswordRecovery({
          error:
            error instanceof Error
              ? error.message
              : "This reset link is invalid or has expired.",
          status: "error",
        });
      }
    }
    void Linking.getInitialURL().then((url) => {
      if (url) void handleAuthUrl(url);
    });
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleAuthUrl(url);
    });
    return () => {
      active = false;
      linkingSubscription.remove();
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const checkedSession = sessionRef.current;
      const userId = checkedSession?.user.id;
      if (nextState === "active" && userId) {
        void supabase
          .rpc("require_active_session", { p_user_id: userId })
          .then(({ error }) => {
            if (
              error?.code === "28000" &&
              sessionRef.current === checkedSession
            )
              void supabase.auth.signOut({ scope: "local" });
          });
      }
      if (
        nextState !== "active" &&
        sessionRef.current &&
        faceIdEnabledRef.current &&
        !authenticatingRef.current
      ) {
        setBiometricLocked(true);
      }
    });
    return () => subscription.remove();
  }, []);

  const refreshFaceIdAvailability = useCallback(async () => {
    const availability = await getFaceIdAvailability();
    setFaceIdAvailability(availability);
    return availability;
  }, []);

  const changeFaceIdEnabled = useCallback(
    async (
      enabled: boolean,
      password?: string,
      otp?: string,
    ): Promise<FaceIdAuthenticationResult> => {
      const currentSession = sessionRef.current;
      if (!currentSession) {
        return { success: false, message: "Sign in before changing Face ID." };
      }
      if (!enabled) {
        await revokeFaceIdLoginCredential(currentSession.user.id);
        setFaceIdEnabledState(false);
        setBiometricLocked(false);
        return { success: true };
      }
      const availability = await refreshFaceIdAvailability();
      if (!availability.available) {
        return { success: false, message: availability.reason };
      }
      const email = currentSession.user.email;
      if ((!email || !password) && !otp) {
        return {
          success: false,
          message: "Enter your current password to enable Face ID sign-in.",
        };
      }
      const authentication = await authenticateWithFaceId(
        "Enable Face ID for HealthApp",
      );
      if (!authentication.success) return authentication;
      await enrollFaceIdLoginCredential(
        {
          email: email ?? "",
          phone: currentSession.user.phone,
          userId: currentSession.user.id,
        },
        password ?? "",
        otp,
      );
      if (sessionRef.current?.user.id !== currentSession.user.id)
        return { success: false };
      setFaceIdEnabledState(true);
      setBiometricLocked(false);
      return { success: true };
    },
    [refreshFaceIdAvailability],
  );

  const unlockWithFaceId = useCallback(async () => {
    if (authenticatingRef.current) {
      return { success: false };
    }
    authenticatingRef.current = true;
    const checkedSession = sessionRef.current;
    try {
      const result = await authenticateWithFaceId("Unlock HealthApp");
      if (!checkedSession || sessionRef.current !== checkedSession)
        return { success: false };
      if (result.success) setBiometricLocked(false);
      return result;
    } finally {
      authenticatingRef.current = false;
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      loading,
      sessionReady,
      sessionSecurityError,
      retrySessionSecurity,
      configured: supabaseConfig.isConfigured,
      biometricLocked,
      faceIdAvailability,
      faceIdEnabled,
      passwordRecovery,
      clearPasswordRecovery: () => setPasswordRecovery({ status: "idle" }),
      refreshFaceIdAvailability,
      setFaceIdEnabled: changeFaceIdEnabled,
      signOut: async () => {
        if (sessionRef.current)
          await prepareReminderSignOut(sessionRef.current.user.id);
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
      },
      unlockWithFaceId,
    }),
    [
      biometricLocked,
      changeFaceIdEnabled,
      faceIdAvailability,
      faceIdEnabled,
      loading,
      passwordRecovery,
      refreshFaceIdAvailability,
      session,
      sessionReady,
      sessionSecurityError,
      retrySessionSecurity,
      unlockWithFaceId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

import type { Session } from "@supabase/supabase-js";
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
  ) => Promise<FaceIdAuthenticationResult>;
  signOut: () => Promise<void>;
  unlockWithFaceId: () => Promise<FaceIdAuthenticationResult>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [biometricLocked, setBiometricLocked] = useState(false);
  const [faceIdAvailability, setFaceIdAvailability] =
    useState<FaceIdAvailability>({ available: false });
  const [faceIdEnabled, setFaceIdEnabledState] = useState(false);
  const [passwordRecovery, setPasswordRecovery] =
    useState<PasswordRecoveryState>({ status: "idle" });
  const sessionRef = useRef<Session | null>(null);
  const faceIdEnabledRef = useRef(false);
  const authenticatingRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    faceIdEnabledRef.current = faceIdEnabled;
  }, [faceIdEnabled]);

  useEffect(() => {
    if (!supabaseConfig.isConfigured) {
      setLoading(false);
      return;
    }
    let active = true;
    void removeLegacyPersistedSupabaseSession()
      .catch(() => {
        // The client no longer reads persisted sessions; cleanup can retry on
        // the next launch if the old storage item is temporarily unavailable.
      })
      .then(() => supabase.auth.getSession())
      .then(async ({ data }) => {
        const restoredSession = data.session;
        if (!active) return;
        if (restoredSession) {
          const [enabled, availability] = await Promise.all([
            isFaceIdEnabled(restoredSession.user.id),
            getFaceIdAvailability(),
          ]);
          if (!active) return;
          setFaceIdEnabledState(enabled);
          setFaceIdAvailability(availability);
          setBiometricLocked(enabled);
        }
        setSession(restoredSession);
        setLoading(false);
      });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === "INITIAL_SESSION") return;
        setSession(nextSession);
        if (!nextSession) {
          setBiometricLocked(false);
          setFaceIdEnabledState(false);
          return;
        }
        if (event === "SIGNED_IN") {
          void Promise.all([
            isFaceIdEnabled(nextSession.user.id),
            getFaceIdAvailability(),
          ]).then(([enabled, availability]) => {
            if (!active) return;
            setFaceIdEnabledState(enabled);
            setFaceIdAvailability(availability);
            setBiometricLocked(false);
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
      if (
        nextState !== "active" &&
        sessionRef.current &&
        faceIdEnabledRef.current
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
      if (!email || !password) {
        return {
          success: false,
          message: "Enter your current password to enable Face ID sign-in.",
        };
      }
      const { error: passwordError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (passwordError) {
        return {
          success: false,
          message:
            passwordError.code === "invalid_credentials"
              ? "The current password is incorrect."
              : passwordError.message,
        };
      }
      const authentication = await authenticateWithFaceId(
        "Enable Face ID for HealthApp",
      );
      if (!authentication.success) return authentication;
      await enrollFaceIdLoginCredential({
        email,
        userId: currentSession.user.id,
      });
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
    try {
      const result = await authenticateWithFaceId("Unlock HealthApp");
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
      configured: supabaseConfig.isConfigured,
      biometricLocked,
      faceIdAvailability,
      faceIdEnabled,
      passwordRecovery,
      clearPasswordRecovery: () => setPasswordRecovery({ status: "idle" }),
      refreshFaceIdAvailability,
      setFaceIdEnabled: changeFaceIdEnabled,
      signOut: async () => {
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

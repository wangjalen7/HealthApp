import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Linking } from "react-native";

import { supabaseConfig } from "../../lib/config";
import { supabase } from "../../lib/supabase";
import { authCallbackFromUrl } from "./auth-callback";

type PasswordRecoveryState = {
  error?: string;
  status: "idle" | "loading" | "ready" | "error";
};

type AuthState = {
  session: Session | null;
  loading: boolean;
  configured: boolean;
  passwordRecovery: PasswordRecoveryState;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] =
    useState<PasswordRecoveryState>({ status: "idle" });

  useEffect(() => {
    if (!supabaseConfig.isConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => setSession(nextSession),
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
      linkingSubscription.remove();
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      loading,
      configured: supabaseConfig.isConfigured,
      passwordRecovery,
      clearPasswordRecovery: () => setPasswordRecovery({ status: "idle" }),
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [loading, passwordRecovery, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

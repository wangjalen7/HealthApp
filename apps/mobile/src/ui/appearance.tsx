import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Appearance, AppState, useColorScheme } from "react-native";
import {
  parseAppearancePreference,
  resolveAppearancePreference,
  type AppearancePreference,
} from "./appearance-model";

export {
  appearancePreferences,
  type AppearancePreference,
} from "./appearance-model";

const storageKey = "healthapp:appearance";

type AppearanceContextValue = {
  ready: boolean;
  preference: AppearancePreference;
  resolvedScheme: "light" | "dark";
  setPreference: (preference: AppearancePreference) => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | undefined>(
  undefined,
);

function applyColorScheme(preference: AppearancePreference) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.healthappAppearance = preference;
    document.documentElement.style.colorScheme =
      preference === "system" ? "light dark" : preference;
  }
  if (typeof Appearance.setColorScheme !== "function") return;
  Appearance.setColorScheme(
    preference === "system" ? "unspecified" : preference,
  );
}

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const deviceScheme = useColorScheme();
  const [preference, setStoredPreference] =
    useState<AppearancePreference>("system");

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey)
      .then((stored) => {
        if (!active) return;
        const next = parseAppearancePreference(stored);
        setStoredPreference(next);
        applyColorScheme(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && preference === "system") {
        applyColorScheme("system");
      }
    });
    return () => subscription.remove();
  }, [preference]);

  const setPreference = useCallback(async (next: AppearancePreference) => {
    applyColorScheme(next);
    setStoredPreference(next);
    try {
      await AsyncStorage.setItem(storageKey, next);
    } catch {
      // Keep the selected appearance active for this session if storage fails.
      throw new Error(
        "Appearance changed for this session, but could not be saved. Select it again to retry.",
      );
    }
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      ready,
      preference,
      resolvedScheme: resolveAppearancePreference(preference, deviceScheme),
      setPreference,
    }),
    [deviceScheme, preference, setPreference, ready],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppAppearance() {
  const value = useContext(AppearanceContext);
  if (!value)
    throw new Error("useAppAppearance must be used inside AppearanceProvider.");
  return value;
}

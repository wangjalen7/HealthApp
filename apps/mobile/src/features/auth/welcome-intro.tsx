import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { SustainLoading } from "./entry-provider";
import { getRememberedLoginAccount } from "./biometric-auth";
import { welcomeSeenKey } from "./welcome-storage";
export { finishWelcomeIntro } from "./welcome-storage";

export function useWelcomeSeen() {
  const [seen, setSeen] = useState<boolean>();
  useEffect(() => {
    let active = true;
    void Promise.all([
      AsyncStorage.getItem(welcomeSeenKey),
      getRememberedLoginAccount(),
    ])
      .then(([value, account]) => {
        if (active) setSeen(value === "true" || Boolean(account));
      })
      .catch(() => {
        if (active) setSeen(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return seen;
}
export function SignedOutEntry() {
  const seen = useWelcomeSeen();
  if (seen === undefined) return <SustainLoading />;
  return <Redirect href={seen ? "/(auth)/sign-in" : "/(auth)/welcome"} />;
}

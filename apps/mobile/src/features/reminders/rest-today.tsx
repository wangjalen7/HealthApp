import { useCallback, useState } from "react";
import { AppState, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../auth/auth-provider";
import { restToday } from "./service";
import { loadRoutines } from "./routine-storage";
import { localDay } from "./model";
import { SettingsButton, ErrorMessage, styles } from "../profile/settings-ui";
export function RestToday() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      let live = true;
      const refresh = () => {
        if (session)
          void loadRoutines(session.user.id)
            .then((p) => {
              if (live) setDone(p.restDay === localDay());
            })
            .catch(() => undefined);
      };
      refresh();
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") refresh();
      });
      return () => {
        live = false;
        listener.remove();
      };
    }, [session?.user.id]),
  );
  return (
    <View style={styles.card}>
      <Text style={styles.copy}>
        Workout or rest day? Make today work for you.
      </Text>
      {done ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          Rest day noted. No workout was recorded. Workout reminders resume on
          your next selected day.
        </Text>
      ) : (
        <SettingsButton
          label={busy ? "Saving rest day..." : "Rest Today"}
          secondary
          disabled={busy}
          onPress={() => {
            if (!session) return;
            setBusy(true);
            setError("");
            void restToday(session.user.id)
              .then(() => setDone(true))
              .catch((e) =>
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not silence today's reminders. Retry.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        />
      )}
      <ErrorMessage message={error} />
    </View>
  );
}

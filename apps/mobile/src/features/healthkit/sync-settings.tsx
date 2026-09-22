import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { loadLastVitalSyncAt } from "../vitals/sync";
import { healthSyncStatus, synchronizeHealthData } from "./unified-sync";
import { Action } from "../summary/dashboard";
import { colors } from "../../ui/theme";
export function SyncSettings({ user }: { user: string }) {
  const [busy, setBusy] = useState(false),
    [last, setLast] = useState<string>(),
    [message, setMessage] = useState("");
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void loadLastVitalSyncAt(user)
        .then((value) => {
          if (live) {
            setLast(value);
            setMessage(healthSyncStatus(user));
          }
        })
        .catch(() => {
          if (live) setMessage("Sync status unavailable. Try syncing again.");
        });
      return () => {
        live = false;
      };
    }, [user]),
  );
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.secondary }}>
        Automatic sync stays on.{" "}
        {last
          ? `Last successful sync: ${new Date(last).toLocaleString()}`
          : "No successful sync recorded yet."}
      </Text>
      <Action
        primary
        label={busy ? "Syncing..." : "Sync now"}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void synchronizeHealthData(user)
            .then(async (result) => {
              setMessage(result.message);
              setLast(await loadLastVitalSyncAt(user));
            })
            .catch(() => setMessage("Could not read sync status. Try again."))
            .finally(() => setBusy(false));
        }}
      />
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.secondary }}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

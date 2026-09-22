import { useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { useAccountSetup } from "./provider";
import { saveAccountSetup } from "./repository";
import { SetupButton, ui } from "./components";
export function SetupCard({ needed }: { needed: boolean }) {
  const { setup, accept } = useAccountSetup();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!setup?.completed_at || setup.dismissed_setup || !needed) return null;
  return (
    <View style={[ui.surface, { marginVertical: 14 }]}>
      <Text style={ui.label}>Make your daily view yours</Text>
      <Text style={ui.copy}>
        Set up optional goals and preferences whenever you’re ready.
      </Text>
      <SetupButton
        label="Open Profile setup"
        secondary
        onPress={() => router.push("/(app)/profile")}
      />
      <SetupButton
        label="Dismiss setup suggestion"
        secondary
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void saveAccountSetup(setup, { dismissed_setup: true })
            .then(accept)
            .catch(() => setError("Could not save. Try again."))
            .finally(() => setBusy(false));
        }}
      />
      {error ? <Text style={ui.caption}>{error}</Text> : null}
    </View>
  );
}

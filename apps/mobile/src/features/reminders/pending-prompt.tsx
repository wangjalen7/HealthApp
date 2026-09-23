import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { loadIntent, observeIntent, discardIntent } from "./intent-storage";
import { clearStartupResponse } from "./device";
import { SettingsButton, styles } from "../profile/settings-ui";
export function PendingReminderPrompt() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const read = () =>
      void loadIntent().then((s) =>
        setPending(Boolean(s.pending && s.pending.expiresAt > Date.now())),
      );
    read();
    return observeIntent(read);
  }, []);
  return pending ? (
    <View>
      <Text style={styles.copy}>Sign in to open your reminder.</Text>
      <SettingsButton
        label="Cancel reminder navigation"
        secondary
        onPress={() => {
          void discardIntent();
          clearStartupResponse();
        }}
      />
    </View>
  ) : null;
}

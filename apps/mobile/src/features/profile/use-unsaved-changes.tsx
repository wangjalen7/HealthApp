import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { SettingsSheet } from "../../ui/settings-sheet";
import { SettingsButton, styles } from "./settings-ui";

export function useUnsavedChanges(dirty: boolean, busy = false) {
  const navigation = useNavigation();
  const allow = useRef(false);
  const [next, setNext] = useState<() => void>();
  usePreventRemove(dirty || busy, ({ data }) => {
    if (allow.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (!busy) setNext(() => () => navigation.dispatch(data.action));
  });
  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const before = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  return {
    leave: (action: () => void) => {
      if (busy) return;
      if (dirty) setNext(() => action);
      else action();
    },
    saved: (action: () => void) => {
      allow.current = true;
      action();
    },
    confirmation: next ? (
      <SettingsSheet
        title="Discard changes?"
        onClose={() => setNext(undefined)}
      >
        <Text style={styles.copy}>Your unsaved edits will be discarded.</Text>
        <SettingsButton
          label="Keep editing"
          onPress={() => setNext(undefined)}
        />
        <SettingsButton
          label="Discard changes"
          destructive
          onPress={() => {
            allow.current = true;
            const action = next;
            setNext(undefined);
            action();
          }}
        />
      </SettingsSheet>
    ) : null,
  };
}

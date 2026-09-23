import { useState } from "react";
import { Text } from "react-native";
import { SettingsSheet } from "../../ui/settings-sheet";
import { SettingsButton, ErrorMessage, styles } from "../profile/settings-ui";
import {
  routineLabels,
  routineIssues,
  routineOverlaps,
  type RoutineKind,
  type RoutinePreferences,
} from "./routine-model";
import { RoutineFields } from "./routine-controls";
export function RoutineEditor({
  initial,
  mode,
  onClose,
  onSave,
  enableOnOpen = false,
}: {
  initial: RoutinePreferences;
  mode: RoutineKind;
  onClose: () => void;
  onSave: (p: RoutinePreferences, request: boolean) => Promise<void>;
  enableOnOpen?: boolean;
}) {
  const [draft, setDraft] = useState(() => {
    const copy = JSON.parse(JSON.stringify(initial)) as RoutinePreferences;
    if (enableOnOpen) copy.categories[mode].enabled = true;
    return copy;
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const close = () => {
    if (busy) return;
    if (JSON.stringify(draft) !== JSON.stringify(initial)) setDiscard(true);
    else onClose();
  };
  async function save() {
    const issues = routineIssues(draft);
    if (issues.length) {
      setError(issues.join("\n"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(draft, draft.categories[mode].enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save reminders.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsSheet
      fullScreen
      title={routineLabels[mode] + " Reminders"}
      onClose={close}
    >
      {discard ? (
        <>
          <Text style={styles.copy}>
            Discard your unsaved reminder changes?
          </Text>
          <SettingsButton
            label="Keep editing"
            onPress={() => setDiscard(false)}
          />
          <SettingsButton
            label="Discard changes"
            destructive
            onPress={onClose}
          />
        </>
      ) : (
        <>
          <RoutineFields
            kind={mode}
            value={draft.categories[mode]}
            disabled={busy}
            onChange={(value) =>
              setDraft({
                ...draft,
                categories: { ...draft.categories, [mode]: value },
              })
            }
          />
          {routineOverlaps(draft).map((notice) => (
            <Text key={notice} style={styles.copy}>
              {notice}
            </Text>
          ))}
          <ErrorMessage message={error} />
          <SettingsButton
            label={busy ? "Saving..." : "Save reminder settings"}
            disabled={busy}
            onPress={() => void save()}
          />
          <SettingsButton
            label="Cancel"
            secondary
            disabled={busy}
            onPress={close}
          />
        </>
      )}
    </SettingsSheet>
  );
}

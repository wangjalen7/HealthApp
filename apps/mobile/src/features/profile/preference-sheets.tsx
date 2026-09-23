import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { SettingsSheet } from "../../ui/settings-sheet";
import { Choices } from "../goals/helper-components";
import { useAppAppearance, appearancePreferences } from "../../ui/appearance";
import { useAccountSetup } from "../onboarding/provider";
import { saveAccountSetup } from "../onboarding/repository";
import { UnitChoices } from "../onboarding/account-preferences";
import { SettingsButton, ErrorMessage, styles } from "./settings-ui";
export function AppearanceSheet({ onClose }: { onClose: () => void }) {
  const { preference, setPreference } = useAppAppearance();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <SettingsSheet
      title="Appearance"
      icon="sun"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Choices
        value={preference}
        disabled={busy}
        items={appearancePreferences.map((value) => ({
          value,
          label:
            value === "system"
              ? "System"
              : value === "light"
                ? "Light"
                : "Dark",
        }))}
        onChange={(value) => {
          setBusy(true);
          setError("");
          void setPreference(value)
            .catch((e) =>
              setError(
                e instanceof Error ? e.message : "Could not save appearance.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      />
      <Text style={styles.copy}>System follows your iPhone appearance.</Text>
      <ErrorMessage message={error} />
      <SettingsButton label="Done" onPress={onClose} disabled={busy} />
    </SettingsSheet>
  );
}
export function UnitsSheet({ onClose }: { onClose: () => void }) {
  const { setup, accept, reload } = useAccountSetup();
  const [baseline] = useState(setup);
  const [units, setUnits] = useState(setup?.unit_system ?? "us"),
    [fluid, setFluid] = useState(setup?.fluid_unit ?? "fl_oz"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const lock = useRef(false),
    dirty = units !== baseline?.unit_system || fluid !== baseline?.fluid_unit;
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  async function save() {
    if (!baseline || lock.current) return;
    setBusy(true);
    lock.current = true;
    setError("");
    try {
      const changes = {
        ...(units !== baseline.unit_system ? { unit_system: units } : {}),
        ...(fluid !== baseline.fluid_unit ? { fluid_unit: fluid } : {}),
      };
      const saved = await saveAccountSetup(baseline, changes);
      accept(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save units.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <SettingsSheet title="Units" icon="ruler" onClose={close}>
      {discard ? (
        <>
          <Text style={styles.copy}>Discard your unsaved unit changes?</Text>
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
          <View pointerEvents={busy ? "none" : "auto"}>
            <UnitChoices
              disabled={busy}
              units={units}
              fluid={fluid}
              setUnits={setUnits}
              setFluid={setFluid}
            />
          </View>
          <ErrorMessage message={error} />
          {error.includes("Reload") ? (
            <SettingsButton
              label="Reload saved units"
              secondary
              onPress={() =>
                void reload()
                  .then(onClose)
                  .catch((e) => setError(String(e)))
              }
            />
          ) : null}
          <SettingsButton
            label={busy ? "Saving..." : "Save units"}
            onPress={() => void save()}
            disabled={busy || !dirty}
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

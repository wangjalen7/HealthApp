import { useState, useRef, useEffect } from "react";
import { Text, View } from "react-native";
import { Pressable } from "../../ui/pressable";
import { useAccountSetup } from "./provider";
import { preferredName, type AccountSetup } from "./model";
import { saveAccountSetup } from "./repository";
import { SetupButton, SetupField, SetupError, ui } from "./components";
export function UnitChoices({
  units,
  fluid,
  setUnits,
  setFluid,
}: {
  units: AccountSetup["unit_system"];
  fluid: AccountSetup["fluid_unit"];
  setUnits: (s: AccountSetup["unit_system"]) => void;
  setFluid: (s: AccountSetup["fluid_unit"]) => void;
}) {
  return (
    <View style={{ gap: 14 }}>
      <Text style={ui.label}>Weight and height</Text>
      <View style={ui.row}>
        {(["us", "metric"] as const).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ checked: units === id }}
            onPress={() => setUnits(id)}
            style={[ui.choice, units === id && ui.selected]}
          >
            <Text style={ui.label}>
              {id === "us" ? "lb · ft / in" : "kg · cm"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={ui.label}>Fluids</Text>
      <View style={ui.row}>
        {(["fl_oz", "ml"] as const).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ checked: fluid === id }}
            onPress={() => setFluid(id)}
            style={[ui.choice, fluid === id && ui.selected]}
          >
            <Text style={ui.label}>
              {id === "ml" ? "Milliliters" : "US fl oz"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={ui.caption}>
        Used for setup and goal estimates. Saved amounts keep their original
        units.
      </Text>
    </View>
  );
}
export function AccountPreferences() {
  const { setup, reload, accept } = useAccountSetup();
  const [name, setName] = useState(setup?.preferred_name ?? ""),
    [units, setUnits] = useState(setup?.unit_system ?? "us"),
    [fluid, setFluid] = useState(setup?.fluid_unit ?? "fl_oz"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    if (setup) {
      setName(setup.preferred_name ?? "");
      setUnits(setup.unit_system);
      setFluid(setup.fluid_unit);
    }
  }, [setup?.version]);
  async function save() {
    if (!setup || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const saved = await saveAccountSetup(setup, {
        preferred_name: preferredName(name),
        unit_system: units,
        fluid_unit: fluid,
      });
      accept(saved);
      setMessage("Preferences saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 16, marginBottom: 24 }}>
      <Text style={ui.label}>Make it yours</Text>
      <SetupField
        label="Preferred name"
        maxLength={80}
        value={name}
        onChangeText={setName}
      />
      <UnitChoices
        units={units}
        fluid={fluid}
        setUnits={setUnits}
        setFluid={setFluid}
      />
      <SetupButton
        label={busy ? "Saving..." : "Save preferences"}
        disabled={busy}
        onPress={() => void save()}
      />
      {message === "Preferences saved." ? (
        <Text accessibilityLiveRegion="polite" style={ui.copy}>
          {message}
        </Text>
      ) : (
        <SetupError message={message} />
      )}
      {message.includes("Reload") ? (
        <SetupButton
          label="Reload saved preferences"
          secondary
          onPress={() => void reload()}
        />
      ) : null}
    </View>
  );
}

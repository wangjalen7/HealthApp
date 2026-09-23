import { Text, View } from "react-native";
import { Pressable } from "../../ui/pressable";
import type { AccountSetup } from "./model";
import { ui } from "./components";
export function UnitChoices({
  units,
  fluid,
  setUnits,
  setFluid,
  disabled = false,
}: {
  disabled?: boolean;
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
            accessibilityState={{ checked: units === id, disabled }}
            disabled={disabled}
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
            accessibilityState={{ checked: fluid === id, disabled }}
            disabled={disabled}
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
        Display preferences keep underlying quantities and existing record
        units.
      </Text>
    </View>
  );
}

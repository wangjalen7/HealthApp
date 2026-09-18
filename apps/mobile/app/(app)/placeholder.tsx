import { View } from "react-native";
import { colors } from "../../src/ui/theme";
export default function PlaceholderScreen() {
  return (
    <View
      accessibilityLabel="Placeholder"
      style={{ flex: 1, backgroundColor: colors.background }}
    />
  );
}

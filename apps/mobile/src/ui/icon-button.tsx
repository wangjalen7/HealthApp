import {
  ActivityIndicator,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Icon, type IconName } from "./icon";
import { Pressable } from "./pressable";
import { colors } from "./theme";

export function IconButton({
  name,
  label,
  onPress,
  disabled,
  busy,
  destructive = false,
  variant = "tinted",
  style,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  destructive?: boolean;
  variant?: "plain" | "tinted";
  style?: StyleProp<ViewStyle>;
}) {
  const color = destructive
    ? variant === "plain"
      ? "#B42318"
      : colors.danger
    : colors.blue;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        styles.button,
        variant === "tinted" && {
          backgroundColor: destructive ? colors.dangerSoft : colors.blueSoft,
        },
        style,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <Icon name={name} size={20} color={color} />
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  disabled: { opacity: 0.35 },
});

import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { colors } from "./theme";

export function AiActionCard({
  title,
  accessibilityLabel,
  onPress,
  style,
}: {
  title: string;
  accessibilityLabel?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={[styles.card, style]}
    >
      <Icon name="sparkles" size={24} color={colors.onAccent} />
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Icon name="chevron" size={18} color={colors.onAccent} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.purple,
    borderRadius: 22,
    borderCurve: "continuous",
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    minHeight: 56,
    paddingHorizontal: 17,
    paddingVertical: 14,
  },
  text: { flex: 1 },
  title: {
    color: colors.onAccent,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "700",
  },
});

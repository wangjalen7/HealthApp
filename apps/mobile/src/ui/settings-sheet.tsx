import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Modal } from "./modal";
import { Pressable } from "./pressable";
import { Icon, type IconName } from "./icon";
import { colors } from "./theme";

/** Intrinsic content height up to the safe viewport; no growing scroll content or fake handle. */
export function SettingsSheet({
  visible = true,
  title,
  icon,
  onClose,
  children,
  footer,
}: {
  visible?: boolean;
  title: string;
  icon?: IconName;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          testID="settings-sheet"
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight: height - insets.top - 16,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.header}>
            {icon ? <Icon name={icon} color={colors.orange} /> : null}
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${title}`}
              onPress={onClose}
              style={styles.close}
            >
              <Icon name="close" color={colors.secondary} size={20} />
            </Pressable>
          </View>
          <ScrollView
            testID="settings-sheet-scroll"
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function ChoiceRow({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.choice}
    >
      <Text style={{ color: colors.text, fontSize: 16, flex: 1 }}>{label}</Text>
      <Icon
        name={selected ? "check" : "plus"}
        color={selected ? colors.blue : colors.tertiary}
        size={20}
      />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: { flex: 1, color: colors.text, fontWeight: "700", fontSize: 20 },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.fill,
  },
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 14 },
  footer: { flexShrink: 0, paddingHorizontal: 20, paddingTop: 8 },
  choice: {
    minHeight: 50,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});

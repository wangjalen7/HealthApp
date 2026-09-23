import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
  fullScreen = false,
  overlay,
  embedded = false,
}: {
  visible?: boolean;
  title: string;
  icon?: IconName;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  fullScreen?: boolean;
  overlay?: ReactNode;
  /** Render inside an existing modal so subpage changes keep its native presentation. */
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const content = (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[
        styles.overlay,
        fullScreen
          ? { backgroundColor: colors.background }
          : { paddingTop: insets.top + 16 },
      ]}
    >
      {!fullScreen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        testID="settings-sheet"
        accessibilityViewIsModal
        style={[
          styles.sheet,
          fullScreen && {
            flex: 1,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            paddingTop: insets.top,
          },
          {
            maxHeight: "100%",
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View
          style={styles.header}
          accessibilityElementsHidden={Boolean(overlay)}
          importantForAccessibility={overlay ? "no-hide-descendants" : "auto"}
        >
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
          accessibilityElementsHidden={Boolean(overlay)}
          importantForAccessibility={overlay ? "no-hide-descendants" : "auto"}
          testID="settings-sheet-scroll"
          style={{ flexGrow: fullScreen ? 1 : 0, flexShrink: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={false}
          keyboardDismissMode="interactive"
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
        {overlay}
      </View>
    </KeyboardAvoidingView>
  );
  if (embedded) return content;
  return (
    <Modal
      visible={visible}
      transparent={!fullScreen}
      presentationStyle={fullScreen ? "fullScreen" : "overFullScreen"}
      animationType="fade"
      onRequestClose={onClose}
    >
      {content}
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
    flexShrink: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  header: {
    flexShrink: 0,
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

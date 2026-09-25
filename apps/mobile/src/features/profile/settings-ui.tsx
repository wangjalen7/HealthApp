import type { ReactNode } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Icon, type IconName } from "../../ui/icon";
import { Pressable } from "../../ui/pressable";
import { TextInput } from "../../ui/text-input";
import { colors, surfaces } from "../../ui/profile-theme";

export function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ marginBottom: 24 }}>
      {title ? (
        <Text accessibilityRole="header" style={styles.groupTitle}>
          {title}
        </Text>
      ) : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}
export function SettingsRow({
  icon,
  label,
  value,
  description,
  attention,
  onPress,
  loading,
  disabled,
  destructive,
  last = false,
  toggle,
}: {
  icon: IconName;
  label: string;
  value?: string;
  description?: string;
  attention?: boolean;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  last?: boolean;
  toggle?: { value: boolean; onChange: (value: boolean) => void };
}) {
  const tint = destructive
    ? colors.danger
    : ((
        {
          food: colors.orange,
          protein: colors.green,
          water: colors.teal,
          heart: colors.pink,
          weight: colors.purple,
        } as Partial<Record<IconName, string>>
      )[icon] ?? colors.blue);
  const content = (
    <>
      <View
        style={[
          styles.tile,
          { backgroundColor: destructive ? colors.dangerSoft : colors.inset },
        ]}
      >
        <Icon name={icon} size={21} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowContent}>
          <Text
            style={[
              styles.label,
              {
                flex: 1,
                minWidth: 0,
                color: destructive ? colors.danger : colors.text,
              },
            ]}
          >
            {label}
          </Text>
          {value ? <Text style={styles.value}>{value}</Text> : null}
        </View>
        {description ? <Text style={styles.caption}>{description}</Text> : null}
      </View>
      {attention ? (
        <View accessibilityLabel="Needs attention" style={styles.badge} />
      ) : null}
      {loading ? (
        <ActivityIndicator color={colors.blue} />
      ) : toggle ? (
        <Switch
          accessibilityLabel={label}
          value={toggle.value}
          disabled={disabled}
          onValueChange={toggle.onChange}
        />
      ) : onPress ? (
        <Icon name="chevron" size={16} color={colors.tertiary} />
      ) : null}
    </>
  );
  const rowStyle = [
    styles.row,
    !last && styles.separator,
    disabled && { opacity: 0.55 },
  ];
  return onPress && !toggle ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        label,
        value,
        attention ? "Needs attention" : undefined,
      ]
        .filter(Boolean)
        .join(", ")}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || loading}
      style={rowStyle}
      onPress={onPress}
    >
      {content}
    </Pressable>
  ) : (
    <View style={rowStyle}>{content}</View>
  );
}
export function DetailScreen({
  title,
  children,
  onBack,
  headerAction,
  backLabel = "Back to Profile",
}: {
  title: string;
  children: ReactNode;
  onBack?: () => void;
  headerAction?: ReactNode;
  backLabel?: string;
}) {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={
            onBack ??
            (() =>
              router.canGoBack() ? router.back() : router.replace("/profile"))
          }
          style={styles.back}
        >
          <Icon name="back" color={colors.blue} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {headerAction}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.page}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function FormField({
  label,
  value,
  onChange,
  number = false,
  secure = false,
  disabled = false,
  maxLength = 80,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  number?: boolean;
  secure?: boolean;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={{ gap: 8, marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={number ? "decimal-pad" : "default"}
        secureTextEntry={secure}
        editable={!disabled}
        autoCapitalize={secure ? "none" : "sentences"}
        maxLength={maxLength}
        style={styles.input}
      />
    </View>
  );
}
export function SettingsButton({
  label,
  onPress,
  disabled,
  secondary = false,
  destructive = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        (secondary || destructive) && {
          backgroundColor: destructive ? colors.dangerSoft : colors.surface,
        },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          textAlign: "center",
          color: destructive
            ? colors.danger
            : secondary
              ? colors.blue
              : colors.onAccent,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function ErrorMessage({ message }: { message?: string }) {
  return message ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  ) : null;
}
export const styles = StyleSheet.create({
  page: {
    padding: 20,
    paddingBottom: 40,
    gap: 0,
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
  },
  groupTitle: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 16,
    marginBottom: 9,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 13,
    gap: 12,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: { color: colors.text, fontSize: 16, fontWeight: "500" },
  value: {
    color: colors.secondary,
    fontSize: 15,
    textAlign: "right",
    flexShrink: 1,
    marginLeft: "auto",
    maxWidth: "65%",
  },
  caption: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  copy: {
    color: colors.secondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: "600", flex: 1 },
  header: {
    paddingHorizontal: 12,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  back: {
    minWidth: 44,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  input: { ...surfaces.input, minHeight: 50 },
  button: { ...surfaces.button, minHeight: 50, marginBottom: 12 },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  card: { ...surfaces.card, padding: 18, marginBottom: 20, gap: 10 },
  bigValue: { color: colors.text, fontSize: 29, fontWeight: "700" },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.orange,
  },
});

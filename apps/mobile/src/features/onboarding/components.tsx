import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Keyboard, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenScrollView } from "../../ui/screen-scroll-view";
import { Pressable } from "../../ui/pressable";
import { TextInput } from "../../ui/text-input";
import { useReducedMotion } from "../../ui/motion";
import { colors } from "../../ui/theme";
import { KeyboardInputScope } from "../../ui/keyboard-input-scope";
export function SetupFrame({
  title,
  copy,
  children,
  footer,
  back,
  step,
}: {
  title: string;
  copy?: string;
  children: ReactNode;
  footer?: ReactNode;
  back?: () => void;
  step?: number;
}) {
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [title, reduced, fade]);
  return (
    <SafeAreaView style={ui.page} edges={["bottom"]}>
      <KeyboardInputScope>
        <ScreenScrollView
          key={step ?? title}
          testID="setup-scroll"
          style={{ flex: 1 }}
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive"
          contentContainerStyle={ui.body}
        >
          <View style={ui.top}>
            {back ? (
              <SetupButton label="Back" onPress={back} secondary />
            ) : (
              <Text style={ui.brand}>HealthApp</Text>
            )}
            {step !== undefined ? (
              <Text style={ui.caption}>{step + 1} of 5</Text>
            ) : null}
          </View>
          {step !== undefined ? (
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 5, now: step + 1 }}
              style={ui.track}
            >
              <View
                style={[
                  ui.progress,
                  { width: `${((step + 1) / 5) * 100}%` as const },
                ]}
              />
            </View>
          ) : null}
          <Animated.View
            style={{
              gap: 22,
              flexShrink: 0,
              opacity: fade,
              transform: [
                {
                  translateY: fade.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            }}
          >
            <View style={{ gap: 12 }}>
              <Text accessibilityRole="header" style={ui.title}>
                {title}
              </Text>
              {copy ? <Text style={ui.copy}>{copy}</Text> : null}
            </View>
            {children}
          </Animated.View>
          {footer ? <View style={ui.footer}>{footer}</View> : null}
        </ScreenScrollView>
      </KeyboardInputScope>
    </SafeAreaView>
  );
}
export function SetupButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        Keyboard.dismiss();
        onPress();
      }}
      style={[
        ui.button,
        secondary ? ui.secondary : undefined,
        disabled ? { opacity: 0.5 } : undefined,
      ]}
    >
      <Text
        style={[ui.buttonLabel, secondary ? { color: colors.blue } : undefined]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function SetupField({
  label,
  value,
  onChangeText,
  numeric = false,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  numeric?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={ui.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={numeric ? "decimal-pad" : "default"}
        maxLength={maxLength}
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
      />
    </View>
  );
}
export function SetupError({ message }: { message: string }) {
  return message ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[ui.copy, { color: colors.danger }]}
    >
      {message}
    </Text>
  ) : null;
}
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { maxWidth: 520, paddingHorizontal: 26, paddingBottom: 28, gap: 26 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  brand: { fontSize: 16, fontWeight: "700", color: colors.blue },
  title: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "700",
    letterSpacing: -1.1,
    color: colors.text,
  },
  copy: { fontSize: 16, lineHeight: 24, color: colors.secondary },
  caption: { fontSize: 13, lineHeight: 19, color: colors.secondary },
  label: { fontSize: 15, fontWeight: "600", color: colors.text },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 14,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 18,
    padding: 14,
  },
  button: {
    minHeight: 52,
    backgroundColor: colors.blue,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  buttonLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    color: colors.onAccent,
    textAlign: "center",
  },
  secondary: { backgroundColor: "transparent" },
  footer: {
    flexShrink: 0,
    alignSelf: "center",
    width: "100%",
    maxWidth: 520,
    paddingVertical: 12,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choice: {
    flex: 1,
    minWidth: 110,
    minHeight: 52,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 14,
    justifyContent: "center",
  },
  selected: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  track: {
    height: 3,
    backgroundColor: colors.fill,
    borderRadius: 3,
    overflow: "hidden",
  },
  progress: { height: 3, backgroundColor: colors.blue },
  surface: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 22,
    gap: 12,
  },
  value: { color: colors.text, fontSize: 25, fontWeight: "600" },
  link: { color: colors.blue, fontSize: 16, fontWeight: "600" },
});

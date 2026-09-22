import { useEffect, useState } from "react";
import { Text, View, Platform, TextInput as NativeInput } from "react-native";
import { colors } from "../../ui/theme";
import { SetupButton, ui } from "../onboarding/components";
import { otpDigits } from "./phone-model";
export function CodeInput({
  value,
  onChange,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
}) {
  return (
    <View style={{ position: "relative", minHeight: 62 }}>
      <View
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ flexDirection: "row", gap: 8 }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 60,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: i === value.length ? colors.blue : colors.separator,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={[ui.value, { fontVariant: ["tabular-nums"] }]}>
              {value[i] || ""}
            </Text>
          </View>
        ))}
      </View>
      <NativeInput
        accessibilityLabel="Six-digit verification code"
        value={value}
        onChangeText={(s) => onChange(otpDigits(s))}
        editable={!busy}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        autoCorrect={false}
        maxLength={6}
        selectionColor="transparent"
        caretHidden
        style={{
          position: "absolute",
          inset: 0,
          opacity: 1,
          color: "transparent",
          fontSize: 30,
        }}
      />
    </View>
  );
}
export function ResendCode({
  availableAt,
  onResend,
  busy,
}: {
  availableAt: number;
  onResend: () => void;
  busy: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((availableAt - now) / 1000));
  return (
    <SetupButton
      secondary
      label={remaining ? "Resend in " + remaining + "s" : "Resend code"}
      disabled={busy || remaining > 0}
      onPress={onResend}
    />
  );
}

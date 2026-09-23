import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "../../ui/pressable";
import { TextInput } from "../../ui/text-input";
import { Icon, type IconName } from "../../ui/icon";
import { colors, surfaces } from "../../ui/profile-theme";
import type { EnergyEquationSex } from "./calculator";

export function Group({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <View style={helperStyles.group}>
      <View style={helperStyles.heading}>
        <Icon name={icon} size={19} color={colors.secondary} />
        <Text accessibilityRole="header" style={helperStyles.section}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}
export function Disclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={helperStyles.disclosure}
      >
        <Text style={helperStyles.link}>{title}</Text>
        <Icon name={open ? "minus" : "plus"} size={18} color={colors.blue} />
      </Pressable>
      {open ? (
        <View style={{ gap: 10, paddingBottom: 12 }}>{children}</View>
      ) : null}
    </View>
  );
}
export function Choices<T extends string>({
  items,
  value,
  onChange,
  disabled = false,
}: {
  items: { value: T; label: string; detail?: string; symbol?: string }[];
  value?: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={helperStyles.choices}>
      {items.map((item) => (
        <Pressable
          key={item.value}
          accessibilityRole="radio"
          accessibilityLabel={item.label}
          accessibilityState={{ checked: item.value === value, disabled }}
          disabled={disabled}
          onPress={() => onChange(item.value)}
          style={[
            helperStyles.choice,
            item.detail ? { flexBasis: "100%" } : { flexGrow: 1 },
            item.value === value && helperStyles.selected,
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {item.symbol ? (
              <Text
                accessible={false}
                style={{ fontSize: 21, color: colors.secondary }}
              >
                {item.symbol}
              </Text>
            ) : null}
            <Text style={[helperStyles.label, { flexShrink: 1 }]}>
              {item.label}
            </Text>
            <View style={{ width: 17, height: 17 }}>
              {item.value === value ? (
                <Icon name="check" size={17} color={colors.blue} />
              ) : null}
            </View>
          </View>
          {item.detail ? (
            <Text style={helperStyles.copy}>{item.detail}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
export function GenderField({
  value,
  onChange,
  disabled,
}: {
  value?: EnergyEquationSex;
  onChange: (value: EnergyEquationSex) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ marginVertical: 16, gap: 8 }}>
      <Text style={helperStyles.label}>Gender</Text>
      <Choices
        value={value}
        onChange={onChange}
        disabled={disabled}
        items={[
          { value: "male", label: "Male", symbol: "\u2642" },
          { value: "female", label: "Female", symbol: "\u2640" },
        ]}
      />
      <Disclosure title="About these categories">
        <Text style={helperStyles.copy}>
          These options map to the formulas' sex-based reference categories, not
          gender identity. Choose the reference you want to use, or keep a
          manual goal if neither fits.
        </Text>
      </Disclosure>
    </View>
  );
}
export function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 8, flexGrow: 1, flexBasis: 120 }}>
      <Text style={helperStyles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        editable={!disabled}
        style={helperStyles.input}
      />
    </View>
  );
}
export function HelperButton({
  label,
  onPress,
  disabled,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        secondary ? helperStyles.secondaryButton : helperStyles.button,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={secondary ? helperStyles.link : helperStyles.buttonText}>
        {label}
      </Text>
    </Pressable>
  );
}
export function ResultCard({
  target,
  summary,
  calculatedAt,
  applied,
  children,
  accent,
}: {
  target: string;
  summary: string;
  calculatedAt?: string;
  applied: boolean;
  children?: ReactNode;
  accent: "calories" | "fluids";
}) {
  return (
    <Group
      title="Your Estimate"
      icon={accent === "calories" ? "food" : "water"}
    >
      <Text
        style={[
          helperStyles.target,
          { color: accent === "calories" ? colors.orange : colors.teal },
        ]}
      >
        {target}
      </Text>
      <Text style={helperStyles.copy}>{summary}</Text>
      {children}
      <Text style={helperStyles.copy}>
        {calculatedAt
          ? `Calculated ${new Date(calculatedAt).toLocaleDateString()}`
          : "Calculation date unavailable"}
      </Text>
      <Text
        style={[
          helperStyles.label,
          { color: applied ? colors.green : colors.secondary },
        ]}
      >
        {applied
          ? "Matches your current daily goal"
          : "Not your currently applied goal"}
      </Text>
    </Group>
  );
}
export const helperStyles = StyleSheet.create({
  group: { ...surfaces.card, padding: 16, gap: 14, marginBottom: 18 },
  heading: { flexDirection: "row", alignItems: "center", gap: 9 },
  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
    flexShrink: 1,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 16,
  },
  copy: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  label: { color: colors.text, fontSize: 15, fontWeight: "600" },
  input: { ...surfaces.input, minHeight: 50 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    minHeight: 48,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.inset,
    gap: 4,
    justifyContent: "center",
  },
  selected: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  button: { ...surfaces.button, minHeight: 52, marginBottom: 10 },
  secondaryButton: {
    minHeight: 48,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: "600" },
  link: { color: colors.blue, fontSize: 15, fontWeight: "600", flexShrink: 1 },
  disclosure: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    gap: 12,
  },
  target: { fontSize: 30, fontWeight: "700" },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
});

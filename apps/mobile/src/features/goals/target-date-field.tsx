import { useState } from "react";
import { Text, View, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Pressable } from "../../ui/pressable";
import { Icon } from "../../ui/icon";
import { colors } from "../../ui/profile-theme";
import { localEntryDay } from "../../lib/entry-date";
import { helperStyles } from "./helper-components";
export function TargetDateField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const first = new Date();
  first.setHours(12, 0, 0, 0);
  first.setDate(first.getDate() + 1);
  const fallback = new Date(first);
  fallback.setDate(fallback.getDate() + 83);
  const parsed = value ? new Date(`${value}T12:00:00`) : fallback;
  const selected = Number.isFinite(parsed.getTime()) ? parsed : fallback;
  return (
    <View style={{ gap: 8 }}>
      <Text style={helperStyles.label}>Target Date</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose Target Date"
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={[
          helperStyles.input,
          { flexDirection: "row", alignItems: "center", gap: 12 },
        ]}
      >
        <Text style={{ color: colors.text, fontSize: 17, flex: 1 }}>
          {value ? selected.toLocaleDateString() : "Choose a date"}
        </Text>
        <Icon name="calendar" size={22} color={colors.blue} />
      </Pressable>
      {open ? (
        <DateTimePicker
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          value={selected}
          minimumDate={first}
          onChange={(_, date) => {
            setOpen(false);
            if (date) onChange(localEntryDay(date));
          }}
        />
      ) : null}
    </View>
  );
}

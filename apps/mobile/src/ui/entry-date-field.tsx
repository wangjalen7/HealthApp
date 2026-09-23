import { useState } from "react";
import { Platform, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { localEntryDay, type EntryDateProps } from "../lib/entry-date";
import { Pressable } from "./pressable";
import { Icon } from "./icon";
import { colors } from "./theme";
import { trackingStyles } from "./tracking-styles";

export function EntryDateField({ value, onChange, disabled }: EntryDateProps) {
  const [open, setOpen] = useState(false);
  const day = value ?? localEntryDay();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={trackingStyles.label}>Entry date</Text>
      <Pressable
        accessibilityLabel="Choose entry date"
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={[
          trackingStyles.input,
          { flexDirection: "row", alignItems: "center", gap: 12 },
        ]}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: trackingStyles.input.fontSize,
            fontFamily: trackingStyles.input.fontFamily,
            fontWeight: trackingStyles.input.fontWeight,
            flex: 1,
          }}
        >
          {value ? new Date(`${day}T12:00:00`).toLocaleDateString() : "Today"}
        </Text>
        <Icon name="calendar" size={22} color={colors.blue} />
      </Pressable>
      {open ? (
        <DateTimePicker
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          value={new Date(`${day}T12:00:00`)}
          maximumDate={new Date()}
          onChange={(_, date) => {
            setOpen(false);
            if (date)
              onChange(
                localEntryDay(date) === localEntryDay()
                  ? undefined
                  : localEntryDay(date),
              );
          }}
        />
      ) : null}
    </View>
  );
}

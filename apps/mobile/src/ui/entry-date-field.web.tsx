import { useRef } from "react";
import { Text, View } from "react-native";
import { localEntryDay, type EntryDateProps } from "../lib/entry-date";
import { Icon } from "./icon";
import { Pressable } from "./pressable";
import { colors } from "./theme";
import { trackingStyles } from "./tracking-styles";

export function EntryDateField({ value, onChange, disabled }: EntryDateProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={trackingStyles.label}>Entry date</Text>
      <style>{`.entry-date-input::-webkit-calendar-picker-indicator { display: none; }`}</style>
      <View
        style={[
          trackingStyles.input,
          {
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 0,
            paddingRight: 3,
          },
        ]}
      >
        <input
          ref={input}
          className="entry-date-input"
          aria-label="Entry date"
          type="date"
          disabled={disabled}
          value={value ?? localEntryDay()}
          max={localEntryDay()}
          onChange={(event) =>
            onChange(
              !event.target.value || event.target.value === localEntryDay()
                ? undefined
                : event.target.value,
            )
          }
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            padding: 0,
            border: 0,
            backgroundColor: "transparent",
            color: colors.text,
            fontSize: trackingStyles.input.fontSize,
            fontFamily: trackingStyles.input.fontFamily,
            fontWeight: trackingStyles.input.fontWeight,
          }}
        />
        <Pressable
          accessibilityLabel="Choose entry date"
          disabled={disabled}
          onPress={() => {
            if (input.current?.showPicker) input.current.showPicker();
            else input.current?.focus();
          }}
          style={{
            width: 44,
            height: 48,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="calendar" size={22} color={colors.blue} />
        </Pressable>
      </View>
    </View>
  );
}

import { useRef } from "react";
import { Text, View } from "react-native";
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
  const input = useRef<HTMLInputElement>(null);
  const first = new Date();
  first.setDate(first.getDate() + 1);
  return (
    <View style={{ gap: 8 }}>
      <Text style={helperStyles.label}>Target Date</Text>
      <style>{`.goal-target-date::-webkit-calendar-picker-indicator { display: none; }`}</style>
      <View
        style={[
          helperStyles.input,
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
          type="date"
          className="goal-target-date"
          aria-label="Target Date"
          disabled={disabled}
          value={value}
          min={localEntryDay(first)}
          onChange={(event) => onChange(event.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            padding: 0,
            border: 0,
            background: "transparent",
            color: colors.text,
            font: "inherit",
            fontFamily: "system-ui",
            fontSize: 17,
          }}
        />
        <Pressable
          accessibilityLabel="Choose Target Date"
          disabled={disabled}
          onPress={() => {
            if (input.current?.showPicker) input.current.showPicker();
            else input.current?.focus();
          }}
          style={{
            width: 44,
            height: 48,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Icon name="calendar" color={colors.blue} size={22} />
        </Pressable>
      </View>
    </View>
  );
}

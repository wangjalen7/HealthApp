import DateTimePicker from "@react-native-community/datetimepicker";
import { Text, View } from "react-native";
import { dateFromLocalDay, timeFromDate, localDay } from "./model";
import { styles } from "../profile/settings-ui";
export function TimeField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 14,
      }}
    >
      <Text style={[styles.label, { flexShrink: 1 }]}>{label}</Text>
      <DateTimePicker
        accessibilityLabel={label}
        disabled={disabled}
        mode="time"
        display="compact"
        value={dateFromLocalDay(localDay(), value)}
        onValueChange={(_, date) => onChange(timeFromDate(date))}
      />
    </View>
  );
}
export function ReminderDateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>Date</Text>
      <DateTimePicker
        accessibilityLabel="Reminder date"
        mode="date"
        display="compact"
        value={dateFromLocalDay(value)}
        onValueChange={(_, date) => onChange(localDay(date))}
      />
    </View>
  );
}

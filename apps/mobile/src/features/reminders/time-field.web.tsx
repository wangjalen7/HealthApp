import { View, Text } from "react-native";
import { colors } from "../../ui/profile-theme";
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
    <View style={{ gap: 8, marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <input
        aria-label={label}
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        style={{
          font: "inherit",
          fontSize: 17,
          color: colors.text,
          background: colors.surface,
          border: `1px solid ${colors.separator}`,
          borderRadius: 10,
          padding: 12,
          minHeight: 48,
          width: "100%",
          boxSizing: "border-box",
        }}
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
      <input
        aria-label="Reminder date"
        type="date"
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        style={{
          font: "inherit",
          fontSize: 17,
          padding: 12,
          color: colors.text,
          background: colors.surface,
        }}
      />
    </View>
  );
}

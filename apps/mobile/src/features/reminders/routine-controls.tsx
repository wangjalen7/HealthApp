import { Text, View, Switch } from "react-native";
import { Pressable } from "../../ui/pressable";
import { Icon, type IconName } from "../../ui/icon";
import { colors } from "../../ui/profile-theme";
import { SettingsButton, styles } from "../profile/settings-ui";
import { weekdayLabels } from "./model";
import {
  routineLabels,
  type RoutineKind,
  type RoutineCategory,
} from "./routine-model";
import { TimeField } from "./time-field";
export const routineIcons: Record<RoutineKind, IconName> = {
  meals: "food",
  fluids: "water",
  blood_pressure: "heart",
  weight: "weight",
  workout: "workout",
};
export function ToggleRow({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 14,
      }}
    >
      <Text style={[styles.label, { flex: 1, marginBottom: 0 }]}>{label}</Text>
      <Switch
        style={{ alignSelf: "center" }}
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      />
    </View>
  );
}
export function Days({
  value,
  onChange,
  disabled = false,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) {
  return (
    <View
      accessibilityLabel="Reminder weekdays"
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 18,
      }}
    >
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <Pressable
          key={d}
          accessibilityRole="checkbox"
          accessibilityLabel={weekdayLabels[d]}
          accessibilityState={{ checked: value.includes(d), disabled }}
          disabled={disabled}
          onPress={() =>
            onChange(
              value.includes(d)
                ? value.filter((v) => v !== d)
                : [...value, d].sort(),
            )
          }
          style={{
            minWidth: 44,
            minHeight: 44,
            padding: 9,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            backgroundColor: value.includes(d) ? colors.blueSoft : colors.inset,
          }}
        >
          <Text
            style={{
              color: value.includes(d) ? colors.blue : colors.secondary,
              fontSize: 15,
            }}
          >
            {weekdayLabels[d]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function RoutineRow({
  kind,
  summary,
  enabled,
  onOpen,
  onToggle,
  disabled = false,
}: {
  kind: RoutineKind | "medication";
  summary: string;
  enabled: boolean;
  onOpen: () => void;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
}) {
  const label =
    kind === "medication" ? "Medication / Supplements" : routineLabels[kind];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingRight: 14,
        borderBottomColor: colors.separator,
        borderBottomWidth: 0.5,
      }}
    >
      <Pressable
        accessibilityLabel={`Edit ${label} reminders, ${summary}`}
        disabled={disabled}
        onPress={onOpen}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 15,
          minHeight: 72,
        }}
      >
        <Icon
          name={kind === "medication" ? "bell" : routineIcons[kind]}
          color={
            kind === "meals"
              ? colors.orange
              : kind === "blood_pressure"
                ? colors.pink
                : kind === "weight"
                  ? colors.purple
                  : kind === "workout"
                    ? colors.green
                    : colors.teal
          }
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.caption}>{summary}</Text>
        </View>
        <Icon name="chevron" color={colors.tertiary} size={16} />
      </Pressable>
      <Switch
        style={{ alignSelf: "center" }}
        accessibilityLabel={`${label} reminders`}
        value={enabled}
        onValueChange={onToggle}
        disabled={disabled}
      />
    </View>
  );
}
export function RoutineFields({
  kind,
  value,
  onChange,
  disabled = false,
}: {
  kind: RoutineKind;
  value: RoutineCategory;
  onChange: (v: RoutineCategory) => void;
  disabled?: boolean;
}) {
  return (
    <View>
      <ToggleRow
        label={`Enable ${routineLabels[kind]}`}
        value={value.enabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
        disabled={disabled}
      />
      <Text style={styles.copy}>Choose days that fit your schedule.</Text>
      <Days
        value={value.days}
        onChange={(days) => onChange({ ...value, days })}
        disabled={disabled}
      />
      {value.slots.map((slot, index) => (
        <View key={slot.id} style={[styles.card, { padding: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ flex: 1 }}>
              <TimeField
                label={`${slot.label} time`}
                value={slot.time}
                onChange={(time) =>
                  onChange({
                    ...value,
                    slots: value.slots.map((s) =>
                      s.id === slot.id ? { ...s, time } : s,
                    ),
                  })
                }
                disabled={disabled}
              />
              {kind === "fluids" && value.slots.length > 1 ? (
                <SettingsButton
                  label={`Remove drink time ${index + 1}`}
                  secondary
                  disabled={disabled}
                  onPress={() =>
                    onChange({
                      ...value,
                      slots: value.slots.filter((s) => s.id !== slot.id),
                    })
                  }
                />
              ) : null}
            </View>
            <Switch
              accessibilityLabel={slot.label + " reminder"}
              value={slot.enabled}
              onValueChange={(enabled) =>
                onChange({
                  ...value,
                  slots: value.slots.map((s) =>
                    s.id === slot.id ? { ...s, enabled } : s,
                  ),
                })
              }
              disabled={disabled}
              style={{ alignSelf: "center" }}
            />
          </View>
        </View>
      ))}
      {kind === "fluids" ? (
        <SettingsButton
          label="Add drink time"
          secondary
          disabled={disabled || value.slots.length >= 8}
          onPress={() => {
            let number = 1;
            while (value.slots.some((s) => s.id === `fluid-${number}`))
              number++;
            onChange({
              ...value,
              slots: [
                ...value.slots,
                {
                  id: `fluid-${number}`,
                  label: `Drink ${number}`,
                  time: "12:00",
                  enabled: true,
                },
              ],
            });
          }}
        />
      ) : null}
      {kind === "workout" ? (
        <Text style={styles.copy}>
          Rest days are valid. Rest Today is available from your workout
          reminder.
        </Text>
      ) : null}
    </View>
  );
}

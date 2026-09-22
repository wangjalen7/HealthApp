import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../../ui/icon";
import { colors } from "../../ui/theme";
import { Pressable } from "../../ui/pressable";
import { useWidgetEdit } from "./widget-frame";
import type { WidgetType } from "./layout";
export const widgetIdentity: Record<
  WidgetType,
  { icon: IconName; color: string }
> = {
  weight: { icon: "weight", color: colors.purple },
  bp: { icon: "heart", color: colors.pink },
  calories: { icon: "food", color: colors.orange },
  protein: { icon: "protein", color: colors.purple },
  fluids: { icon: "water", color: colors.blue },
  training: { icon: "workout", color: colors.green },
  streaks: { icon: "calendar", color: colors.orange },
  meals: { icon: "food", color: colors.orange },
  actions: { icon: "plus", color: colors.secondary },
  calendar: { icon: "calendar", color: colors.orange },
  weight_trend: { icon: "weight", color: colors.purple },
  bp_trend: { icon: "heart", color: colors.pink },
};
export function WidgetHeading({
  type,
  title,
}: {
  type: WidgetType;
  title: string;
}) {
  const identity = widgetIdentity[type];
  const onEdit = useWidgetEdit();
  return (
    <View style={widgetStyles.heading}>
      <Icon name={identity.icon} size={19} color={identity.color} />
      <Text accessibilityRole="header" style={widgetStyles.label}>
        {title}
      </Text>
      {onEdit && (type === "streaks" || type === "actions") ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${title} widget`}
          accessibilityHint="Choose the items displayed in this widget."
          onPress={onEdit}
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            marginVertical: -10,
            marginRight: -8,
          }}
        >
          <Icon name="edit" size={17} color={colors.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
export const widgetStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderCurve: "continuous",
    padding: 16,
    gap: 12,
    flex: 1,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { flex: 1, color: colors.secondary, fontSize: 14, fontWeight: "600" },
  value: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});

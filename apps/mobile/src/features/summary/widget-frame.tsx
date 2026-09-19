import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { registry, type Widget } from "./layout";

export function widgetWidth(widget: Widget, width: number, fullWidth: boolean) {
  return !fullWidth && widget.size === "small" ? (width - 12) / 2 : width;
}

// Shared by the dashboard, editor, floating drag preview and widget gallery.
export function WidgetFrame({
  widget,
  children,
  onEdit,
}: {
  widget: Widget;
  children: ReactNode;
  onEdit?: () => void;
}) {
  const title = registry[widget.type].title;
  return (
    <View style={{ flex: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${title} widget`}
        accessibilityHint="Long press to customize Summary"
        onLongPress={onEdit}
        delayLongPress={450}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text accessibilityRole="header" style={styles.heading}>
          {title}
        </Text>
      </Pressable>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 16, fontWeight: "600" },
});

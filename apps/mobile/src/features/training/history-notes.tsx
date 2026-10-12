import { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Pressable } from "../../ui/pressable";
import { Icon } from "../../ui/icon";
import { colors } from "../../ui/theme";

export function HistoryNotes({
  notes,
  kind,
}: {
  notes: string;
  kind: "workout" | "cardio";
}) {
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const [previewHeight, setPreviewHeight] = useState(0);
  const { width, fontScale } = useWindowDimensions();
  useEffect(() => {
    setExpanded(false);
  }, [notes, width, fontScale]);
  const overflows = fullHeight > previewHeight + 1 && previewHeight > 0;
  return (
    <View style={styles.section}>
      {/* Measure both layouts at the same width/font scale, including on web.
          Clipping this hidden container prevents it from extending scroll bounds. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        style={styles.measure}
      >
        <Text
          style={styles.notes}
          onLayout={(event) => setFullHeight(event.nativeEvent.layout.height)}
        >
          {notes}
        </Text>
        <Text
          style={styles.notes}
          numberOfLines={2}
          onLayout={(event) =>
            setPreviewHeight(event.nativeEvent.layout.height)
          }
        >
          {notes}
        </Text>
      </View>
      {overflows ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            (expanded ? "Collapse " : "Expand ") + kind + " notes"
          }
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          style={styles.toggle}
        >
          <Text style={styles.label}>Notes</Text>
          <Text style={styles.action}>
            {expanded ? "Show less" : "Show more"}
          </Text>
          <View
            style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}
          >
            <Icon name="chevron" size={16} color={colors.secondary} />
          </View>
        </Pressable>
      ) : (
        <Text style={[styles.label, styles.staticLabel]}>Notes</Text>
      )}
      <Text
        testID={`${kind}-history-notes`}
        style={styles.notes}
        numberOfLines={expanded ? undefined : 2}
        ellipsizeMode="tail"
      >
        {notes}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderTopColor: colors.fill, borderTopWidth: 1, marginTop: 12 },
  measure: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 0,
    overflow: "hidden",
    opacity: 0,
  },
  toggle: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  label: { flex: 1, color: colors.secondary, fontSize: 13, fontWeight: "600" },
  staticLabel: { flex: 0, paddingVertical: 8 },
  action: { color: colors.blue, fontSize: 13 },
  notes: {
    color: colors.secondary,
    fontSize: 13,
    lineHeight: 20,
    paddingBottom: 8,
  },
});

import { Keyboard, Platform, Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../../ui/theme";
import { Icon } from "../../ui/icon";

export function ExerciseDragHandle({
  index,
  itemCount,
  dragging,
  onDrag,
  onMove,
}: {
  index: number;
  itemCount: number;
  dragging: boolean;
  onDrag: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  function move(direction: -1 | 1) {
    if (!dragging && index + direction >= 0 && index + direction < itemCount)
      onMove(direction);
  }
  return (
    <Pressable
      accessibilityActions={[
        { name: "increment", label: "Move down" },
        { name: "decrement", label: "Move up" },
      ]}
      accessibilityHint="Hold and drag to reorder. Use move up or down actions."
      accessibilityLabel={`Reorder exercise ${index + 1}`}
      accessibilityRole="adjustable"
      accessibilityValue={{
        min: 1,
        max: itemCount,
        now: index + 1,
        text: `${index + 1} of ${itemCount}`,
      }}
      accessibilityState={{ disabled: itemCount < 2 }}
      disabled={itemCount < 2}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "increment") move(1);
        if (nativeEvent.actionName === "decrement") move(-1);
      }}
      onPressIn={Keyboard.dismiss}
      onLongPress={onDrag}
      delayLongPress={180}
      {...(Platform.OS === "web"
        ? {
            onKeyDown: (event: { key: string; preventDefault: () => void }) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                move(event.key === "ArrowUp" ? -1 : 1);
              }
            },
          }
        : {})}
      style={[
        styles.handle,
        dragging && styles.active,
        itemCount < 2 && styles.disabled,
      ]}
    >
      <Icon name="reorder" size={20} color={colors.blue} />
      <Text style={styles.label}>Drag</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  handle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.blueSoft,
  },
  active: { backgroundColor: colors.fill },
  disabled: { opacity: 0.5 },
  label: { color: colors.blue, fontSize: 13, fontWeight: "600" },
});

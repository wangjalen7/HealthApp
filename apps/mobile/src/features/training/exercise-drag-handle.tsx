import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
    <View style={styles.controls}>
      <Pressable
        accessibilityLabel="Move exercise up"
        accessibilityRole="button"
        disabled={dragging || index === 0}
        onPress={() => move(-1)}
        style={styles.stepButton}
      >
        <Text style={[styles.stepText, index === 0 && styles.stepDisabled]}>
          ↑
        </Text>
      </Pressable>
      <Pressable
        accessibilityActions={[
          { name: "increment", label: "Move down" },
          { name: "decrement", label: "Move up" },
        ]}
        accessibilityHint="Hold, then drag to reorder. Use the arrow buttons for precise moves."
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
        delayLongPress={350}
        {...(Platform.OS === "web"
          ? {
              onKeyDown: (event: {
                key: string;
                preventDefault: () => void;
              }) => {
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
      <Pressable
        accessibilityLabel="Move exercise down"
        accessibilityRole="button"
        disabled={dragging || index === itemCount - 1}
        onPress={() => move(1)}
        style={styles.stepButton}
      >
        <Text
          style={[
            styles.stepText,
            index === itemCount - 1 && styles.stepDisabled,
          ]}
        >
          ↓
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  controls: { alignItems: "center", flexDirection: "row", gap: 3 },
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
  stepButton: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 38,
    minWidth: 28,
  },
  stepText: { color: colors.blue, fontSize: 17, fontWeight: "800" },
  stepDisabled: { color: colors.separator },
});

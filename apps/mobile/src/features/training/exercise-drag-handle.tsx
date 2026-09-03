import { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

import { workoutDragOffset } from "./exercise-reorder";

export function ExerciseDragHandle({
  index,
  itemCount,
  onMove,
}: {
  index: number;
  itemCount: number;
  onMove: (direction: -1 | 1) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const indexRef = useRef(index);
  const itemCountRef = useRef(itemCount);
  const onMoveRef = useRef(onMove);
  const startIndexRef = useRef(index);
  const appliedOffsetRef = useRef(0);
  indexRef.current = index;
  itemCountRef.current = itemCount;
  onMoveRef.current = onMove;

  function finishDrag() {
    appliedOffsetRef.current = 0;
    setDragging(false);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        startIndexRef.current = indexRef.current;
        appliedOffsetRef.current = 0;
        setDragging(true);
      },
      onPanResponderMove: (_, gesture) => {
        const requestedOffset = workoutDragOffset(
          gesture.dy,
          startIndexRef.current,
          itemCountRef.current,
        );
        while (appliedOffsetRef.current < requestedOffset) {
          onMoveRef.current(1);
          appliedOffsetRef.current += 1;
        }
        while (appliedOffsetRef.current > requestedOffset) {
          onMoveRef.current(-1);
          appliedOffsetRef.current -= 1;
        }
      },
      onPanResponderRelease: finishDrag,
      onPanResponderTerminate: finishDrag,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return (
    <View
      {...panResponder.panHandlers}
      accessibilityActions={[
        { name: "increment", label: "Move down" },
        { name: "decrement", label: "Move up" },
      ]}
      accessibilityHint="Drag up or down to reorder"
      accessibilityLabel={`Reorder exercise ${index + 1}`}
      accessibilityRole="adjustable"
      accessibilityValue={{ text: `${index + 1} of ${itemCount}` }}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "increment" && index < itemCount - 1)
          onMove(1);
        if (nativeEvent.actionName === "decrement" && index > 0) onMove(-1);
      }}
      style={[styles.handle, dragging && styles.handleDragging]}
    >
      <Text style={styles.grip}>≡</Text>
      <Text style={styles.label}>{dragging ? "Dragging" : "Drag"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  handle: {
    alignItems: "center",
    backgroundColor: "#E6F7F3",
    borderColor: "#B7E4D8",
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    minHeight: 36,
    paddingHorizontal: 9,
  },
  handleDragging: {
    backgroundColor: "#B7E4D8",
    borderColor: "#16776A",
  },
  grip: { color: "#16776A", fontSize: 20, fontWeight: "800" },
  label: { color: "#16776A", fontSize: 12, fontWeight: "800" },
});

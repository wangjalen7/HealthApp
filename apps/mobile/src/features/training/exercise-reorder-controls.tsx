import { StyleSheet, View } from "react-native";
import { IconButton } from "../../ui/icon-button";

export function ExerciseReorderControls({
  index,
  itemCount,
  onMove,
}: {
  index: number;
  itemCount: number;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <View style={styles.row}>
      <IconButton
        name="arrow-up"
        label="Move exercise up"
        disabled={index === 0}
        onPress={() => onMove(-1)}
      />
      <IconButton
        name="arrow-down"
        label="Move exercise down"
        disabled={index === itemCount - 1}
        onPress={() => onMove(1)}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});

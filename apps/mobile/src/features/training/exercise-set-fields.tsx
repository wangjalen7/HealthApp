import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { colors } from "../../ui/theme";
import { trackingStyles } from "../../ui/tracking-styles";

type Side = "left" | "right";

export function ExerciseSetFields({
  setCount,
  reps,
  rightReps,
  weight,
  rightWeight,
  unilateral,
  onSetCountChange,
  onRepChange,
  onWeightChange,
}: {
  setCount: number;
  reps: number[];
  rightReps: number[];
  weight?: number;
  rightWeight?: number;
  unilateral: boolean;
  onSetCountChange: (value: string) => void;
  onRepChange: (index: number, value: string, side: Side) => void;
  onWeightChange: (value: string, side: Side) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const height = Math.max(44, Math.ceil(21 * fontScale + 18));
  const sides: Side[] = unilateral ? ["left", "right"] : ["left"];
  return (
    <View style={styles.group}>
      <View style={styles.header}>
        {unilateral ? <View style={styles.side} /> : null}
        <Text style={[styles.label, styles.count]}>Sets</Text>
        {!unilateral ? <View style={styles.side} /> : null}
        <Text style={[styles.label, styles.reps]}>Reps</Text>
        <Text style={[styles.label, styles.weightHeading]}>Weight</Text>
      </View>
      <View style={styles.grid}>
        {unilateral ? (
          <View style={[styles.column, styles.side]}>
            {sides.map((side) => (
              <View
                key={side}
                testID={`exercise-side-${side}`}
                style={[styles.center, { height }]}
              >
                <Text style={styles.sideText}>
                  {side === "left" ? "L" : "R"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <TextInput
          accessibilityLabel="Number of sets"
          keyboardType="number-pad"
          placeholder="#"
          placeholderTextColor={colors.tertiary}
          style={[styles.input, styles.count, { height }]}
          value={setCount ? String(setCount) : ""}
          onChangeText={onSetCountChange}
        />
        {!unilateral ? (
          <View style={[styles.center, styles.side, { height }]}>
            <Text style={styles.sideText}>x</Text>
          </View>
        ) : null}
        {/* Each set is one column. Both sides share the same viewport and offset,
            including when native input focus scrolls a later set into view. */}
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustKeyboardInsets={false}
          showsHorizontalScrollIndicator={false}
          bounces={false}
          style={[
            styles.reps,
            { height: sides.length * height + (sides.length - 1) * 6 },
          ]}
          contentContainerStyle={styles.repColumns}
        >
          {reps.map((_, index) => (
            <View key={index} style={styles.column}>
              {sides.map((side) => {
                const value = side === "left" ? reps[index] : rightReps[index];
                return (
                  <TextInput
                    key={side}
                    accessibilityLabel={
                      side === "left"
                        ? `Set ${index + 1} reps`
                        : `Right side set ${index + 1} reps`
                    }
                    keyboardType="number-pad"
                    placeholder="_"
                    placeholderTextColor={colors.tertiary}
                    style={[styles.input, styles.rep, { height }]}
                    value={value ? String(value) : ""}
                    onChangeText={(text) => onRepChange(index, text, side)}
                  />
                );
              })}
            </View>
          ))}
        </ScrollView>
        <View style={[styles.column, styles.weight]}>
          {sides.map((side) => {
            const value = side === "left" ? weight : rightWeight;
            return (
              <TextInput
                key={side}
                accessibilityLabel={
                  side === "left"
                    ? "Working weight in pounds"
                    : "Right side working weight in pounds"
                }
                keyboardType="decimal-pad"
                placeholder="lb"
                placeholderTextColor={colors.tertiary}
                style={[styles.input, styles.weight, { height }]}
                value={value === undefined ? "" : String(value)}
                onChangeText={(text) => onWeightChange(text, side)}
              />
            );
          })}
        </View>
        <View style={[styles.column, styles.unit]}>
          {sides.map((side) => (
            <View key={side} style={[styles.center, { height }]}>
              <Text style={styles.unitText}>lb</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: 15 },
  header: { flexDirection: "row", gap: 6, marginBottom: 5 },
  grid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 1,
  },
  column: { gap: 6, flexShrink: 0 },
  center: { justifyContent: "center", alignItems: "center" },
  label: { color: colors.tertiary, fontSize: 11, fontWeight: "700" },
  input: {
    ...trackingStyles.input,
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 8,
    textAlign: "center",
    flexShrink: 0,
  },
  count: { width: 40, flexShrink: 0 },
  side: { width: 12, flexShrink: 0 },
  sideText: { color: colors.blue, fontSize: 14, fontWeight: "800" },
  reps: { flex: 1, minWidth: 0 },
  repColumns: { flexDirection: "row", gap: 5 },
  rep: { width: 40 },
  weight: { width: 52, flexShrink: 0 },
  weightHeading: { width: 72, flexShrink: 0 },
  unit: { width: 14, flexShrink: 0 },
  unitText: { color: colors.secondary, fontSize: 13, fontWeight: "600" },
});

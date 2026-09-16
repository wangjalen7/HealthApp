import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import { useReducedMotion } from "../../ui/motion";
import { colors } from "../../ui/theme";

export function WaterGlass({ value, goal }: { value: number; goal?: number }) {
  const fraction =
    goal && goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;
  const fill = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    const animation = Animated.timing(fill, {
      toValue: fraction,
      duration: reduced ? 0 : 700,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [fill, fraction, reduced]);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Daily water goal"
      {...(Platform.OS === "web"
        ? {
            "aria-valuemin": goal ? 0 : undefined,
            "aria-valuemax": goal ? 100 : undefined,
            "aria-valuenow": goal ? Math.round(fraction * 100) : undefined,
            "aria-valuetext": goal
              ? `${Math.round(fraction * 100)}% of daily water goal`
              : "No water goal set",
          }
        : {})}
      accessibilityValue={
        goal
          ? {
              min: 0,
              max: 100,
              now: Math.round(fraction * 100),
              text: `${Math.round(fraction * 100)}% of daily water goal`,
            }
          : { text: "No water goal set" }
      }
      style={styles.glass}
    >
      <Animated.View
        testID="water-glass-fill"
        style={[
          styles.water,
          {
            height: fill.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 100],
            }),
          },
        ]}
      >
        <View style={styles.surface} />
      </Animated.View>
      <View style={styles.reflection} />
      {[28, 53, 78].map((top) => (
        <View key={top} style={[styles.mark, { top }]} />
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  glass: {
    width: 76,
    height: 112,
    borderWidth: 2,
    borderColor: "#87B9E4",
    borderTopWidth: 3,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    overflow: "hidden",
    backgroundColor: "#F0F8FF",
  },
  water: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#58AEF1",
  },
  surface: { height: 4, backgroundColor: "#A6DAFF", borderRadius: 2 },
  reflection: {
    position: "absolute",
    top: 12,
    bottom: 14,
    left: 9,
    width: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  mark: {
    position: "absolute",
    right: 0,
    width: 9,
    height: 1,
    backgroundColor: colors.blue,
    opacity: 0.3,
  },
});

import { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "./motion";
import { Pressable } from "./pressable";
import { colors } from "./theme";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const [width, setWidth] = useState(0);
  const position = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const segmentWidth = Math.max(0, (width - 8) / options.length);
  useEffect(() => {
    const animation = Animated.timing(position, {
      toValue: index * segmentWidth,
      duration: reduced ? 0 : 180,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [index, position, reduced, segmentWidth]);
  return (
    <View
      accessibilityLabel={label}
      style={styles.track}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.selection,
            { width: segmentWidth, transform: [{ translateX: position }] },
          ]}
        />
      )}
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: option.value === value }}
          onPress={() => onChange(option.value)}
          style={styles.segment}
        >
          <Text
            style={[
              styles.label,
              option.value === value && styles.selectedLabel,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.fill,
    borderRadius: 14,
    flexDirection: "row",
    padding: 4,
    marginBottom: 18,
  },
  selection: {
    backgroundColor: colors.surface,
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  segment: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    paddingVertical: 8,
  },
  label: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  selectedLabel: { color: colors.text, fontWeight: "700" },
});

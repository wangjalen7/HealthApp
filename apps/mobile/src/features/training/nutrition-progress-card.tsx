import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { Icon } from "../../ui/icon";
import { useReducedMotion } from "../../ui/motion";
import { Pressable } from "../../ui/pressable";
import { colors, surfaces } from "../../ui/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const radius = 43;
const circumference = 2 * Math.PI * radius;

export function NutritionProgressCard({
  label,
  value,
  goal,
  unit,
  onPress,
  accessibilityHint,
}: {
  label: string;
  value: number;
  goal: number | undefined;
  unit: string;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  const hasGoal = goal !== undefined && goal > 0;
  const fraction = hasGoal ? Math.max(0, Math.min(1, value / goal)) : 0;
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: fraction,
      duration: reduced ? 0 : 650,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [fraction, progress, reduced]);
  const water = label === "Water";
  const accent = water
    ? colors.blue
    : label === "Protein"
      ? colors.purple
      : colors.orange;
  const rounded = Math.round(value);
  const roundedGoal = hasGoal ? Math.round(goal) : undefined;
  const ring = (
    <Svg
      height={104}
      width={104}
      viewBox="0 0 104 104"
      {...(Platform.OS === "web"
        ? { "aria-hidden": true }
        : { accessibilityElementsHidden: true })}
    >
      <Circle
        cx={52}
        cy={52}
        r={radius}
        fill="none"
        stroke={accent}
        strokeOpacity={0.1}
        strokeWidth={8}
      />
      {hasGoal &&
        (Platform.OS === "web" ? (
          <circle
            cx={52}
            cy={52}
            r={radius}
            fill="none"
            stroke={accent}
            strokeWidth={8}
            strokeLinecap="round"
            transform="rotate(-90 52 52)"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - fraction)}
            style={{
              transition: reduced ? "none" : "stroke-dashoffset 650ms ease",
            }}
          />
        ) : (
          <AnimatedCircle
            cx={52}
            cy={52}
            r={radius}
            fill="none"
            stroke={accent}
            strokeWidth={8}
            strokeLinecap="round"
            transform="rotate(-90 52 52)"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={progress.interpolate({
              inputRange: [0, 1],
              outputRange: [circumference, 0],
            })}
          />
        ))}
      <SvgText
        x={52}
        y={52}
        textAnchor="middle"
        fill={colors.text}
        fontSize={rounded.toString().length > 4 ? 19 : 25}
        fontWeight="700"
      >
        {rounded}
      </SvgText>
      <SvgText
        x={52}
        y={68}
        textAnchor="middle"
        fill={colors.secondary}
        fontSize={11}
      >
        {unit}
      </SvgText>
    </Svg>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint ?? "Opens the matching tracker."}
      accessibilityLabel={
        hasGoal
          ? `${label}: ${rounded} of ${roundedGoal} ${unit}`
          : `${label}: ${rounded} ${unit}, no goal set`
      }
      onPress={onPress}
      style={[surfaces.card, styles.card, water && styles.waterCard]}
    >
      <View style={water ? styles.waterCopy : styles.heading}>
        <View style={styles.labelRow}>
          <Icon
            name={water ? "water" : label === "Protein" ? "protein" : "food"}
            color={accent}
            size={17}
          />
          <Text style={[styles.label, { color: accent }]}>{label}</Text>
          <View style={{ flex: 1 }} />
          <Icon name="chevron" color={colors.tertiary} size={12} />
        </View>
        {water && <Text style={styles.waterTitle}>Water & fluids</Text>}
        {water && (
          <Text style={styles.detail}>
            {hasGoal ? `Goal: ${roundedGoal} ${unit}` : "Set goal in Profile"}
          </Text>
        )}
      </View>
      {ring}
      {!water && (
        <Text style={styles.detail}>
          {hasGoal ? `Goal: ${roundedGoal} ${unit}` : "Set goal in Profile"}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, alignItems: "center", padding: 14, gap: 12 },
  heading: { alignSelf: "stretch" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  label: { fontSize: 13, fontWeight: "600" },
  detail: {
    color: colors.secondary,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
  waterCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  waterCopy: { flex: 1, alignItems: "flex-start", gap: 7 },
  waterTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
});

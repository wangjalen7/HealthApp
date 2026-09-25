import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Platform, View, type DimensionValue } from "react-native";
import { colors, surfaces } from "./theme";
import { useReducedMotion } from "./motion";

/** One accessible announcement per region; decorative bars are hidden from accessibility. */
export function SkeletonGroup({
  children,
  label = "Loading",
  testID,
  paused = false,
}: {
  children: ReactNode;
  label?: string;
  testID?: string;
  paused?: boolean;
}) {
  const reduced = useReducedMotion();
  const alpha = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    alpha.setValue(1);
    if (reduced || paused) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(alpha, {
          toValue: 0.55,
          duration: 850,
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
        Animated.timing(alpha, {
          toValue: 1,
          duration: 850,
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [alpha, reduced, paused]);
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: !paused }}
      accessibilityLiveRegion="polite"
    >
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        style={{ opacity: alpha, gap: 12 }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
export function Skeleton({
  width = "100%",
  height = 16,
  round = 6,
}: {
  width?: DimensionValue;
  height?: number;
  round?: number;
}) {
  return (
    <View
      style={{
        width,
        height,
        borderRadius: round,
        backgroundColor: colors.fill,
      }}
    />
  );
}
export function HistorySkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={`Loading ${label} history`} testID="history-skeleton">
      {[0, 1, 2].map((row) => (
        <View
          key={row}
          style={[surfaces.card, { padding: 18, gap: 14, minHeight: 150 }]}
        >
          <Skeleton width="45%" height={13} />
          <Skeleton width="64%" height={24} />
          <Skeleton width="80%" />
          <Skeleton width="35%" height={12} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

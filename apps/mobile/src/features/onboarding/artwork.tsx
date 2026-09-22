import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useReducedMotion } from "../../ui/motion";
import { colors } from "../../ui/theme";
import { ui } from "./components";
export function WelcomeArtwork() {
  const reduced = useReducedMotion();
  const position = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      position.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(position, {
          toValue: 1,
          duration: 2400,
          useNativeDriver: true,
        }),
        Animated.timing(position, {
          toValue: 0,
          duration: 2400,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [position, reduced]);
  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        gap: 12,
        paddingVertical: 15,
        transform: [
          {
            translateY: position.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -5],
            }),
          },
        ],
      }}
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={[ui.surface, { flex: 1, alignItems: "center" }]}>
          <Svg width={108} height={108} viewBox="0 0 108 108">
            <Circle
              cx={54}
              cy={54}
              r={44}
              fill="none"
              stroke={colors.fill}
              strokeWidth={9}
            />
            <Circle
              cx={54}
              cy={54}
              r={44}
              fill="none"
              stroke={colors.blue}
              strokeWidth={9}
              strokeDasharray="185 277"
              strokeLinecap="round"
              transform="rotate(-90 54 54)"
            />
          </Svg>
          <Text style={ui.label}>Daily goals</Text>
        </View>
        <View
          style={[
            ui.surface,
            { flex: 1, alignItems: "center", justifyContent: "center" },
          ]}
        >
          <View
            style={{
              height: 96,
              width: 62,
              backgroundColor: colors.blueSoft,
              borderRadius: 18,
              overflow: "hidden",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{ height: 54, backgroundColor: colors.blue, opacity: 0.7 }}
            />
          </View>
          <Text style={ui.label}>Fluids</Text>
        </View>
      </View>
      <View style={ui.surface}>
        <Text style={ui.label}>Your next workout</Text>
        <View style={{ gap: 9 }}>
          {[90, 65, 78].map((w, i) => (
            <View
              key={i}
              style={{
                width: `${w}%` as const,
                height: 7,
                borderRadius: 6,
                backgroundColor: i === 0 ? colors.blueSoft : colors.fill,
              }}
            />
          ))}
        </View>
        <Text style={ui.caption}>Plan. Track. Make it yours.</Text>
      </View>
    </Animated.View>
  );
}

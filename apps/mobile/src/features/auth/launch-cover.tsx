import { useEffect, useRef, useState } from "react";
import { Animated, Appearance, Platform, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { SustainBrand, sustainPalette } from "./sustain-brand";
import { useAuth } from "./auth-provider";
import { useAppAppearance } from "../../ui/appearance";
import { useReducedMotion } from "../../ui/motion";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: false, duration: 0 });
// Capture before AppearanceProvider applies a saved in-app override.
const launchScheme = Appearance.getColorScheme() === "dark" ? "dark" : "light";

/** System-themed first frame exactly matches the configured native launch image. */
export function LaunchCover() {
  const { loading } = useAuth();
  const { ready } = useAppAppearance();
  const reduced = useReducedMotion();
  const alpha = useRef(new Animated.Value(1)).current;
  const [imageReady, setImageReady] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!imageReady) return;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [imageReady]);
  useEffect(() => {
    if (loading || !ready || !imageReady) return;
    const animation = Animated.timing(alpha, {
      toValue: 0,
      duration: reduced ? 0 : 160,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => animation.stop();
  }, [alpha, imageReady, loading, ready, reduced]);
  if (!visible) return null;
  return (
    <Animated.View
      testID="sustain-launch-cover"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 200,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: sustainPalette[launchScheme],
          opacity: alpha,
        },
      ]}
    >
      <SustainBrand
        size={(112 * 401) / 475}
        enhanceDark={false}
        wordmarkVisible={false}
        onLoad={() => setImageReady(true)}
      />
    </Animated.View>
  );
}

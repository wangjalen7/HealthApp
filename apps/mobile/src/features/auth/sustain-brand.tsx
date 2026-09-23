import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type PropsWithChildren,
} from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Defs, Image as SvgImage, Mask, Path } from "react-native-svg";
import { useReducedMotion } from "../../ui/motion";
import { useAppAppearance } from "../../ui/appearance";

export const sustainPalette = {
  light: "#F4F7F4",
  dark: "#0B1913",
  green: "#173F2D",
  mint: "#72E39A",
};
/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles these static raster assets. */
const symbol = require("../../../assets/sustain/symbol.png");
const mask = require("../../../assets/sustain/symbol-mask.png");
const wordmark = require("../../../assets/sustain/wordmark.png");
/* eslint-enable @typescript-eslint/no-require-imports */
// react-native-svg's web declaration omits children on Defs.
const SvgDefs = Defs as ComponentType<PropsWithChildren>;
export type LogoMotion = "idle" | "pending" | "biometric" | "success";

/** The approved raster's alpha is the mask; the animation never changes its silhouette. */
export function SustainBrand({
  motion = "idle",
  size = 96,
  wordmarkVisible = true,
  compactSuccess = false,
  enhanceDark = true,
  onLoad,
}: {
  motion?: LogoMotion;
  size?: number;
  wordmarkVisible?: boolean;
  compactSuccess?: boolean;
  enhanceDark?: boolean;
  onLoad?: () => void;
}) {
  const reduced = useReducedMotion();
  const { resolvedScheme } = useAppAppearance();
  const id = useId().replace(/:/g, "");
  const flow = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (motion !== "pending" || reduced) return;
    const listener = flow.addListener(({ value }) => setOffset(value));
    flow.setValue(0);
    const animation = Animated.loop(
      Animated.timing(flow, {
        toValue: 1,
        duration: 2100,
        easing: Easing.linear,
        useNativeDriver: false,
        isInteraction: false,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
      flow.removeListener(listener);
    };
  }, [flow, motion, reduced]);
  useEffect(() => {
    scale.setValue(1);
    fill.setValue(0);
    if (motion !== "success") return;
    const duration = compactSuccess ? 180 : 320;
    const animation = Animated.parallel([
      Animated.timing(fill, {
        toValue: 0.55,
        duration: reduced ? 0 : duration,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: reduced ? 1 : 1.035,
          duration: reduced ? 0 : duration / 2,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: reduced ? 0 : duration / 2,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [compactSuccess, fill, motion, reduced, scale]);
  const height = (size * 475) / 401;
  return (
    <View accessible accessibilityLabel="Sustain" style={styles.brand}>
      <Animated.View style={{ width: size, height, transform: [{ scale }] }}>
        <Image
          source={symbol}
          style={styles.image}
          resizeMode="contain"
          onLoad={onLoad}
          onError={onLoad}
        />
        {resolvedScheme === "dark" && enhanceDark ? (
          <Image
            source={mask}
            style={[
              styles.image,
              { tintColor: sustainPalette.mint, opacity: 0.16 },
            ]}
          />
        ) : null}
        {motion === "pending" && !reduced ? (
          <Svg
            width={size}
            height={height}
            viewBox="0 0 401 475"
            style={[StyleSheet.absoluteFill]}
          >
            <SvgDefs>
              <Mask
                id={id}
                x="0"
                y="0"
                width="401"
                height="475"
                maskUnits="userSpaceOnUse"
              >
                <SvgImage href={mask} x="0" y="0" width="401" height="475" />
              </Mask>
            </SvgDefs>
            <Path
              mask={`url(#${id})`}
              d="M 336 65 C 180 12 32 128 101 220 C 138 264 290 218 324 286 C 399 424 167 443 58 414"
              fill="none"
              stroke={sustainPalette.mint}
              strokeWidth="130"
              strokeLinecap="round"
              strokeOpacity="0.6"
              strokeDasharray="140 1100"
              strokeDashoffset={-offset * 1240}
            />
          </Svg>
        ) : null}
        <Animated.Image
          source={mask}
          style={[
            styles.image,
            { tintColor: sustainPalette.mint, opacity: fill },
          ]}
        />
      </Animated.View>
      {wordmarkVisible ? (
        <Image
          source={wordmark}
          resizeMode="contain"
          style={{
            width: 164,
            height: 39,
            marginTop: 18,
            ...(resolvedScheme === "dark" ? { tintColor: "#D8F3E2" } : {}),
          }}
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  brand: { alignItems: "center" },
  image: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
});

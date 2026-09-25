import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable as NativePressable,
  type PressableProps,
} from "react-native";
import { useReducedMotion } from "./motion";

const AnimatedPressable = Animated.createAnimatedComponent(NativePressable);

/** A shared spring response. Reduced Motion retains immediate opacity feedback. */
export function Pressable({
  style,
  children,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  disabled,
  disabledOpacity = 0.45,
  accessibilityRole = "button",
  accessibilityState,
  ...props
}: PressableProps & { disabledOpacity?: number }) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      scale.setValue(1);
      return;
    }
    const animation = Animated.spring(scale, {
      toValue: pressed && !disabled && !reduced ? 0.97 : 1,
      damping: 22,
      stiffness: 380,
      mass: 0.65,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [disabled, pressed, reduced, scale]);
  return (
    <AnimatedPressable
      {...props}
      accessibilityRole={accessibilityRole}
      accessibilityState={{
        ...accessibilityState,
        disabled: Boolean(disabled),
      }}
      {...(Platform.OS === "web"
        ? {
            "aria-selected":
              props["aria-selected"] ?? accessibilityState?.selected,
            "aria-checked":
              props["aria-checked"] ?? accessibilityState?.checked,
            "aria-expanded":
              props["aria-expanded"] ?? accessibilityState?.expanded,
            "aria-busy": props["aria-busy"] ?? accessibilityState?.busy,
            "aria-disabled": disabled ?? accessibilityState?.disabled,
          }
        : {})}
      disabled={disabled}
      onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      style={[
        typeof style === "function" ? style({ pressed, hovered }) : style,
        pressed && !disabled && { opacity: 0.72 },
        disabled && { opacity: disabledOpacity },
        Platform.OS === "web" && focused && { outlineColor: "#397BB8", outlineWidth: 3, outlineStyle: "solid", outlineOffset: 2 },
        { transform: [{ scale }] },
      ]}
    >
      {typeof children === "function"
        ? children({ pressed, hovered })
        : children}
    </AnimatedPressable>
  );
}

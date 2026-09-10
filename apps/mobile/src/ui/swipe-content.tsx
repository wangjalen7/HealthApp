import { useEffect, useMemo, useRef, type PropsWithChildren } from "react";
import { Animated, PanResponder, Platform } from "react-native";
import { useReducedMotion } from "./motion";
import { isHorizontalSwipe, swipeDestination } from "./swipe";

export function SwipeContent({
  children,
  index,
  count,
  onChange,
  onGestureChange,
}: PropsWithChildren<{
  index: number;
  count: number;
  onChange: (index: number) => void;
  onGestureChange: (active: boolean) => void;
}>) {
  const offset = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const current = useRef({ index, count, onChange, onGestureChange, reduced });
  current.current = { index, count, onChange, onGestureChange, reduced };
  const responder = useMemo(() => {
    const reset = () => {
      current.current.onGestureChange(false);
      if (current.current.reduced) offset.setValue(0);
      else
        Animated.spring(offset, {
          toValue: 0,
          damping: 24,
          stiffness: 300,
          mass: 0.7,
          useNativeDriver: Platform.OS !== "web",
        }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.numberActiveTouches === 1 &&
        isHorizontalSwipe(gesture.dx, gesture.dy),
      onPanResponderGrant: () => {
        offset.stopAnimation();
        current.current.onGestureChange(true);
      },
      onPanResponderMove: (_, gesture) => {
        if (!current.current.reduced)
          offset.setValue(Math.max(-40, Math.min(40, gesture.dx * 0.3)));
      },
      onPanResponderRelease: (_, gesture) => {
        const state = current.current;
        const next = swipeDestination(
          state.index,
          state.count,
          gesture.dx,
          gesture.dy,
          gesture.vx,
        );
        if (next !== state.index) state.onChange(next);
        reset();
      },
      onPanResponderTerminate: reset,
      onPanResponderTerminationRequest: () => true,
    });
  }, [offset]);
  useEffect(
    () => () => {
      offset.stopAnimation();
      current.current.onGestureChange(false);
    },
    [offset],
  );
  return (
    <Animated.View
      {...responder.panHandlers}
      style={{ minHeight: 220, transform: [{ translateX: offset }] }}
    >
      {children}
    </Animated.View>
  );
}

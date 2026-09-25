import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  Text,
} from "react-native";

/** Focus a sheet heading; native presentation timing is handled by onShow too. */
export function useSheetFocus(visible: boolean, title: string) {
  const heading = useRef<Text>(null);
  const focus = () => {
    if (!visible) return;
    if (Platform.OS === "web") {
      (heading.current as unknown as { focus?: () => void })?.focus?.();
    } else {
      const tag = findNodeHandle(heading.current);
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }
  };
  useEffect(() => {
    if (!visible) return;
    const previous = Platform.OS === "web" ? document.activeElement : null;
    const timer = setTimeout(focus, 120);
    return () => {
      clearTimeout(timer);
      if (
        Platform.OS === "web" &&
        previous instanceof HTMLElement &&
        previous.isConnected
      )
        previous.focus();
    };
    // The sheet's identity is its title; switching an embedded editor refocuses it.
  }, [visible, title]);
  return { heading, focus };
}

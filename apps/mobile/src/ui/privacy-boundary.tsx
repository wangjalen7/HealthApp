import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import { colors } from "./theme";

const PrivacyContext = createContext(false);

export function useContentLocked() {
  return useContext(PrivacyContext);
}

/** Conceal private content without resetting its navigation or draft state. */
export function PrivacyBoundary({
  locked,
  children,
  lockScreen,
}: {
  locked: boolean;
  children: ReactNode;
  lockScreen: ReactNode;
}) {
  useEffect(() => {
    if (locked) Keyboard.dismiss();
  }, [locked]);

  return (
    <PrivacyContext.Provider value={locked}>
      <View style={styles.container}>
        <View
          style={[styles.container, locked && styles.concealed]}
          pointerEvents={locked ? "none" : "auto"}
          accessibilityElementsHidden={locked}
          importantForAccessibility={locked ? "no-hide-descendants" : "auto"}
          {...(Platform.OS === "web"
            ? { inert: locked, "aria-hidden": locked }
            : {})}
        >
          {children}
        </View>
        {locked ? (
          <View style={styles.cover} accessibilityViewIsModal>
            {lockScreen}
          </View>
        ) : null}
      </View>
    </PrivacyContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  concealed: { opacity: 0 },
  cover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
  },
});

import { forwardRef } from "react";
import { ScrollView, StyleSheet, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "./theme";

export const ScreenScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function ScreenScrollView({ contentContainerStyle, style, ...props }, ref) {
    const insets = useSafeAreaInsets();
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        {...props}
        ref={ref}
        contentInsetAdjustmentBehavior="never"
        style={[{ backgroundColor: colors.background }, style]}
        contentContainerStyle={[
          styles.content,
          contentContainerStyle,
          { paddingTop: insets.top + 20, paddingBottom: 32 + insets.bottom },
        ]}
      />
    );
  },
);

const styles = StyleSheet.create({
  content: { alignSelf: "center", flexGrow: 1, maxWidth: 760, width: "100%" },
});

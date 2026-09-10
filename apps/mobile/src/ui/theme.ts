import { StyleSheet } from "react-native";

export const colors = {
  background: "#F2F2F7",
  surface: "#FFFFFF",
  text: "#1C1C1E",
  secondary: "#636366",
  tertiary: "#737378",
  separator: "#E5E5EA",
  fill: "#EAEAEE",
  blue: "#007AFF",
  blueSoft: "#EAF3FF",
  green: "#248A3D",
  orange: "#B95000",
  pink: "#D93059",
  purple: "#8854D0",
  teal: "#087F8C",
} as const;

export const surfaces = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderCurve: "continuous",
    borderColor: colors.separator,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1,
  },
});

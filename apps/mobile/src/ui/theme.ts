import { StyleSheet } from "react-native";

import { adaptiveColor as adaptive } from "./adaptive-color";

export const colors = {
  background: adaptive("#F2F2F7", "#000000"),
  surface: adaptive("#FFFFFF", "#1C1C1E"),
  text: adaptive("#1C1C1E", "#F2F2F7"),
  secondary: adaptive("#636366", "#AEAEB2"),
  tertiary: adaptive("#737378", "#8E8E93"),
  separator: adaptive("#E5E5EA", "#38383A"),
  fill: adaptive("#EAEAEE", "#2C2C2E"),
  blue: adaptive("#007AFF", "#0A84FF"),
  blueSoft: adaptive("#EAF3FF", "#102A43"),
  green: adaptive("#248A3D", "#30D158"),
  greenSoft: adaptive("#E8F5EE", "#16351F"),
  orange: adaptive("#B95000", "#FF9F0A"),
  orangeSoft: adaptive("#FFF3D6", "#3A2915"),
  pink: adaptive("#D93059", "#FF375F"),
  pinkSoft: adaptive("#FFF0E5", "#3A2015"),
  purple: adaptive("#8854D0", "#BF5AF2"),
  teal: adaptive("#087F8C", "#64D2FF"),
  danger: adaptive("#B42318", "#FF453A"),
  dangerSoft: adaptive("#FDECEC", "#3A1715"),
  onAccent: "#FFFFFF",
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

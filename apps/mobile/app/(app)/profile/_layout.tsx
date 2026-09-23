import { Stack } from "expo-router";
import { useReducedMotion } from "../../../src/ui/motion";
import { colors } from "../../../src/ui/profile-theme";
export default function ProfileLayout() {
  const reduced = useReducedMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduced ? "none" : "slide_from_right",
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}

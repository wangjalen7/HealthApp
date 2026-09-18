import { DynamicColorIOS } from "react-native";

export function adaptiveColor(light: string, dark: string): string {
  return DynamicColorIOS({ light, dark }) as unknown as string;
}

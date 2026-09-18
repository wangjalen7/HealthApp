export const appearancePreferences = ["system", "light", "dark"] as const;
export type AppearancePreference = (typeof appearancePreferences)[number];

export function parseAppearancePreference(
  value: string | null | undefined,
): AppearancePreference {
  return appearancePreferences.includes(value as AppearancePreference)
    ? (value as AppearancePreference)
    : "system";
}

export function resolveAppearancePreference(
  preference: AppearancePreference,
  deviceScheme: "light" | "dark" | "unspecified" | null | undefined,
): "light" | "dark" {
  if (preference !== "system") return preference;
  return deviceScheme === "dark" ? "dark" : "light";
}

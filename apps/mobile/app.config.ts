import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const isDevelopment = process.env.APP_VARIANT === "development";

  return {
    ...config,
    name: isDevelopment ? "HealthApp Dev" : "HealthApp",
    slug: config.slug ?? "healthapp",
    scheme: isDevelopment ? "healthapp-dev" : "healthapp",
    ios: {
      ...config.ios,
      bundleIdentifier: isDevelopment
        ? "com.jalen.healthapp.dev"
        : "com.jalen.healthapp",
    },
  };
};

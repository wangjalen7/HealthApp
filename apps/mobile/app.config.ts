import type { ConfigContext, ExpoConfig } from "expo/config";
import legalRelease from "../../legal/release.json";
import legalPolicies from "../../legal/policies.json";

export default ({ config }: ConfigContext): ExpoConfig => {
  const isDevelopment = process.env.APP_VARIANT === "development";
  if (
    process.env.EAS_BUILD_PROFILE === "production" &&
    (legalPolicies.some((p) =>
      p.sections.some((s) => /draft/i.test(s.heading)),
    ) ||
      legalRelease.status !== "approved" ||
      !legalRelease.operatorName ||
      !legalRelease.privacyEmail ||
      !legalRelease.supportEmail ||
      !legalRelease.publicBaseUrl ||
      !legalRelease.effectiveDate ||
      !legalRelease.minimumAge ||
      !legalRelease.monetization ||
      !legalRelease.operatorLocation ||
      !legalRelease.launchCountries.length ||
      !legalRelease.legalReviewCompleted ||
      !legalRelease.providerReviewCompleted ||
      !legalRelease.deviceReviewCompleted)
  )
    throw Error(
      "Public release is blocked: complete and review legal/release.json before a production build. Development and preview builds remain available.",
    );

  return {
    ...config,
    // Native builds are the release mechanism until EAS Update is deliberately configured.
    updates: { ...config.updates, enabled: false },
    name: isDevelopment ? "Sustain Dev" : "Sustain",
    slug: config.slug ?? "healthapp",
    scheme: isDevelopment ? "healthapp-dev" : "healthapp",
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: isDevelopment,
          ...(isDevelopment ? { NSAllowsLocalNetworking: true } : {}),
        },
      },
      bundleIdentifier: isDevelopment
        ? "com.jalen.healthapp.dev"
        : "com.jalen.healthapp",
    },
  };
};

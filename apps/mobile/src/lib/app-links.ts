const defaultAppScheme = "healthapp";
const schemePattern = /^[a-z][a-z0-9+.-]*$/i;

export function appScheme(
  configuredScheme = process.env.EXPO_PUBLIC_APP_SCHEME,
): string {
  const scheme = configuredScheme?.trim();
  return scheme && schemePattern.test(scheme) ? scheme : defaultAppScheme;
}

export function authRedirectUrl(
  path: "sign-in" | "reset-password",
  configuredScheme = process.env.EXPO_PUBLIC_APP_SCHEME,
): string {
  return `${appScheme(configuredScheme)}://${path}`;
}

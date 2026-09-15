/** The Quick Log form sheet is above the authenticated tab navigator. */
export function shouldDismissQuickLogForBiometricLock(
  biometricLocked: boolean,
  pathname: string,
): boolean {
  return biometricLocked && pathname === "/create";
}

/** Keep password fallback local to the authenticated app and out of auth/modals. */
export function biometricPasswordReturnPath(pathname: string): string {
  const normalized = pathname.trim();
  if (normalized === "/(app)" || normalized.startsWith("/(app)/"))
    return normalized;
  const root = `/${normalized.split("/").filter(Boolean)[0] ?? ""}`;
  const authenticatedRoots = new Set([
    "/",
    "/coach",
    "/history",
    "/nutrition",
    "/profile",
    "/reminders",
    "/track",
    "/water",
    "/weight",
    "/workout",
  ]);
  return normalized.startsWith("/") &&
    !normalized.startsWith("//") &&
    authenticatedRoots.has(root)
    ? normalized
    : "/(app)";
}

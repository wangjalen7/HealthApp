/** The Quick Log form sheet is above the authenticated tab navigator. */
export function shouldDismissQuickLogForBiometricLock(
  biometricLocked: boolean,
  pathname: string,
): boolean {
  return biometricLocked && pathname === "/create";
}

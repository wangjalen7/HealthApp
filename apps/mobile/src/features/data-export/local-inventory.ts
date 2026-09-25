/** Deliberate allowlist: never sweep credential, deletion-capability or session keys. */
export function exportableDeviceKey(key: string, user: string): boolean {
  if (!key.split(/[:.]/).includes(user)) return false;
  return [
    "healthapp:summary-layout:",
    "healthapp:routines:",
    "healthapp:workout-preferences:",
    "healthapp:goal-helper-draft:",
    "healthapp:pending-write:",
    "healthapp:setup-write:",
    "healthapp:goal-write:",
  ].some((prefix) => key.startsWith(prefix));
}

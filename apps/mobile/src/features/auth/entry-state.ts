export type EntryKind = "manual" | "biometric" | "unlock" | "restore";
export type EntryPhase =
  "idle" | "authenticating" | "resolving" | "entering" | "error";
export type EntryAttempt = {
  id: number;
  kind: EntryKind;
  phase: EntryPhase;
  fallback: string;
  userId?: string;
};
export function completeAttempt(
  current: EntryAttempt | undefined,
  id: number,
  userId: string,
): EntryAttempt | undefined {
  return current?.id === id && current.phase === "authenticating"
    ? { ...current, phase: "resolving", userId }
    : current;
}
export function entryCanResolve(
  attempt: EntryAttempt | undefined,
  auth: { userId?: string; loading: boolean; locked: boolean },
  setupReady: boolean,
) {
  return Boolean(
    attempt &&
    ["resolving", "entering"].includes(attempt.phase) &&
    attempt.userId === auth.userId &&
    !auth.loading &&
    !auth.locked &&
    setupReady,
  );
}
export const entryRoutePath = (path: string) =>
  path.replace(/^\/\(app\)/, "").replace(/^\/\(auth\)/, "") || "/";

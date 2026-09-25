const listeners = new Map<string, Set<() => void>>();
export function observeDraftReset(user: string | undefined, reset: () => void) {
  if (!user) return () => {};
  const account = listeners.get(user) ?? new Set<() => void>();
  listeners.set(user, account);
  account.add(reset);
  return () => {
    account.delete(reset);
    if (!account.size) listeners.delete(user);
  };
}
export function resetMountedDrafts(user: string) {
  for (const reset of listeners.get(user) ?? []) reset();
}

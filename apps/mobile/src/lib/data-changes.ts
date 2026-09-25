type Listener = (user: string, table: string) => void;
const listeners = new Set<Listener>();
export function notifyDataChanged(user: string, table: string) {
  listeners.forEach((listener) => {
    // A refresh listener must never turn an accepted server write into a failed save.
    try {
      listener(user, table);
    } catch {
      /* The next focus refresh reconciles it. */
    }
  });
}
export function subscribeDataChanges(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

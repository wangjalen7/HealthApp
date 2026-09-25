import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createResourceStore } from "./resource-store";

export function useResource<T>(
  key: string,
  read: () => Promise<T>,
  enabled = true,
) {
  const store = useRef<ReturnType<typeof createResourceStore<T>> | null>(null);
  if (!store.current) store.current = createResourceStore<T>();
  const source = store.current;
  const reader = useRef({ key, read });
  reader.current = { key, read };
  const state = useSyncExternalStore(
    source.subscribe,
    () => source.get(key),
    () => source.get(key),
  );
  const refresh = useCallback(
    (invalidate = false) => {
      if (!enabled || reader.current.key !== key) return Promise.resolve();
      // Capture the current reader so an old key never executes another account/day's read.
      const current = reader.current.read;
      return source.load(key, current, invalidate);
    },
    [enabled, key, source],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const setData = useCallback(
    (update: (previous: T | undefined) => T) => source.update(key, update),
    [key, source],
  );
  return { ...state, refresh, setData };
}

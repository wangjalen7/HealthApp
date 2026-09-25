export type ResourceState<T> = { data?: T; loading: boolean; error?: string };

/** One screen-owned store. Keys include account and any date/range dependencies. */
export function createResourceStore<T>() {
  const states = new Map<string, ResourceState<T>>();
  const running = new Map<string, Promise<void>>();
  const invalidated = new Set<string>();
  const listeners = new Set<() => void>();
  const initial: ResourceState<T> = { loading: true };
  const publish = (key: string, state: ResourceState<T>) => {
    states.set(key, state);
    listeners.forEach((listener) => listener());
  };
  return {
    get: (key: string) => states.get(key) ?? initial,
    update(key: string, update: (previous: T | undefined) => T) {
      publish(key, {
        ...states.get(key),
        data: update(states.get(key)?.data),
        loading: false,
      });
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load(
      key: string,
      read: () => Promise<T>,
      invalidate = false,
    ): Promise<void> {
      const pending = running.get(key);
      if (pending) {
        if (invalidate) invalidated.add(key);
        return pending;
      }
      const work = (async () => {
        do {
          invalidated.delete(key);
          publish(key, { ...states.get(key), loading: true, error: undefined });
          try {
            const data = await read();
            // A save during a read requires a new read, not an obsolete intermediate result.
            if (!invalidated.has(key)) publish(key, { data, loading: false });
          } catch (error) {
            if (!invalidated.has(key))
              publish(key, {
                data: states.get(key)?.data,
                loading: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not update. Try again.",
              });
          }
        } while (invalidated.has(key));
      })().finally(() => running.delete(key));
      running.set(key, work);
      return work;
    },
  };
}

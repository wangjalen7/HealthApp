import { layoutSchema, readLayout, type Layout } from "./layout";
export function createLayoutStore(storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}) {
  const writes = new Map<string, Promise<void>>();
  const key = (user: string) => `healthapp:summary-layout:${user}`;
  return {
    async load(user: string) {
      const operation = (writes.get(key(user)) ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
          const result = readLayout(await storage.getItem(key(user)));
          if (result.migrated)
            await storage.setItem(key(user), JSON.stringify(result.layout));
          return result;
        });
      const tail = operation.then(() => undefined);
      writes.set(key(user), tail);
      void tail.then(
        () => {
          if (writes.get(key(user)) === tail) writes.delete(key(user));
        },
        () => {
          if (writes.get(key(user)) === tail) writes.delete(key(user));
        },
      );
      return operation;
    },
    save(user: string, layout: Layout) {
      const json = JSON.stringify(layoutSchema.parse(layout));
      const next = (writes.get(key(user)) ?? Promise.resolve())
        .catch(() => undefined)
        .then(() => storage.setItem(key(user), json));
      writes.set(key(user), next);
      void next.then(
        () => {
          if (writes.get(key(user)) === next) writes.delete(key(user));
        },
        () => {
          if (writes.get(key(user)) === next) writes.delete(key(user));
        },
      );
      return next;
    },
  };
}

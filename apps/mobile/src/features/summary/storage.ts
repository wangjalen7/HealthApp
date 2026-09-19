import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLayoutStore } from "./layout-store";
const writes = new Map<string, Promise<void>>();
export function serializedWrite(
  key: string,
  work: () => Promise<void>,
): Promise<void> {
  const next = (writes.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(work);
  writes.set(key, next);
  void next.then(
    () => {
      if (writes.get(key) === next) writes.delete(key);
    },
    () => {
      if (writes.get(key) === next) writes.delete(key);
    },
  );
  return next;
}
const store = createLayoutStore(AsyncStorage);
export const loadLayout = store.load;
export const saveLayout = store.save;

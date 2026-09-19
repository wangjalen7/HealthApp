import AsyncStorage from "@react-native-async-storage/async-storage";
import type { VitalSample } from "../../domain/vitals";
import { createUuid } from "../../lib/id";
import {
  createVitalStorage,
  emptyVitalState,
  enqueueInto,
  type VitalState,
  type VitalTransaction,
} from "./store-model";

let opening: Promise<IDBDatabase> | undefined;
function database() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("healthapp-vitals-v2", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("accounts");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  return opening;
}
const transact: VitalTransaction = async <T>(
  user: string,
  update: (state: VitalState) => T,
): Promise<T> => {
  // IndexedDB serializes account mutations across browser tabs. Legacy storage
  // errors must propagate instead of silently discarding pending work.
  const [db, legacySamples, legacyQueue] = await Promise.all([
    database(),
    AsyncStorage.getItem("healthapp:vital-samples"),
    AsyncStorage.getItem("healthapp:vital-outbox"),
  ]);
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("accounts", "readwrite");
    const store = tx.objectStore("accounts");
    const read = store.get(user);
    let result: T;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Local save was interrupted; retry."));
    tx.oncomplete = () => resolve(result);
    read.onsuccess = () => {
      try {
        const state: VitalState = read.result ?? emptyVitalState();
        if (!read.result) {
          for (const sample of JSON.parse(
            legacySamples ?? "[]",
          ) as VitalSample[])
            if (sample.userId === user) state.samples[sample.id] = sample;
          for (const op of JSON.parse(legacyQueue ?? "[]") as {
            payload: string;
          }[])
            enqueueInto(
              state,
              (JSON.parse(op.payload) as VitalSample[]).filter(
                (s) => s.userId === user,
              ),
              createUuid,
            );
        }
        result = update(state);
        store.put(state, user);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
  });
};
export const {
  cachedVitals,
  queueVitals,
  queuedChanges,
  prepareChange,
  acceptChange,
  failChange,
  applyRemotePage,
  syncCursor,
  lastVitalSyncAt,
  saveVitalSyncAt,
  resolveConflict,
} = createVitalStorage(transact, createUuid);
export const createId = createUuid;

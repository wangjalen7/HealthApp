import { importHealthKitData, loadHealthKitSyncState } from "./sync";
import { syncVitals } from "../vitals/sync";
const running = new Map<
  string,
  Promise<{ message: string; lastSyncedAt?: string }>
>();
const status = new Map<string, string>();
export const healthSyncStatus = (user: string) => status.get(user) ?? "";
export function synchronizeHealthData(user: string, configured = true) {
  const previous = running.get(user);
  if (previous) return previous;
  const operation = (async () => {
    if (!configured)
      return { message: "Saved on this device. Supabase is not configured." };
    const state = await loadHealthKitSyncState(user);
    let importError = "";
    if (state.connected) {
      try {
        const imported = await importHealthKitData(user);
        return {
          lastSyncedAt: imported.lastImportedAt,
          message: `Sync complete. ${imported.weightCount + imported.bloodPressureCount} Apple Health readings imported.`,
        };
      } catch (error) {
        importError =
          error instanceof Error ? error.message : "Import unavailable.";
      }
    }
    const result = await syncVitals(user);
    return {
      lastSyncedAt: result.lastSyncedAt,
      message: result.error
        ? `Sync waiting: ${result.error}`
        : importError
          ? `Synced account data. Apple Health needs attention: ${importError}`
          : "Sync complete.",
    };
  })()
    .then((result) => {
      status.set(user, result.message);
      return result;
    })
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Could not sync. Try again.";
      status.set(user, message);
      return { message };
    })
    .finally(() => running.delete(user));
  running.set(user, operation);
  return operation;
}

export async function drainHealthSync(user: string) {
  await running.get(user);
  status.delete(user);
}

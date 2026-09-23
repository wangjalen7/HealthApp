import AsyncStorage from "@react-native-async-storage/async-storage";
import { cachedVitals, queuedChanges } from "../vitals/storage";
import { loadLastVitalSyncAt } from "../vitals/sync";
import {
  healthSyncStatus,
  healthSyncInProgress,
} from "../healthkit/unified-sync";
import type { PendingMutation } from "../../lib/mutation-model";

export async function loadPendingData(userId: string) {
  const [operations, readings, keys, last] = await Promise.all([
    queuedChanges(userId),
    cachedVitals(userId),
    AsyncStorage.getAllKeys(),
    loadLastVitalSyncAt(userId),
  ]);
  const values = await AsyncStorage.multiGet(
    keys.filter((key) =>
      key.startsWith(`healthapp:pending-write:v2:${userId}:`),
    ),
  );
  const online = values.flatMap(([key, value]) =>
    value ? [{ key, operation: JSON.parse(value) as PendingMutation }] : [],
  );
  const setupPending = keys.includes(`healthapp:setup-write:${userId}`);
  const count =
    operations.length +
    online.filter((item) => !item.operation.completed).length +
    (setupPending ? 1 : 0);
  const issue = healthSyncStatus(userId);
  const attention = Boolean(
    count ||
    operations.some((op) => op.conflict) ||
    (issue && !issue.startsWith("Sync complete.")),
  );
  return {
    operations,
    readings,
    online,
    last,
    count,
    setupPending,
    attention,
    issue,
    syncing: healthSyncInProgress(userId),
  };
}
export type PendingData = Awaited<ReturnType<typeof loadPendingData>>;
export function syncLabel(data?: PendingData) {
  if (!data) return "Checking";
  if (data.syncing) return "Syncing";
  if (data.count) return `${data.count} pending`;
  if (data.attention) return "Needs attention";
  return data.last ? "Up to Date" : "Not synced yet";
}

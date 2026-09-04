import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

import type { HealthKitSyncState } from "./types";

const stateSchema = z.object({
  connected: z.boolean(),
  anchors: z.object({
    weight: z.string().optional(),
    bloodPressure: z.string().optional(),
  }),
  pulseBackfillCompleted: z.boolean().optional(),
  lastImportedAt: z.string().datetime().optional(),
});

const stateKey = (userId: string): string => `healthapp:healthkit:${userId}`;
const emptyState = (): HealthKitSyncState => ({
  connected: false,
  anchors: {},
});

export async function loadHealthKitSyncState(
  userId: string,
): Promise<HealthKitSyncState> {
  try {
    const value = await AsyncStorage.getItem(stateKey(userId));
    if (!value) return emptyState();
    return stateSchema.parse(JSON.parse(value));
  } catch {
    return emptyState();
  }
}

export async function saveHealthKitSyncState(
  userId: string,
  state: HealthKitSyncState,
): Promise<void> {
  await AsyncStorage.setItem(
    stateKey(userId),
    JSON.stringify(stateSchema.parse(state)),
  );
}

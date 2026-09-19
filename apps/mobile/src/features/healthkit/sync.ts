import type { VitalSample } from "../../domain/vitals";
import {
  loadCachedVitals,
  queueLocalVitals,
  syncVitals,
  markVitalsDeleted,
} from "../vitals/sync";
import { healthKitRecordId } from "./identity";
import {
  healthKitAvailability,
  readHealthKitData,
  requestHealthKitAuthorization,
} from "./reader";
import { loadHealthKitSyncState, saveHealthKitSyncState } from "./state";
import type { HealthKitImportResult, HealthKitSyncState } from "./types";

export { healthKitAvailability } from "./reader";
export { loadHealthKitSyncState } from "./state";

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export async function connectHealthKit(
  userId: string,
): Promise<HealthKitSyncState> {
  const availability = await healthKitAvailability();
  if (!availability.available)
    throw new Error(availability.reason ?? "Apple Health is unavailable.");
  await requestHealthKitAuthorization();
  const state = await loadHealthKitSyncState(userId);
  const connectedState: HealthKitSyncState = { ...state, connected: true };
  await saveHealthKitSyncState(userId, connectedState);
  return connectedState;
}

async function tombstoneVitalIds(
  userId: string,
  ids: string[],
  deletedAt: string,
): Promise<void> {
  if (!ids.length) return;
  const matches = (await loadCachedVitals(userId)).filter(
    (sample) =>
      sample.source === "healthkit" &&
      unique(ids).includes(sample.id) &&
      !sample.deletedAt,
  );
  await markVitalsDeleted(matches.map((sample) => ({ ...sample, deletedAt })));
}

export async function importHealthKitData(
  userId: string,
): Promise<HealthKitImportResult> {
  const availability = await healthKitAvailability();
  if (!availability.available)
    throw new Error(availability.reason ?? "Apple Health is unavailable.");

  const initialSync = await syncVitals(userId);
  if (initialSync.error)
    throw new Error(
      `Database sync failed before Apple Health import: ${initialSync.error}`,
    );

  const state = await loadHealthKitSyncState(userId);
  const batch = await readHealthKitData(state.anchors, {
    backfillBloodPressure: !state.pulseBackfillCompleted,
  });
  const now = new Date().toISOString();
  const cached = await loadCachedVitals(userId);
  const hiddenIds = new Set(cached.map((sample) => sample.id));
  const samples: VitalSample[] = batch.vitals
    .map((reading) => {
      const id = healthKitRecordId(userId, reading.kind, reading.externalId);
      const correlationId = reading.correlationExternalId
        ? healthKitRecordId(
            userId,
            "blood-pressure",
            reading.correlationExternalId,
          )
        : undefined;
      return {
        id,
        userId,
        kind: reading.kind,
        value: reading.value,
        unit: reading.unit,
        occurredAt: reading.occurredAt,
        correlationId,
        source: "healthkit" as const,
        externalId: reading.externalId,
        sourceName: reading.sourceName,
        createdAt: now,
      };
    })
    .filter((sample) => !hiddenIds.has(sample.id));

  const deletedVitalIds = [
    ...batch.deletedWeightExternalIds.map((id) =>
      healthKitRecordId(userId, "weight", id),
    ),
    ...batch.deletedBloodPressureExternalIds.flatMap((id) => [
      healthKitRecordId(userId, "systolic_bp", id),
      healthKitRecordId(userId, "diastolic_bp", id),
    ]),
  ];
  await tombstoneVitalIds(userId, deletedVitalIds, now);
  if (samples.length) await queueLocalVitals(samples);
  const vitalSync = await syncVitals(userId);
  if (vitalSync.error)
    throw new Error(
      `Apple Health vitals are queued, but database sync failed: ${vitalSync.error}`,
    );

  const nextState: HealthKitSyncState = {
    connected: true,
    anchors: batch.anchors,
    pulseBackfillCompleted: true,
    lastImportedAt: now,
  };
  await saveHealthKitSyncState(userId, nextState);
  return {
    weightCount: samples.filter((sample) => sample.kind === "weight").length,
    bloodPressureCount: samples.filter(
      (sample) => sample.kind === "systolic_bp",
    ).length,
    lastImportedAt: now,
  };
}

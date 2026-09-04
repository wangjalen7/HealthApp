import type { VitalKind } from "../../domain/vitals";

export type HealthKitAnchors = {
  weight?: string;
  bloodPressure?: string;
};

export type HealthKitVitalReading = {
  externalId: string;
  correlationExternalId?: string;
  kind: VitalKind;
  value: number;
  unit: string;
  occurredAt: string;
  sourceName?: string;
};

export type HealthKitReadBatch = {
  anchors: HealthKitAnchors;
  vitals: HealthKitVitalReading[];
  deletedWeightExternalIds: string[];
  deletedBloodPressureExternalIds: string[];
};

export type HealthKitAvailability = {
  available: boolean;
  reason?: string;
};

export type HealthKitSyncState = {
  connected: boolean;
  anchors: HealthKitAnchors;
  pulseBackfillCompleted?: boolean;
  lastImportedAt?: string;
};

export type HealthKitImportResult = {
  weightCount: number;
  bloodPressureCount: number;
  lastImportedAt: string;
};

import type { QuantitySample } from "@kingstinct/react-native-healthkit";
import { TurboModuleRegistry } from "react-native";

import { pressureInMmHg } from "./mapping";
import { healthKitReadAuthorizationTypes } from "./permissions";
import type {
  HealthKitAnchors,
  HealthKitAvailability,
  HealthKitReadBatch,
  HealthKitVitalReading,
} from "./types";

type HealthKitModule = typeof import("@kingstinct/react-native-healthkit");
let modulePromise: Promise<HealthKitModule> | undefined;

const missingNativeModuleMessage =
  "This installed app does not contain HealthKit yet. Delete it and install the latest HealthKit-enabled EAS development build; do not open this project in Expo Go.";

function hasNitroModules(): boolean {
  return TurboModuleRegistry.get("NitroModules") !== null;
}

const loadHealthKit = (): Promise<HealthKitModule> => {
  if (!hasNitroModules())
    return Promise.reject(new Error(missingNativeModuleMessage));
  modulePromise ??= import("@kingstinct/react-native-healthkit");
  return modulePromise;
};

function sourceName(sample: {
  sourceRevision?: { source?: { name?: unknown } };
}): string | undefined {
  const value = sample.sourceRevision?.source?.name;
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  if (!name || name === "SourceProxy" || name.endsWith(".SourceProxy"))
    return undefined;
  return name;
}

function isQuantitySample(value: unknown): value is QuantitySample {
  return (
    typeof value === "object" &&
    value !== null &&
    "quantityType" in value &&
    "quantity" in value
  );
}

async function pulseNearBloodPressure(
  healthKit: HealthKitModule,
  correlation: {
    startDate: Date;
    sourceRevision?: { source?: { name?: unknown } };
  },
): Promise<QuantitySample | undefined> {
  const readingTime = correlation.startDate.getTime();
  const startDate = new Date(readingTime - 2 * 60 * 1000);
  const endDate = new Date(readingTime + 2 * 60 * 1000);
  const pulseSamples = await healthKit.queryQuantitySamples(
    "HKQuantityTypeIdentifierHeartRate",
    {
      filter: { date: { startDate, endDate } },
      limit: 12,
      ascending: true,
      unit: "count/min",
    },
  );
  const correlationSource = sourceName(correlation)?.toLocaleLowerCase();
  const validSamples = pulseSamples.filter(
    (sample) => Number.isFinite(sample.quantity) && sample.quantity > 0,
  );
  const sameSource = correlationSource
    ? validSamples.filter(
        (sample) =>
          sourceName(sample)?.toLocaleLowerCase() === correlationSource,
      )
    : [];
  return (sameSource.length ? sameSource : validSamples).sort(
    (left, right) =>
      Math.abs(left.startDate.getTime() - readingTime) -
      Math.abs(right.startDate.getTime() - readingTime),
  )[0];
}

export async function healthKitAvailability(): Promise<HealthKitAvailability> {
  if (!hasNitroModules()) {
    return { available: false, reason: missingNativeModuleMessage };
  }
  try {
    const healthKit = await loadHealthKit();
    const available = await healthKit.isHealthDataAvailableAsync();
    return available
      ? { available: true }
      : {
          available: false,
          reason: "Apple Health is not available on this device.",
        };
  } catch {
    return {
      available: false,
      reason: missingNativeModuleMessage,
    };
  }
}

export async function requestHealthKitAuthorization(): Promise<void> {
  const healthKit = await loadHealthKit();
  if (!(await healthKit.isHealthDataAvailableAsync())) {
    throw new Error("Apple Health is not available on this device.");
  }
  await healthKit.requestAuthorization({
    toRead: [...healthKitReadAuthorizationTypes],
  });
}

export async function readHealthKitData(
  anchors: HealthKitAnchors,
  options?: { backfillBloodPressure?: boolean },
): Promise<HealthKitReadBatch> {
  const healthKit = await loadHealthKit();
  if (!(await healthKit.isHealthDataAvailableAsync())) {
    throw new Error("Apple Health is not available on this device.");
  }
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  const dateFilter = { date: { startDate } };
  const weights = await healthKit.queryQuantitySamplesWithAnchor(
    "HKQuantityTypeIdentifierBodyMass",
    {
      anchor: anchors.weight,
      filter: dateFilter,
      limit: 0,
      unit: "lb",
    },
  );
  const bloodPressure = await healthKit.queryCorrelationSamplesWithAnchor(
    "HKCorrelationTypeIdentifierBloodPressure",
    {
      anchor: options?.backfillBloodPressure
        ? undefined
        : anchors.bloodPressure,
      filter: dateFilter,
      limit: 0,
    },
  );
  const vitals: HealthKitVitalReading[] = weights.samples
    .filter((sample) => Number.isFinite(sample.quantity) && sample.quantity > 0)
    .map((sample) => ({
      externalId: sample.uuid,
      kind: "weight" as const,
      value: Math.round(sample.quantity * 100) / 100,
      unit: "lb",
      occurredAt: sample.startDate.toISOString(),
      sourceName: sourceName(sample),
    }));
  const importedPulseIds = new Set<string>();
  for (const correlation of bloodPressure.correlations) {
    const quantities = correlation.objects.filter(isQuantitySample);
    const systolic = quantities.find(
      (sample) =>
        sample.quantityType === "HKQuantityTypeIdentifierBloodPressureSystolic",
    );
    const diastolic = quantities.find(
      (sample) =>
        sample.quantityType ===
        "HKQuantityTypeIdentifierBloodPressureDiastolic",
    );
    if (!systolic || !diastolic) continue;
    const occurredAt = correlation.startDate.toISOString();
    const shared = {
      externalId: correlation.uuid,
      correlationExternalId: correlation.uuid,
      occurredAt,
      sourceName: sourceName(correlation),
    };
    vitals.push({
      ...shared,
      kind: "systolic_bp",
      value:
        Math.round(pressureInMmHg(systolic.quantity, systolic.unit) * 100) /
        100,
      unit: "mmHg",
    });
    vitals.push({
      ...shared,
      kind: "diastolic_bp",
      value:
        Math.round(pressureInMmHg(diastolic.quantity, diastolic.unit) * 100) /
        100,
      unit: "mmHg",
    });
    const pulse = await pulseNearBloodPressure(healthKit, correlation);
    if (pulse && !importedPulseIds.has(pulse.uuid)) {
      importedPulseIds.add(pulse.uuid);
      vitals.push({
        externalId: pulse.uuid,
        kind: "pulse",
        value: Math.round(pulse.quantity),
        unit: "bpm",
        occurredAt: pulse.startDate.toISOString(),
        sourceName: sourceName(pulse),
      });
    }
  }
  return {
    anchors: {
      weight: weights.newAnchor,
      bloodPressure: bloodPressure.newAnchor,
    },
    vitals,
    deletedWeightExternalIds: weights.deletedSamples.map(
      (sample) => sample.uuid,
    ),
    deletedBloodPressureExternalIds: bloodPressure.deletedSamples.map(
      (sample) => sample.uuid,
    ),
  };
}

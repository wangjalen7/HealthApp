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
      anchor: anchors.bloodPressure,
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

import type {
  HealthKitAnchors,
  HealthKitAvailability,
  HealthKitReadBatch,
} from "./types";

export async function healthKitAvailability(): Promise<HealthKitAvailability> {
  return {
    available: false,
    reason: "Apple Health is only available in the iPhone app.",
  };
}

export async function requestHealthKitAuthorization(): Promise<void> {
  throw new Error("Apple Health is only available in the iPhone app.");
}

export async function readHealthKitData(
  anchors: HealthKitAnchors,
  options?: { backfillBloodPressure?: boolean },
): Promise<HealthKitReadBatch> {
  void anchors;
  void options;
  throw new Error("Apple Health is only available in the iPhone app.");
}

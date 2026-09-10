import type { VitalSample } from "../../domain/vitals";

const maxPulseDistanceMs = 2 * 60 * 1000;

function normalizedSourceName(sample: VitalSample): string | undefined {
  const value = sample.sourceName?.trim().toLocaleLowerCase();
  return value || undefined;
}

/**
 * HealthKit does not place heart rate inside the blood-pressure correlation.
 * Prefer the same source, then the nearest imported HealthKit pulse within two
 * minutes. Apple Health sometimes assigns different source labels to values
 * that were recorded together by one blood-pressure device.
 */
export function pulseForBloodPressure(
  systolic: VitalSample,
  samples: VitalSample[],
): VitalSample | undefined {
  if (systolic.source === "manual") {
    return systolic.correlationId
      ? samples.find(
          (sample) =>
            sample.kind === "pulse" &&
            sample.source === "manual" &&
            sample.userId === systolic.userId &&
            !sample.deletedAt &&
            sample.correlationId === systolic.correlationId,
        )
      : undefined;
  }
  if (systolic.source !== "healthkit") return undefined;
  const readingTime = new Date(systolic.occurredAt).getTime();
  const sourceName = normalizedSourceName(systolic);
  return samples
    .filter(
      (sample) =>
        sample.kind === "pulse" &&
        sample.source === "healthkit" &&
        sample.userId === systolic.userId &&
        !sample.deletedAt &&
        Math.abs(new Date(sample.occurredAt).getTime() - readingTime) <=
          maxPulseDistanceMs,
    )
    .sort((left, right) => {
      const leftSourcePenalty =
        sourceName && normalizedSourceName(left) !== sourceName ? 1 : 0;
      const rightSourcePenalty =
        sourceName && normalizedSourceName(right) !== sourceName ? 1 : 0;
      if (leftSourcePenalty !== rightSourcePenalty)
        return leftSourcePenalty - rightSourcePenalty;
      const leftDistance = Math.abs(
        new Date(left.occurredAt).getTime() - readingTime,
      );
      const rightDistance = Math.abs(
        new Date(right.occurredAt).getTime() - readingTime,
      );
      return leftDistance - rightDistance;
    })[0];
}

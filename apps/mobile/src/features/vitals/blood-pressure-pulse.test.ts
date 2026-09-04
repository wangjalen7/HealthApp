import assert from "node:assert/strict";
import test from "node:test";

import type { VitalSample } from "../../domain/vitals";
import { pulseForBloodPressure } from "./blood-pressure-pulse";

function sample(
  id: string,
  kind: VitalSample["kind"],
  occurredAt: string,
  sourceName = "Omron",
): VitalSample {
  return {
    id,
    userId: "user-1",
    kind,
    value: kind === "pulse" ? 68 : 122,
    unit: kind === "pulse" ? "bpm" : "mmHg",
    occurredAt,
    source: "healthkit",
    sourceName,
    createdAt: occurredAt,
  };
}

test("pairs a nearby pulse from the same HealthKit source", () => {
  const reading = sample("systolic", "systolic_bp", "2026-09-04T09:00:00.000Z");
  const pulse = sample("pulse", "pulse", "2026-09-04T09:01:00.000Z");
  assert.equal(pulseForBloodPressure(reading, [pulse])?.id, "pulse");
});

test("prefers the same-source pulse, but permits a same-time fallback", () => {
  const reading = sample("systolic", "systolic_bp", "2026-09-04T09:00:00.000Z");
  assert.equal(
    pulseForBloodPressure(reading, [
      sample("watch", "pulse", "2026-09-04T09:00:30.000Z", "Apple Watch"),
      sample("omron", "pulse", "2026-09-04T09:01:00.000Z"),
    ])?.id,
    "omron",
  );
});

test("uses a same-time fallback pulse but never attaches a distant pulse", () => {
  const reading = sample("systolic", "systolic_bp", "2026-09-04T09:00:00.000Z");
  assert.equal(
    pulseForBloodPressure(reading, [
      sample("watch", "pulse", "2026-09-04T09:00:30.000Z", "Apple Watch"),
    ])?.id,
    "watch",
  );
  assert.equal(
    pulseForBloodPressure(reading, [
      sample("late", "pulse", "2026-09-04T09:03:01.000Z"),
    ]),
    undefined,
  );
});

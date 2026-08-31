import assert from "node:assert/strict";
import test from "node:test";

import { healthKitRecordId } from "./identity";

const userId = "2d9bd7f8-a3b4-4af8-9c5b-8c8880bf8f8e";

test("creates stable, user-scoped IDs for HealthKit samples", () => {
  const first = healthKitRecordId(userId, "weight", "healthkit-sample-1");
  assert.equal(
    first,
    healthKitRecordId(userId, "weight", "healthkit-sample-1"),
  );
  assert.notEqual(
    first,
    healthKitRecordId(userId, "systolic_bp", "healthkit-sample-1"),
  );
  assert.match(first, /^[0-9a-f-]{36}$/);
});

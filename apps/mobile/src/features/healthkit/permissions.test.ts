import assert from "node:assert/strict";
import test from "node:test";

import { healthKitReadAuthorizationTypes } from "./permissions";

test("requests blood-pressure quantities without the crashing correlation combination", () => {
  assert.ok(
    healthKitReadAuthorizationTypes.includes(
      "HKQuantityTypeIdentifierBloodPressureSystolic",
    ),
  );
  assert.ok(
    healthKitReadAuthorizationTypes.includes(
      "HKQuantityTypeIdentifierHeartRate",
    ),
  );
  assert.ok(
    healthKitReadAuthorizationTypes.includes(
      "HKQuantityTypeIdentifierBloodPressureDiastolic",
    ),
  );
  assert.equal(
    (healthKitReadAuthorizationTypes as readonly string[]).includes(
      "HKCorrelationTypeIdentifierBloodPressure",
    ),
    false,
  );
  assert.equal(
    (healthKitReadAuthorizationTypes as readonly string[]).includes(
      "HKWorkoutTypeIdentifier",
    ),
    false,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { shouldDismissQuickLogForBiometricLock } from "./biometric-lock-navigation";

test("dismisses Quick Log before presenting the biometric lock", () => {
  assert.equal(shouldDismissQuickLogForBiometricLock(true, "/create"), true);
  assert.equal(shouldDismissQuickLogForBiometricLock(false, "/create"), false);
  assert.equal(
    shouldDismissQuickLogForBiometricLock(true, "/(app)/history"),
    false,
  );
});

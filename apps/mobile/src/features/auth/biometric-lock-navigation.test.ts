import assert from "node:assert/strict";
import test from "node:test";

import {
  biometricPasswordReturnPath,
  shouldDismissQuickLogForBiometricLock,
} from "./biometric-lock-navigation";

test("dismisses Quick Log before presenting the biometric lock", () => {
  assert.equal(shouldDismissQuickLogForBiometricLock(true, "/create"), true);
  assert.equal(shouldDismissQuickLogForBiometricLock(false, "/create"), false);
  assert.equal(
    shouldDismissQuickLogForBiometricLock(true, "/(app)/history"),
    false,
  );
});

test("preserves the authenticated page for password fallback", () => {
  assert.equal(biometricPasswordReturnPath("/workout"), "/workout");
  assert.equal(biometricPasswordReturnPath("/history/abc"), "/history/abc");
  assert.equal(biometricPasswordReturnPath("/create"), "/(app)");
  assert.equal(biometricPasswordReturnPath("//example.com"), "/(app)");
  assert.equal(biometricPasswordReturnPath("/(auth)/sign-in"), "/(app)");
  assert.equal(biometricPasswordReturnPath("/reset-password"), "/(app)");
});

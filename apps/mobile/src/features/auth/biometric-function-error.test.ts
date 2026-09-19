import assert from "node:assert/strict";
import test from "node:test";
import {
  biometricFunctionError,
  faceIdLoginFailure,
} from "./biometric-function-error";

test("reads native response errors without relying on instanceof Response", async () => {
  const native = {
    context: {
      status: 401,
      clone: () => ({
        json: async () => ({ code: "device_upgrade_required" }),
      }),
    },
  };
  const result = faceIdLoginFailure(await biometricFunctionError(native));
  assert.equal(result.invalidCredential, true);
  assert.match(result.message, /Reload or update HealthApp/);
  assert.equal(
    faceIdLoginFailure(
      await biometricFunctionError({ context: { status: 401 } }),
    ).invalidCredential,
    true,
  );
});
test("network errors retain credentials and incomplete session exchange explains recovery", async () => {
  const result = faceIdLoginFailure(
    await biometricFunctionError(new Error("Network failure")),
  );
  assert.equal(result.invalidCredential, undefined);
  assert.match(result.message, /temporarily unavailable/);
  assert.match(
    faceIdLoginFailure({ status: 503, code: "session_unavailable" }).message,
    /enable Face ID again/,
  );
});

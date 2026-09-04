import assert from "node:assert/strict";
import test from "node:test";

import {
  bytesToBase64Url,
  hashDeviceSecret,
  parseBiometricDeviceRequest,
} from "./biometric-device";

const credentialId = "2ecb0193-ec57-4a71-88c0-8ab33edb1034";
const secret = "abcdefghijklmnopqrstuvwxyzABCDEFGH012345678";

test("accepts only bounded biometric device requests", () => {
  assert.deepEqual(parseBiometricDeviceRequest({ action: "enroll" }), {
    action: "enroll",
  });
  assert.deepEqual(
    parseBiometricDeviceRequest({ action: "revoke", credentialId }),
    { action: "revoke", credentialId },
  );
  assert.deepEqual(
    parseBiometricDeviceRequest({
      action: "authenticate",
      credentialId,
      secret,
    }),
    { action: "authenticate", credentialId, secret },
  );
  assert.equal(
    parseBiometricDeviceRequest({
      action: "authenticate",
      credentialId,
      secret: "short",
    }),
    undefined,
  );
});

test("creates URL-safe secrets and stable SHA-256 hashes", async () => {
  const encoded = bytesToBase64Url(new Uint8Array(32).fill(255));
  assert.equal(encoded.length, 43);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.equal(
    await hashDeviceSecret("device-secret"),
    "13dfe07f0da5e88e4e122b2343005c77c4c02a03a52c0a3c4f8dadb533c5b350",
  );
});

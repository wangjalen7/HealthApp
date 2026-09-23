import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBiometricEnrollmentResponse,
  parseBiometricSessionResponse,
  parseFaceIdLoginAccount,
  parseFaceIdLoginCredential,
  parseRememberedLoginAccount,
} from "./biometric-credential";

const credentialId = "2ecb0193-ec57-4a71-88c0-8ab33edb1034";
const secret = "abcdefghijklmnopqrstuvwxyzABCDEFGH012345678";

test("email-only enrollment survives an empty phone field after reopening", () => {
  const stored = {
    credentialId,
    secret,
    email: "person@example.com",
    phone: "",
    userId: "user-1",
    deviceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  };
  const marker = parseFaceIdLoginAccount(JSON.stringify(stored));
  assert.ok(marker);
  const restored = parseFaceIdLoginCredential(JSON.stringify(stored), marker);
  assert.ok(
    restored,
    "the protected credential must match its normalized account marker",
  );
  assert.equal(restored.deviceId, stored.deviceId);
  assert.equal(restored.phone, undefined);
});

test("phone normalization preserves account binding and rejects malformed identities", () => {
  const marker = {
    credentialId,
    email: "person@example.com",
    userId: "user-1",
  };
  for (const phone of [undefined, null, ""])
    assert.ok(
      parseFaceIdLoginCredential(
        JSON.stringify({ ...marker, secret, phone }),
        marker,
      ),
    );
  for (const phone of [false, 123, {}, "invalid", "+15555550123"])
    assert.equal(
      parseFaceIdLoginCredential(
        JSON.stringify({ ...marker, secret, phone }),
        marker,
      ),
      undefined,
    );
  const phoneAccount = { ...marker, phone: "+15555550123" };
  assert.ok(
    parseFaceIdLoginCredential(
      JSON.stringify({ ...phoneAccount, secret }),
      phoneAccount,
    ),
  );
  assert.equal(
    parseFaceIdLoginCredential(
      JSON.stringify({ ...phoneAccount, phone: "+15555550124", secret }),
      phoneAccount,
    ),
    undefined,
  );
  assert.equal(
    parseFaceIdLoginCredential(
      JSON.stringify({ ...marker, email: "other@example.com", secret }),
      marker,
    ),
    undefined,
  );
});

test("parses only complete Face ID account markers", () => {
  assert.deepEqual(
    parseFaceIdLoginAccount(
      JSON.stringify({
        credentialId,
        email: "person@example.com",
        userId: "user-1",
      }),
    ),
    { credentialId, email: "person@example.com", userId: "user-1" },
  );
  assert.equal(parseFaceIdLoginAccount("not-json"), undefined);
  assert.equal(
    parseFaceIdLoginAccount(JSON.stringify({ email: "invalid" })),
    undefined,
  );
});

test("rejects a Face ID credential that does not match its account marker", () => {
  const account = {
    credentialId,
    email: "person@example.com",
    userId: "user-1",
  };
  assert.deepEqual(
    parseFaceIdLoginCredential(JSON.stringify({ ...account, secret }), account),
    { ...account, secret, deviceId: undefined },
  );
  assert.equal(
    parseFaceIdLoginCredential(
      JSON.stringify({
        email: account.email,
        credentialId,
        secret,
        userId: "other-user",
      }),
      account,
    ),
    undefined,
  );
});

test("parses remembered account identity without a secret", () => {
  assert.deepEqual(
    parseRememberedLoginAccount(
      JSON.stringify({ email: "person@example.com", userId: "user-1" }),
    ),
    { email: "person@example.com", userId: "user-1" },
  );
  assert.equal(
    parseRememberedLoginAccount(JSON.stringify({ email: "bad" })),
    undefined,
  );
});

test("validates biometric enrollment and session responses", () => {
  assert.deepEqual(parseBiometricEnrollmentResponse({ credentialId, secret }), {
    credentialId,
    secret,
  });
  assert.equal(
    parseBiometricEnrollmentResponse({ credentialId, secret: "short" }),
    undefined,
  );
  assert.deepEqual(
    parseBiometricSessionResponse({
      nextSecret: secret,
      accessToken: "access",
      refreshToken: "refresh",
      userId: "user-1",
    }),
    {
      accessToken: "access",
      refreshToken: "refresh",
      userId: "user-1",
      nextSecret: secret,
    },
  );
});

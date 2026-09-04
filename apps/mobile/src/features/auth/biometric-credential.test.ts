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
    { ...account, secret },
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
      accessToken: "access",
      refreshToken: "refresh",
      userId: "user-1",
    }),
    { accessToken: "access", refreshToken: "refresh", userId: "user-1" },
  );
});

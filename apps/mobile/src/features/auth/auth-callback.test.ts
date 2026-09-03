import assert from "node:assert/strict";
import test from "node:test";

import {
  authCallbackFromUrl,
  isDuplicateSignUpResponse,
} from "./auth-callback";

test("parses password-recovery tokens from a native deep-link fragment", () => {
  assert.deepEqual(
    authCallbackFromUrl(
      "healthapp://reset-password#access_token=access&refresh_token=refresh&type=recovery",
    ),
    {
      accessToken: "access",
      code: undefined,
      refreshToken: "refresh",
      type: "recovery",
    },
  );
});

test("parses a PKCE callback code from a native deep-link query", () => {
  assert.deepEqual(
    authCallbackFromUrl("healthapp://reset-password?code=callback-code"),
    {
      accessToken: undefined,
      code: "callback-code",
      refreshToken: undefined,
      type: undefined,
    },
  );
});

test("recognizes Supabase's empty-identity duplicate signup response", () => {
  assert.equal(isDuplicateSignUpResponse([]), true);
  assert.equal(isDuplicateSignUpResponse([{}]), false);
  assert.equal(isDuplicateSignUpResponse(undefined), false);
});

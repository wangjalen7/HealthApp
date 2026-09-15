import assert from "node:assert/strict";
import test from "node:test";

import { appScheme, authRedirectUrl } from "./app-links";

test("uses the standalone scheme by default", () => {
  assert.equal(appScheme(""), "healthapp");
  assert.equal(authRedirectUrl("sign-in", ""), "healthapp://sign-in");
});

test("uses the development scheme when the build provides it", () => {
  assert.equal(appScheme("healthapp-dev"), "healthapp-dev");
  assert.equal(
    authRedirectUrl("reset-password", "healthapp-dev"),
    "healthapp-dev://reset-password",
  );
});

test("rejects an invalid configured scheme", () => {
  assert.equal(appScheme("https://example.com"), "healthapp");
});

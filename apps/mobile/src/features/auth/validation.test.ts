import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAuthInput } from "./validation";

test("reset validates only email and accepts surrounding whitespace", () => {
  assert.equal(
    validateAuthInput("reset", " person@example.com ", ""),
    undefined,
  );
  assert.equal(
    validateAuthInput("reset", "person@", ""),
    "Enter a valid email address.",
  );
});
test("sign in permits existing passwords while sign up enforces the minimum", () => {
  assert.equal(
    validateAuthInput("signIn", "person@example.com", "legacy"),
    undefined,
  );
  assert.equal(
    validateAuthInput("signIn", "person@example.com", ""),
    "Enter your password.",
  );
  assert.equal(
    validateAuthInput("signUp", "person@example.com", "short"),
    "Use a password of at least 8 characters.",
  );
});

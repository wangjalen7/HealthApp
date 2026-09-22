import assert from "node:assert/strict";
import test from "node:test";
import { normalizedPhone, otpDigits, authIssue } from "./phone-model";
test("phone numbers normalize internationally without silently changing country", () => {
  assert.equal(normalizedPhone("(202) 555-0123", "US"), "+12025550123");
  assert.equal(normalizedPhone("020 7946 0123", "GB"), "+442079460123");
  assert.equal(normalizedPhone("+442079460123", "US"), "+442079460123");
  assert.throws(() => normalizedPhone("123", "US"));
});
test("OTP paste and error handling are actionable without accepting non-numeric codes", () => {
  assert.equal(otpDigits("12 34-56"), "123456");
  assert.equal(otpDigits("1234567"), "123456");
  assert.match(authIssue({ code: "otp_expired" }), /incorrect or expired/);
  assert.match(authIssue({ status: 429 }), /Wait/);
  assert.match(authIssue({ code: "sms_send_failed" }), /Use email/);
  assert.match(authIssue({ code: "user_already_exists" }), /cannot be merged/);
});

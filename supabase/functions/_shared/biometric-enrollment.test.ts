import assert from "node:assert/strict";
import test from "node:test";
import { verifyEnrollmentPassword } from "./biometric-enrollment";
test("an existing user/session cannot enroll without independent password verification", async () => {
  let calls = 0;
  const verifier = async (password: string) => {
    calls++;
    return {
      data: { user: { id: "owner" }, session: { access_token: "verified" } },
      error: password === "correct" ? null : new Error("invalid password"),
    };
  };
  assert.equal(
    await verifyEnrollmentPassword("owner", "", verifier),
    undefined,
  );
  assert.equal(calls, 0);
  assert.equal(
    await verifyEnrollmentPassword("owner", "wrong", verifier),
    undefined,
  );
  assert.equal(
    await verifyEnrollmentPassword("other", "correct", verifier),
    undefined,
  );
  assert.equal(
    (await verifyEnrollmentPassword("owner", "correct", verifier))?.user?.id,
    "owner",
  );
  assert.equal(calls, 3);
});

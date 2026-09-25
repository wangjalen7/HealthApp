import assert from "node:assert/strict";
import test from "node:test";
import { exportableDeviceKey } from "./local-inventory";
test("device export includes owned settings and pending writes without credential or cross-account keys", () => {
  for (const key of [
    "healthapp:routines:v1:a",
    "healthapp:pending-write:v2:a:photo:create:1",
    "healthapp:summary-layout:a",
    "healthapp:goal-helper-draft:a:calories",
  ])
    assert.equal(exportableDeviceKey(key, "a"), true, key);
  for (const key of [
    "healthapp:routines:v1:ab",
    "healthapp:biometric:a",
    "healthapp.account-deletion-pending",
    "sb-session",
    "healthapp:summary-layout:b",
  ])
    assert.equal(exportableDeviceKey(key, "a"), false, key);
});

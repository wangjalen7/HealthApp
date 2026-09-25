import assert from "node:assert/strict";
import test from "node:test";
import { privateNotificationPreviews } from "./preview-privacy";
import { customPlan } from "./schedule-model";
import { createReminder } from "./model";
test("generic notification previews remove medication names even from fingerprint and preserve routing", () => {
  const r = createReminder({
    userId: "owner",
    kind: "medication",
    name: "Private medicine",
    time: "12:00",
    additionalTimes: [],
    repeat: "daily",
    startDate: "2026-01-01",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  const requests = customPlan([r], []);
  assert.ok(requests.length);
  const hidden = privateNotificationPreviews(requests, false);
  assert.equal(JSON.stringify(hidden).includes("Private medicine"), false);
  assert.equal(hidden[0].title, "Sustain reminder");
  assert.deepEqual(hidden[0].data, requests[0].data);
  assert.notEqual(hidden[0].fingerprint, requests[0].fingerprint);
  assert.deepEqual(privateNotificationPreviews(requests, true), requests);
});

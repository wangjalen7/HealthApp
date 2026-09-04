import assert from "node:assert/strict";
import test from "node:test";

import {
  approximateBase64Bytes,
  localPhotoDay,
  nextDailyPhotoSlot,
} from "./model";

test("uses local calendar dates for progress-photo limits", () => {
  const date = new Date(2026, 8, 4, 23, 30);
  assert.equal(localPhotoDay(date), "2026-09-04");
});

test("allocates one of three unique photo slots per day", () => {
  assert.equal(nextDailyPhotoSlot([]), 1);
  assert.equal(nextDailyPhotoSlot([1, 3]), 2);
  assert.equal(nextDailyPhotoSlot([1, 2, 3]), undefined);
});

test("estimates decoded base64 size without counting padding", () => {
  assert.equal(approximateBase64Bytes("TQ=="), 1);
  assert.equal(approximateBase64Bytes("TWE="), 2);
  assert.equal(approximateBase64Bytes("TWFu"), 3);
});

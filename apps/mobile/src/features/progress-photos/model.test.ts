import assert from "node:assert/strict";
import test from "node:test";

import {
  approximateBase64Bytes,
  isProgressPhotoStorageFullError,
  localPhotoDay,
} from "./model";

test("uses local calendar dates for progress-photo storage paths", () => {
  const date = new Date(2026, 8, 4, 23, 30);
  assert.equal(localPhotoDay(date), "2026-09-04");
});

test("estimates decoded base64 size without counting padding", () => {
  assert.equal(approximateBase64Bytes("TQ=="), 1);
  assert.equal(approximateBase64Bytes("TWE="), 2);
  assert.equal(approximateBase64Bytes("TWFu"), 3);
});

test("recognizes Supabase storage quota errors", () => {
  assert.equal(isProgressPhotoStorageFullError({ status: 402 }), true);
  assert.equal(
    isProgressPhotoStorageFullError({
      code: "exceeded_storage_quota",
      message: "Storage quota exceeded",
    }),
    true,
  );
  assert.equal(
    isProgressPhotoStorageFullError({ status: 413, message: "Too large" }),
    false,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { stripJpegMetadata } from "./jpeg";
test("photo sanitizer removes EXIF, comments and trailing data across scans", () => {
  const image = Buffer.from([
    255, 216, 255, 225, 0, 5, 71, 80, 83, 255, 218, 0, 2, 1, 255, 0, 2, 255,
    208, 3, 255, 254, 0, 4, 65, 66, 255, 218, 0, 2, 4, 255, 217, 99,
  ]);
  const clean = Buffer.from(
    stripJpegMetadata(image.toString("base64")),
    "base64",
  );
  assert.deepEqual(
    [...clean],
    [
      255, 216, 255, 218, 0, 2, 1, 255, 0, 2, 255, 208, 3, 255, 218, 0, 2, 4,
      255, 217,
    ],
  );
  assert.equal(
    stripJpegMetadata(clean.toString("base64")),
    clean.toString("base64"),
  );
});
test("photo sanitizer rejects malformed input rather than uploading it", () => {
  for (const b of [
    [0, 1],
    [255, 216, 255, 225, 0, 20],
    [255, 216, 255, 218, 0, 2, 4],
  ])
    assert.throws(() => stripJpegMetadata(Buffer.from(b).toString("base64")));
});

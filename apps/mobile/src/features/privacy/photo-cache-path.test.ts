import assert from "node:assert/strict";
import test from "node:test";
import { isDisposablePhotoUri } from "./photo-cache-path";
test("temporary photo cleanup cannot reach documents, the library or adjacent cache names", () => {
  const cache = "file:///app/Library/Caches/";
  assert.equal(
    isDisposablePhotoUri(cache + "ImagePicker/photo.jpg", cache),
    true,
  );
  for (const uri of [
    "ph://image",
    "file:///app/Documents/photo.jpg",
    cache + "../private.jpg",
    cache + "%2e%2e/private.jpg",
    "file:///app/Library/Caches-other/photo.jpg",
    cache + "folder%2f..%2fprivate.jpg",
    cache,
  ])
    assert.equal(isDisposablePhotoUri(uri, cache), false);
});

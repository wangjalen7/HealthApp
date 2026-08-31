import assert from "node:assert/strict";
import test from "node:test";

import { createUuid } from "./id";

test("creates valid, distinct version 4 UUIDs", () => {
  const first = createUuid();
  const second = createUuid();
  const versionFourUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  assert.match(first, versionFourUuid);
  assert.match(second, versionFourUuid);
  assert.notEqual(first, second);
});

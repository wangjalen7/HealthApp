import assert from "node:assert/strict";
import test from "node:test";

import {
  inclusiveAxisInstants,
  paddedValueDomain,
  toggleSelectedPoint,
} from "./chart";

test("labels a range with its inclusive final instant rather than tomorrow", () => {
  const start = new Date("2026-08-23T00:00:00.000Z");
  const exclusiveEnd = new Date("2026-08-31T00:00:00.000Z");
  const [, , end] = inclusiveAxisInstants(start, exclusiveEnd);
  assert.equal(end.toISOString(), "2026-08-30T23:59:59.999Z");
});

test("adds readable vertical space around a flat series", () => {
  const domain = paddedValueDomain([180, 180]);
  assert.ok(domain.min < 180);
  assert.ok(domain.max > 180);
  assert.deepEqual(domain.ticks, [183.6, 180, 176.4]);
});

test("uses the observed range without forcing a misleading zero baseline", () => {
  const domain = paddedValueDomain([179, 181]);
  assert.ok(domain.min > 0);
  assert.ok(domain.min < 179);
  assert.ok(domain.max > 181);
});

test("toggles an inspected chart point closed when it is tapped again", () => {
  assert.equal(toggleSelectedPoint(undefined, "point-a"), "point-a");
  assert.equal(toggleSelectedPoint("point-a", "point-a"), undefined);
  assert.equal(toggleSelectedPoint("point-a", "point-b"), "point-b");
});

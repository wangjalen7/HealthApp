import assert from "node:assert/strict";
import test from "node:test";

import {
  compactTooltipWidth,
  inclusiveAxisInstants,
  paddedValueDomain,
  stableValueDomain,
  smoothCurvePath,
  timelineX,
  timeAxisTicks,
  toggleSelectedPoint,
} from "./chart";

test("builds a smooth curve through measurements without invalid coordinates", () => {
  const path = smoothCurvePath([
    { x: 0, y: 20 },
    { x: 10, y: 10 },
    { x: 20, y: 30 },
    { x: 30, y: 20 },
  ]);
  assert.match(path, /^M 0 20 C /);
  assert.match(path, /30 20$/);
  assert.doesNotMatch(path, /NaN|Infinity/);
});

test("uses a direct segment when only two chart points exist", () => {
  assert.equal(
    smoothCurvePath([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]),
    "M 1 2 L 3 4",
  );
});

test("sizes tooltips to their content with consistent compact padding", () => {
  const short = compactTooltipWidth(
    [
      { text: "Sep 2026 AVG", fontSize: 8 },
      { text: "137/86 mmHg", fontSize: 10 },
    ],
    325,
  );
  const long = compactTooltipWidth(
    [
      { text: "Aug 30 – Sep 5, 2026 AVG", fontSize: 8 },
      { text: "137/86 mmHg", fontSize: 10 },
    ],
    325,
  );
  assert.ok(short < long);
  assert.ok(short < 100);
  assert.ok(long < 154);
});

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

test("keeps the vertical domain fixed while the visible window changes", () => {
  const allValues = [62, 118, 171];
  assert.deepEqual(
    stableValueDomain(allValues, [62, 118]),
    stableValueDomain(allValues, [118, 171]),
  );
});

test("toggles an inspected chart point closed when it is tapped again", () => {
  assert.equal(toggleSelectedPoint(undefined, "point-a"), "point-a");
  assert.equal(toggleSelectedPoint("point-a", "point-a"), undefined);
  assert.equal(toggleSelectedPoint("point-a", "point-b"), "point-b");
});

test("preserves an off-screen point's timeline position for a clipped line", () => {
  assert.equal(timelineX(0, 10, 110, 33, 358, false), 0.5);
  assert.equal(timelineX(0, 10, 110, 33, 358), 33);
});

test("uses range-specific time-axis divisions", () => {
  const day = timeAxisTicks(
    "D",
    new Date(2026, 8, 1, 0),
    new Date(2026, 8, 2, 0),
  );
  assert.deepEqual(
    day.map((tick) => tick.getHours()),
    [0, 3, 6, 9, 12, 15, 18, 21],
  );
  const week = timeAxisTicks(
    "W",
    new Date(2026, 7, 27, 0),
    new Date(2026, 8, 3, 0),
  );
  assert.equal(week.length, 7);
  const month = timeAxisTicks(
    "M",
    new Date(2026, 7, 4, 0),
    new Date(2026, 8, 3, 0),
  );
  assert.deepEqual(
    month.map((tick) => tick.getDate()),
    [9, 16, 23, 30],
  );
});

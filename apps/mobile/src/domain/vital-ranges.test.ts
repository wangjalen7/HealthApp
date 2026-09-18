import assert from "node:assert/strict";
import test from "node:test";

import {
  bloodPressurePointsForRange,
  connectedBloodPressurePointsForRange,
  connectedPointsForRange,
  pointsForRange,
  shiftTrendReference,
  shiftTrendReferenceByFraction,
  trendFractionDistance,
  trendRangeDurationMs,
  trendRangeBounds,
  type VitalSample,
} from "./vitals";

const sample = (
  id: string,
  occurredAt: string,
  value: number,
): VitalSample => ({
  id,
  userId: "user",
  kind: "weight",
  value,
  unit: "lb",
  occurredAt,
  source: "manual",
  createdAt: occurredAt,
});

const bpSample = (
  id: string,
  kind: "systolic_bp" | "diastolic_bp",
  occurredAt: string,
  value: number,
): VitalSample => ({
  ...sample(id, occurredAt, value),
  kind,
  unit: "mmHg",
});

test("averages readings within each hour for the daily chart", () => {
  const now = new Date("2026-08-29T18:00:00");
  const points = pointsForRange(
    [
      sample("one", "2026-08-29T08:00:00", 180),
      sample("two", "2026-08-29T08:30:00", 178),
      sample("three", "2026-08-29T17:00:00", 177),
    ],
    "weight",
    "D",
    now,
  );
  assert.deepEqual(
    points.map((point) => point.value),
    [179, 177],
  );
});

test("daily range is a continuous rolling 24-hour window", () => {
  const { start, end } = trendRangeBounds("D", new Date("2026-08-29T18:00:00"));
  assert.equal(start.getHours(), 18);
  assert.equal(end.getHours(), 18);
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});

test("moves each trend by its displayed time window and does not move past today", () => {
  const current = new Date("2026-09-02T12:00:00");
  assert.equal(shiftTrendReference("D", current, -1, current).getDate(), 1);
  assert.equal(shiftTrendReference("W", current, -1, current).getDate(), 26);
  assert.equal(
    current.getTime() -
      shiftTrendReference("6M", current, -1, current).getTime(),
    trendRangeDurationMs("6M"),
  );
  assert.equal(
    shiftTrendReference("Y", current, -1, current).getFullYear(),
    2025,
  );
  assert.equal(
    shiftTrendReference("D", current, 1, current).getTime(),
    current.getTime(),
  );
  assert.equal(
    current.getTime() -
      shiftTrendReference("M", current, -1, current).getTime(),
    trendRangeDurationMs("M"),
  );
});

test("moves rolling trend windows by exact fractional distances", () => {
  const current = new Date("2026-09-02T12:00:00");
  const shifted = shiftTrendReferenceByFraction(
    "W",
    current,
    -1,
    0.375,
    current,
  );
  assert.equal(
    current.getTime() - shifted.getTime(),
    trendRangeDurationMs("W") * 0.375,
  );
  assert.equal(trendFractionDistance("W", shifted, current), 0.375);
});

test("all longer ranges use fixed continuous rolling durations", () => {
  const month = trendRangeBounds("M", new Date(2026, 8, 2, 12));
  assert.equal(month.end.getTime() - month.start.getTime(), 30 * 86_400_000);
  const year = trendRangeBounds("Y", new Date(2026, 8, 2, 12));
  assert.equal(year.end.getTime() - year.start.getTime(), 365 * 86_400_000);
});

test("uses daily averages for W/M, weekly for 6M, and monthly for Y", () => {
  const now = new Date("2026-08-29T12:00:00");
  const samples = [
    sample("one", "2026-08-27T08:00:00", 180),
    sample("two", "2026-08-27T17:00:00", 179),
    sample("three", "2026-08-28T17:00:00", 178),
  ];
  assert.equal(pointsForRange(samples, "weight", "W", now).length, 2);
  assert.equal(pointsForRange(samples, "weight", "M", now).length, 2);
  assert.equal(pointsForRange(samples, "weight", "6M", now).length, 1);
  assert.equal(pointsForRange(samples, "weight", "Y", now).length, 1);
  assert.equal(pointsForRange(samples, "weight", "W", now)[0].value, 179.5);
  assert.equal(pointsForRange(samples, "weight", "M", now)[0].value, 179.5);
  assert.equal(
    new Date(pointsForRange(samples, "weight", "W", now)[0].at).getHours(),
    0,
  );
  assert.equal(
    new Date(pointsForRange(samples, "weight", "M", now)[0].at).getHours(),
    0,
  );
});

test("keeps separate seven-day averages in 6M but combines them in Y", () => {
  const now = new Date("2026-08-29T12:00:00");
  const samples = [
    sample("earlier-week", "2026-08-10T08:00:00", 182),
    sample("later-week", "2026-08-18T08:00:00", 180),
  ];
  assert.equal(pointsForRange(samples, "weight", "6M", now).length, 2);
  assert.equal(pointsForRange(samples, "weight", "Y", now).length, 1);
  assert.equal(pointsForRange(samples, "weight", "Y", now)[0].value, 181);
});

test("adds only adjacent averaged buckets to connect a visible line", () => {
  const now = new Date("2026-08-29T12:00:00");
  const points = connectedPointsForRange(
    [
      sample("before-one", "2026-08-21T08:00:00", 184),
      sample("before-two", "2026-08-21T17:00:00", 182),
      sample("visible-one", "2026-08-27T08:00:00", 180),
      sample("visible-two", "2026-08-28T08:00:00", 179),
      sample("after-one", "2026-08-29T13:00:00", 178),
      sample("after-two", "2026-08-29T17:00:00", 176),
    ],
    "weight",
    "W",
    now,
  );
  assert.deepEqual(
    points.map((point) => point.value),
    [183, 180, 179, 177],
  );
});

test("does not draw a weekly edge connection across a gap longer than the window", () => {
  const samples = [
    sample("september-seven", "2026-09-07T08:00:00", 184),
    sample("september-seventeen", "2026-09-17T08:00:00", 180),
  ];

  const current = connectedPointsForRange(
    samples,
    "weight",
    "W",
    new Date("2026-09-17T12:00:00"),
  );
  const emptyMiddle = connectedPointsForRange(
    samples,
    "weight",
    "W",
    new Date("2026-09-16T12:00:00"),
  );

  assert.deepEqual(
    current.map((point) => point.value),
    [180],
  );
  assert.deepEqual(emptyMiddle, []);
});

test("does not connect blood pressure across a gap longer than the selected window", () => {
  const samples = [
    bpSample("sys-old", "systolic_bp", "2026-09-07T08:00:00", 140),
    bpSample("dia-old", "diastolic_bp", "2026-09-07T08:01:00", 90),
    bpSample("sys-new", "systolic_bp", "2026-09-17T08:00:00", 124),
    bpSample("dia-new", "diastolic_bp", "2026-09-17T08:01:00", 78),
  ];

  const points = connectedBloodPressurePointsForRange(
    samples,
    "W",
    new Date("2026-09-17T12:00:00"),
  );

  assert.deepEqual(
    points.map((point) => [point.systolic, point.diastolic]),
    [[124, 78]],
  );
});

test("pairs blood-pressure averages by bucket instead of synthetic timestamps", () => {
  const points = bloodPressurePointsForRange(
    [
      bpSample("sys-one", "systolic_bp", "2026-08-28T08:00:00", 142),
      bpSample("dia-one", "diastolic_bp", "2026-08-28T08:01:00", 92),
      bpSample("sys-two", "systolic_bp", "2026-08-28T17:00:00", 132),
      bpSample("dia-two", "diastolic_bp", "2026-08-28T17:01:00", 82),
    ],
    "W",
    new Date("2026-08-29T12:00:00"),
  );
  assert.equal(points.length, 1);
  assert.equal(points[0].systolic, 137);
  assert.equal(points[0].diastolic, 87);
  assert.equal(new Date(points[0].at).getHours(), 0);
});

test("keeps a daily blood-pressure average stable while its date moves through W/M", () => {
  const samples = [
    bpSample("sys-morning", "systolic_bp", "2026-08-30T08:00:00", 142),
    bpSample("dia-morning", "diastolic_bp", "2026-08-30T08:01:00", 92),
    bpSample("sys-evening", "systolic_bp", "2026-08-30T17:00:00", 132),
    bpSample("dia-evening", "diastolic_bp", "2026-08-30T17:01:00", 82),
  ];
  const beforeEvening = bloodPressurePointsForRange(
    samples,
    "W",
    new Date("2026-08-30T12:00:00"),
  );
  const afterEvening = bloodPressurePointsForRange(
    samples,
    "W",
    new Date("2026-08-30T20:00:00"),
  );

  assert.deepEqual(beforeEvening, afterEvening);
  assert.deepEqual(beforeEvening[0], {
    at: new Date("2026-08-30T00:00:00").toISOString(),
    systolic: 137,
    diastolic: 87,
  });
});

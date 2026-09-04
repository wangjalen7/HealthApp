export const vitalKinds = [
  "weight",
  "systolic_bp",
  "diastolic_bp",
  "pulse",
] as const;
export type VitalKind = (typeof vitalKinds)[number];
export const vitalSources = ["manual", "healthkit", "omron_import"] as const;
export type VitalSource = (typeof vitalSources)[number];

export type VitalSample = {
  id: string;
  userId: string;
  kind: VitalKind;
  value: number;
  unit: string;
  occurredAt: string;
  correlationId?: string;
  source: VitalSource;
  externalId?: string;
  sourceName?: string;
  createdAt: string;
  deletedAt?: string;
};

const equivalentValue = (left: VitalSample, right: VitalSample): boolean => {
  if (left.kind !== right.kind) return false;
  if (left.kind === "weight") {
    const leftPounds = left.unit === "kg" ? left.value * 2.20462 : left.value;
    const rightPounds =
      right.unit === "kg" ? right.value * 2.20462 : right.value;
    return Math.abs(leftPounds - rightPounds) < 0.05;
  }
  return Math.abs(left.value - right.value) < 0.01;
};

/**
 * Collapses an identical manual/HealthKit reading recorded within five minutes.
 * Source-specific history remains intact; all-source graphs and averages avoid
 * double weighting a device reading that was also entered manually.
 */
export function deduplicateVitalSamples(samples: VitalSample[]): VitalSample[] {
  const ordered = samples
    .filter((sample) => !sample.deletedAt)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const result: VitalSample[] = [];
  for (const sample of ordered) {
    let duplicateIndex = -1;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const candidate = result[index];
      const difference = Math.abs(
        new Date(candidate.occurredAt).getTime() -
          new Date(sample.occurredAt).getTime(),
      );
      if (difference > 5 * 60 * 1000) break;
      if (equivalentValue(candidate, sample)) {
        duplicateIndex = index;
        break;
      }
    }
    if (duplicateIndex < 0) {
      result.push(sample);
      continue;
    }
    if (
      sample.source === "manual" &&
      result[duplicateIndex].source !== "manual"
    ) {
      result[duplicateIndex] = sample;
    }
  }
  return result;
}

export type TrendPoint = { date: string; value: number };
export const trendRanges = ["D", "W", "M", "6M", "Y"] as const;
export type TrendRange = (typeof trendRanges)[number];
export type TimestampPoint = { at: string; value: number };
export type BloodPressurePoint = {
  at: string;
  systolic: number;
  diastolic: number;
};

export function samplesForWindow(
  samples: VitalSample[],
  kind: VitalKind,
  days: number,
  now = new Date(),
): VitalSample[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  return samples
    .filter(
      (sample) =>
        sample.kind === kind &&
        !sample.deletedAt &&
        new Date(sample.occurredAt) >= start,
    )
    .sort(
      (left, right) =>
        new Date(left.occurredAt).getTime() -
        new Date(right.occurredAt).getTime(),
    );
}

export function latestSample(
  samples: VitalSample[],
  kind: VitalKind,
): VitalSample | undefined {
  return samples
    .filter((sample) => sample.kind === kind && !sample.deletedAt)
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    )[0];
}

export function trendPoints(samples: VitalSample[]): TrendPoint[] {
  const byDate = new Map<string, VitalSample>();
  for (const sample of samples) {
    const date = sample.occurredAt.slice(0, 10);
    const current = byDate.get(date);
    if (!current || new Date(sample.occurredAt) > new Date(current.occurredAt))
      byDate.set(date, sample);
  }
  return [...byDate.entries()].map(([date, sample]) => ({
    date,
    value: sample.value,
  }));
}

export function trendRangeBounds(
  range: TrendRange,
  now = new Date(),
): { start: Date; end: Date } {
  const end = new Date(now);
  const start = new Date(end.getTime() - trendRangeDurationMs(range));
  return { start, end };
}

export function trendRangeDurationMs(range: TrendRange): number {
  const day = 86_400_000;
  if (range === "D") return day;
  if (range === "W") return day * 7;
  if (range === "M") return day * 30;
  if (range === "6M") return day * 183;
  return day * 365;
}

export function shiftTrendReference(
  range: TrendRange,
  reference: Date,
  direction: -1 | 1,
  latest = new Date(),
): Date {
  const shifted = new Date(
    reference.getTime() + direction * trendRangeDurationMs(range),
  );
  return shifted > latest ? new Date(latest) : shifted;
}

export function shiftTrendReferenceByFraction(
  range: TrendRange,
  reference: Date,
  direction: -1 | 1,
  fraction: number,
  latest = new Date(),
): Date {
  const distance = Math.max(0, fraction) * trendRangeDurationMs(range);
  const shifted = new Date(reference.getTime() + direction * distance);
  return shifted > latest ? new Date(latest) : shifted;
}

export function trendFractionDistance(
  range: TrendRange,
  earlier: Date,
  later: Date,
): number {
  if (later <= earlier) return 0;
  return (later.getTime() - earlier.getTime()) / trendRangeDurationMs(range);
}

function rangeBucketStart(value: string, range: TrendRange): Date {
  const date = new Date(value);
  if (range === "D") {
    date.setMinutes(0, 0, 0);
    return date;
  }
  date.setHours(0, 0, 0, 0);
  if (range === "6M") date.setDate(date.getDate() - date.getDay());
  if (range === "Y") date.setDate(1);
  return date;
}

function rangeBucketKey(value: string, range: TrendRange): string {
  return String(rangeBucketStart(value, range).getTime());
}

function averageSamples(
  samples: VitalSample[],
  range: TrendRange,
): TimestampPoint {
  const valueTotal = samples.reduce((sum, sample) => sum + sample.value, 0);
  return {
    at: rangeBucketStart(samples[0].occurredAt, range).toISOString(),
    value: valueTotal / samples.length,
  };
}

function pointsFromSamples(
  samples: VitalSample[],
  kind: VitalKind,
  range: TrendRange,
): TimestampPoint[] {
  const buckets = new Map<string, VitalSample[]>();
  for (const sample of samples) {
    if (sample.kind !== kind || sample.deletedAt) continue;
    const key = rangeBucketKey(sample.occurredAt, range);
    buckets.set(key, [...(buckets.get(key) ?? []), sample]);
  }
  return [...buckets.values()]
    .map((bucket) => averageSamples(bucket, range))
    .sort((left, right) => left.at.localeCompare(right.at));
}

function pointsWithinWindow<T extends { at: string }>(
  points: T[],
  start: Date,
  end: Date,
): T[] {
  return points.filter((point) => {
    const timestamp = new Date(point.at).getTime();
    return timestamp >= start.getTime() && timestamp < end.getTime();
  });
}

export function pointsForRange(
  samples: VitalSample[],
  kind: VitalKind,
  range: TrendRange,
  now = new Date(),
): TimestampPoint[] {
  const { start, end } = trendRangeBounds(range, now);
  return pointsWithinWindow(
    pointsFromSamples(samples, kind, range),
    start,
    end,
  );
}

export function connectedPointsForRange(
  samples: VitalSample[],
  kind: VitalKind,
  range: TrendRange,
  now = new Date(),
): TimestampPoint[] {
  const { start, end } = trendRangeBounds(range, now);
  const allPoints = pointsFromSamples(samples, kind, range);
  const visible = pointsWithinWindow(allPoints, start, end);
  if (!visible.length) return visible;

  const previousPoint = allPoints.findLast(
    (point) => new Date(point.at) < start,
  );
  const nextPoint = allPoints.find((point) => new Date(point.at) >= end);
  return [
    ...(previousPoint ? [previousPoint] : []),
    ...visible,
    ...(nextPoint ? [nextPoint] : []),
  ];
}

function bloodPressurePointsFromSamples(
  samples: VitalSample[],
  range: TrendRange,
): BloodPressurePoint[] {
  const buckets = new Map<
    string,
    {
      at: string;
      systolicCount: number;
      systolicTotal: number;
      diastolicCount: number;
      diastolicTotal: number;
    }
  >();
  for (const sample of samples) {
    if (
      sample.deletedAt ||
      (sample.kind !== "systolic_bp" && sample.kind !== "diastolic_bp")
    ) {
      continue;
    }
    const key = rangeBucketKey(sample.occurredAt, range);
    const current = buckets.get(key) ?? {
      at: rangeBucketStart(sample.occurredAt, range).toISOString(),
      systolicCount: 0,
      systolicTotal: 0,
      diastolicCount: 0,
      diastolicTotal: 0,
    };
    if (sample.kind === "systolic_bp") {
      current.systolicCount += 1;
      current.systolicTotal += sample.value;
    } else {
      current.diastolicCount += 1;
      current.diastolicTotal += sample.value;
    }
    buckets.set(key, current);
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.systolicCount > 0 && bucket.diastolicCount > 0)
    .map((bucket) => ({
      at: bucket.at,
      systolic: bucket.systolicTotal / bucket.systolicCount,
      diastolic: bucket.diastolicTotal / bucket.diastolicCount,
    }))
    .sort((left, right) => left.at.localeCompare(right.at));
}

export function bloodPressurePointsForRange(
  samples: VitalSample[],
  range: TrendRange,
  now = new Date(),
): BloodPressurePoint[] {
  const { start, end } = trendRangeBounds(range, now);
  return pointsWithinWindow(
    bloodPressurePointsFromSamples(samples, range),
    start,
    end,
  );
}

export function connectedBloodPressurePointsForRange(
  samples: VitalSample[],
  range: TrendRange,
  now = new Date(),
): BloodPressurePoint[] {
  const { start, end } = trendRangeBounds(range, now);
  const allPoints = bloodPressurePointsFromSamples(samples, range);
  const visible = pointsWithinWindow(allPoints, start, end);
  if (!visible.length) return visible;
  const previous = allPoints.findLast((point) => new Date(point.at) < start);
  const next = allPoints.find((point) => new Date(point.at) >= end);
  return [...(previous ? [previous] : []), ...visible, ...(next ? [next] : [])];
}

export function unitFor(kind: VitalKind): string {
  return kind === "weight" ? "lb" : kind === "pulse" ? "bpm" : "mmHg";
}

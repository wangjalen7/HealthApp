import { z } from "zod";
import {
  dayBounds,
  dayKey,
  deviceZone,
  monday,
  shiftDay,
  dateFromLocalDay,
} from "../summary/calendar";

export const stepRanges = ["D", "W", "M", "6M", "Y"] as const;
export type StepRange = (typeof stepRanges)[number];
export const stepBucketSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  total: z.number().nonnegative().nullable(),
  availability: z.enum(["available", "missing"]),
  refreshedAt: z.string().datetime(),
});
export type StepBucket = z.infer<typeof stepBucketSchema>;
export const stepCacheSchema = z.object({
  version: z.literal(1),
  zone: z.string(),
  connected: z.boolean(),
  daily: z.array(stepBucketSchema),
  hourly: z.array(stepBucketSchema),
});
export type StepCache = z.infer<typeof stepCacheSchema>;
export const emptyStepCache = (zone = deviceZone()): StepCache => ({
  version: 1,
  zone,
  connected: false,
  daily: [],
  hourly: [],
});
export function stepPeriod(range: StepRange, selected = dayKey()) {
  if (range === "6M" || range === "Y") {
    const date = dateFromLocalDay(selected);
    const months = range === "6M" ? 6 : 12;
    return {
      start: new Date(date.getFullYear(), date.getMonth() - months + 1, 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    };
  }
  const first =
    range === "W"
      ? monday(selected)
      : range === "M"
        ? selected.slice(0, 8) + "01"
        : selected;
  const start = dayBounds(first).start;
  const end =
    range === "M"
      ? new Date(start.getFullYear(), start.getMonth() + 1, 1)
      : dayBounds(shiftDay(first, range === "W" ? 7 : 1)).start;
  return { start, end };
}
export function moveStepPeriod(
  range: StepRange,
  selected: string,
  direction: -1 | 1,
) {
  if (range === "M" || range === "6M" || range === "Y") {
    const date = dateFromLocalDay(selected.slice(0, 8) + "01");
    date.setMonth(
      date.getMonth() +
        direction * (range === "Y" ? 12 : range === "6M" ? 6 : 1),
    );
    return dayKey(date);
  }
  return shiftDay(selected, direction * (range === "W" ? 7 : 1));
}
/** Long-range bars represent daily averages, without altering the daily cache. */
export function stepChartBounds(start: Date, end: Date, range: StepRange) {
  if (range !== "6M" && range !== "Y")
    return bucketBounds(start, end, range === "D");
  const result: { start: Date; end: Date }[] = [];
  for (let cursor = new Date(start); cursor < end;) {
    const next =
      range === "Y"
        ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
        : dayBounds(shiftDay(monday(dayKey(cursor)), 7)).start;
    result.push({
      start: new Date(cursor),
      end: new Date(Math.min(+next, +end)),
    });
    cursor = next;
  }
  return result;
}
export function stepChartRows(
  rows: StepBucket[],
  start: Date,
  end: Date,
  range: StepRange,
  now = new Date(),
): StepBucket[] {
  if (range !== "6M" && range !== "Y") return rows;
  return stepChartBounds(start, end, range)
    .filter((slot) => slot.start <= now)
    .map((slot) => {
      const days = rows.filter(
        (row) =>
          new Date(row.start) >= slot.start && new Date(row.start) < slot.end,
      );
      const average = completedAverage(days, now);
      return {
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        total: average.value ?? null,
        availability: average.value === undefined ? "missing" : "available",
        refreshedAt: days.length
          ? days.reduce(
              (old, row) => (row.refreshedAt < old ? row.refreshedAt : old),
              days[0]!.refreshedAt,
            )
          : now.toISOString(),
      };
    });
}
/** Calendar days; elapsed hours deliberately include both repeated DST hours. */
export function bucketBounds(start: Date, end: Date, hourly: boolean) {
  const result: { start: Date; end: Date }[] = [];
  for (let cursor = new Date(start); cursor < end;) {
    const next = hourly
      ? new Date(cursor.getTime() + 3600000)
      : dayBounds(shiftDay(dayKey(cursor), 1)).start;
    result.push({ start: new Date(cursor), end: next });
    cursor = next;
  }
  return result;
}
export function completedAverage(buckets: StepBucket[], now = new Date()) {
  const complete = buckets.filter(
    (b) =>
      new Date(b.end) <= dayBounds(dayKey(now)).start &&
      b.availability === "available" &&
      b.total !== null,
  );
  return {
    value: complete.length
      ? complete.reduce((sum, b) => sum + b.total!, 0) / complete.length
      : undefined,
    days: complete.length,
  };
}
export function goalProgress(total: number, goal?: number) {
  return goal && goal > 0 ? Math.min(1, Math.max(0, total / goal)) : undefined;
}
export function replaceStepBuckets(
  previous: StepBucket[],
  incoming: StepBucket[],
) {
  const byStart = new Map(previous.map((b) => [b.start, b]));
  for (const bucket of incoming) byStart.set(bucket.start, bucket);
  return [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start));
}
export function stepsNeedRefresh(
  rows: StepBucket[],
  start: Date,
  end: Date,
  hourly: boolean,
  now = new Date(),
) {
  const byStart = new Map(rows.map((b) => [b.start, b]));
  return bucketBounds(start, end, hourly)
    .filter((b) => b.start <= now)
    .some((b) => {
      const saved = byStart.get(b.start.toISOString());
      return (
        !saved || now.getTime() - new Date(saved.refreshedAt).getTime() > 60000
      );
    });
}
export type StepStatistic = {
  startDate?: Date;
  sumQuantity?: { quantity: number };
};
/** Only HealthKit's merged cumulative result. Never combine sample/source totals. */
export function normalizeStepStatistics(
  stats: readonly StepStatistic[],
  start: Date,
  end: Date,
  hourly: boolean,
  now = new Date(),
): StepBucket[] {
  const values = new Map(
    stats
      .filter((s) => s.startDate)
      .map((s) => [s.startDate!.toISOString(), s.sumQuantity?.quantity]),
  );
  return bucketBounds(start, end, hourly)
    .filter((b) => b.start <= now)
    .map((b) => {
      const value = values.get(b.start.toISOString());
      const available =
        value !== undefined && Number.isFinite(value) && value >= 0;
      return {
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        total: available ? Math.round(value) : null,
        availability: available ? "available" : "missing",
        refreshedAt: now.toISOString(),
      };
    });
}

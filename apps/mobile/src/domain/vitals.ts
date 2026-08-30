export const vitalKinds = ['weight', 'systolic_bp', 'diastolic_bp', 'pulse'] as const;
export type VitalKind = (typeof vitalKinds)[number];
export const vitalSources = ['manual', 'healthkit', 'omron_import'] as const;
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
  createdAt: string;
  deletedAt?: string;
};

export type TrendPoint = { date: string; value: number };
export const trendRanges = ['D', 'W', 'M', '6M', 'Y'] as const;
export type TrendRange = (typeof trendRanges)[number];
export type TimestampPoint = { at: string; value: number };

export function samplesForWindow(samples: VitalSample[], kind: VitalKind, days: number, now = new Date()): VitalSample[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  return samples
    .filter((sample) => sample.kind === kind && !sample.deletedAt && new Date(sample.occurredAt) >= start)
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());
}

export function latestSample(samples: VitalSample[], kind: VitalKind): VitalSample | undefined {
  return samples
    .filter((sample) => sample.kind === kind && !sample.deletedAt)
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())[0];
}

export function trendPoints(samples: VitalSample[]): TrendPoint[] {
  const byDate = new Map<string, VitalSample>();
  for (const sample of samples) {
    const date = sample.occurredAt.slice(0, 10);
    const current = byDate.get(date);
    if (!current || new Date(sample.occurredAt) > new Date(current.occurredAt)) byDate.set(date, sample);
  }
  return [...byDate.entries()].map(([date, sample]) => ({ date, value: sample.value }));
}

export function trendRangeBounds(range: TrendRange, now = new Date()): { start: Date; end: Date } {
  const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + 1);
  const start = new Date(end);
  if (range === 'D') { start.setDate(start.getDate() - 1); return { start, end }; }
  if (range === 'W') start.setDate(start.getDate() - 7);
  if (range === 'M') start.setDate(start.getDate() - 30);
  if (range === '6M') start.setMonth(start.getMonth() - 6);
  if (range === 'Y') start.setFullYear(start.getFullYear() - 1);
  return { start, end };
}

function localDateKey(value: string): string { const date = new Date(value); return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
export function pointsForRange(samples: VitalSample[], kind: VitalKind, range: TrendRange, now = new Date()): TimestampPoint[] {
  const { start, end } = trendRangeBounds(range, now);
  const windowed = samples.filter((sample) => sample.kind === kind && !sample.deletedAt && new Date(sample.occurredAt) >= start && new Date(sample.occurredAt) < end).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  if (range === 'D') return windowed.map((sample) => ({ at: sample.occurredAt, value: sample.value }));
  const newestByDay = new Map<string, VitalSample>();
  for (const sample of windowed) newestByDay.set(localDateKey(sample.occurredAt), sample);
  return [...newestByDay.values()].map((sample) => ({ at: sample.occurredAt, value: sample.value }));
}

export function unitFor(kind: VitalKind): string {
  return kind === 'weight' ? 'lb' : kind === 'pulse' ? 'bpm' : 'mmHg';
}

export type ValueDomain = {
  min: number;
  max: number;
  ticks: [number, number, number];
};

export function inclusiveAxisInstants(start: Date, exclusiveEnd: Date): [Date, Date, Date] {
  const end = new Date(Math.max(start.getTime(), exclusiveEnd.getTime() - 1));
  const middle = new Date((start.getTime() + end.getTime()) / 2);
  return [start, middle, end];
}

export function paddedValueDomain(values: number[]): ValueDomain {
  if (!values.length) return { min: 0, max: 1, ticks: [1, 0.5, 0] };
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin;
  const padding = span === 0 ? Math.max(Math.abs(rawMax) * 0.02, 1) : span * 0.12;
  const min = rawMin - padding;
  const max = rawMax + padding;
  return { min, max, ticks: [max, (min + max) / 2, min] };
}

export function toggleSelectedPoint(
  current: string | undefined,
  next: string,
): string | undefined {
  return current === next ? undefined : next;
}

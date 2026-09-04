import type { TrendRange } from "../../domain/vitals";

export type ValueDomain = {
  min: number;
  max: number;
  ticks: [number, number, number];
};

function estimatedTextWidth(text: string, fontSize: number): number {
  return [...text].reduce((width, character) => {
    if (character === " ") return width + fontSize * 0.3;
    if (/[1il.,:]/.test(character)) return width + fontSize * 0.32;
    if (/[MW]/.test(character)) return width + fontSize * 0.82;
    return width + fontSize * 0.56;
  }, 0);
}

export function compactTooltipWidth(
  lines: { text: string; fontSize: number }[],
  maxWidth: number,
): number {
  const contentWidth = Math.max(
    0,
    ...lines.map((line) => estimatedTextWidth(line.text, line.fontSize)),
  );
  return Math.min(maxWidth, Math.ceil(contentWidth + 18));
}

export function timeAxisTicks(
  range: TrendRange,
  start: Date,
  end: Date,
): Date[] {
  const tick = new Date(start);
  if (range === "D") {
    tick.setMinutes(0, 0, 0);
    tick.setHours(Math.ceil(tick.getHours() / 3) * 3);
    if (tick < start) tick.setHours(tick.getHours() + 3);
  } else if (range === "W") {
    tick.setHours(0, 0, 0, 0);
    if (tick < start) tick.setDate(tick.getDate() + 1);
  } else if (range === "M") {
    tick.setHours(0, 0, 0, 0);
    tick.setDate(tick.getDate() - tick.getDay());
    if (tick < start) tick.setDate(tick.getDate() + 7);
  } else {
    tick.setHours(0, 0, 0, 0);
    tick.setDate(1);
    if (range === "Y" && tick.getMonth() % 2) {
      tick.setMonth(tick.getMonth() + 1);
    }
    if (tick < start) {
      tick.setMonth(tick.getMonth() + (range === "Y" ? 2 : 1));
    }
  }
  const result: Date[] = [];
  while (tick < end && result.length < 16) {
    result.push(new Date(tick));
    if (range === "D") tick.setHours(tick.getHours() + 3);
    else if (range === "W") tick.setDate(tick.getDate() + 1);
    else if (range === "M") tick.setDate(tick.getDate() + 7);
    else tick.setMonth(tick.getMonth() + (range === "Y" ? 2 : 1));
  }
  return result;
}

export function inclusiveAxisInstants(
  start: Date,
  exclusiveEnd: Date,
): [Date, Date, Date] {
  const end = new Date(Math.max(start.getTime(), exclusiveEnd.getTime() - 1));
  const middle = new Date((start.getTime() + end.getTime()) / 2);
  return [start, middle, end];
}

export function paddedValueDomain(values: number[]): ValueDomain {
  if (!values.length) return { min: 0, max: 1, ticks: [1, 0.5, 0] };
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin;
  const padding =
    span === 0 ? Math.max(Math.abs(rawMax) * 0.02, 1) : span * 0.12;
  const min = rawMin - padding;
  const max = rawMax + padding;
  return { min, max, ticks: [max, (min + max) / 2, min] };
}

export function stableValueDomain(
  allValues: number[],
  visibleValues: number[],
): ValueDomain {
  return paddedValueDomain(allValues.length ? allValues : visibleValues);
}

export function timelineX(
  timestamp: number,
  start: number,
  end: number,
  left: number,
  right: number,
  clampToWindow = true,
): number {
  const fraction = (timestamp - start) / Math.max(end - start, 1);
  const visibleFraction = clampToWindow
    ? Math.max(0, Math.min(1, fraction))
    : fraction;
  return left + visibleFraction * (right - left);
}

export function toggleSelectedPoint(
  current: string | undefined,
  next: string,
): string | undefined {
  return current === next ? undefined : next;
}

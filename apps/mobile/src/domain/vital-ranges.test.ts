import assert from 'node:assert/strict';
import test from 'node:test';

import { pointsForRange, trendRangeBounds, type VitalSample } from './vitals';

const sample = (id: string, occurredAt: string, value: number): VitalSample => ({ id, userId: 'user', kind: 'weight', value, unit: 'lb', occurredAt, source: 'manual', createdAt: occurredAt });

test('keeps every same-day point for the daily chart', () => {
  const now = new Date('2026-08-29T18:00:00'); const points = pointsForRange([sample('one', '2026-08-29T08:00:00', 180), sample('two', '2026-08-29T17:00:00', 179)], 'weight', 'D', now);
  assert.deepEqual(points.map((point) => point.value), [180, 179]);
});

test('daily range starts at local midnight and ends at the following midnight', () => {
  const { start, end } = trendRangeBounds('D', new Date('2026-08-29T18:00:00'));
  assert.equal(start.getHours(), 0); assert.equal(end.getHours(), 0); assert.equal(end.getDate() - start.getDate(), 1);
});

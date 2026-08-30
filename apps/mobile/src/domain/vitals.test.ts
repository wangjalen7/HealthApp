import assert from 'node:assert/strict';
import test from 'node:test';

import { latestSample, samplesForWindow, trendPoints, type VitalSample } from './vitals';

const sample = (id: string, kind: VitalSample['kind'], value: number, occurredAt: string): VitalSample => ({
  id, userId: 'user-1', kind, value, occurredAt, unit: kind === 'weight' ? 'lb' : 'mmHg', source: 'manual', createdAt: occurredAt,
});

test('keeps only active samples inside a date window', () => {
  const samples = [sample('old', 'weight', 210, '2026-06-01T12:00:00.000Z'), sample('recent', 'weight', 200, '2026-08-28T12:00:00.000Z')];
  assert.deepEqual(samplesForWindow(samples, 'weight', 7, new Date('2026-08-29T12:00:00.000Z')).map((item) => item.id), ['recent']);
});

test('uses the newest daily sample for a trend', () => {
  const samples = [sample('morning', 'weight', 200, '2026-08-29T08:00:00.000Z'), sample('night', 'weight', 199, '2026-08-29T20:00:00.000Z')];
  assert.deepEqual(trendPoints(samples), [{ date: '2026-08-29', value: 199 }]);
  assert.equal(latestSample(samples, 'weight')?.id, 'night');
});

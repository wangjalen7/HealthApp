import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExerciseGuidance } from './progression';

test('uses the strongest recent session instead of a weaker later session', () => {
  const guidance = buildExerciseGuidance([
    { id: 'strong', occurredAt: '2026-08-01T12:00:00.000Z', sets: [{ weight: 135, reps: 12 }, { weight: 135, reps: 12 }, { weight: 135, reps: 12 }] },
    { id: 'weak', occurredAt: '2026-08-20T12:00:00.000Z', sets: [{ weight: 125, reps: 10 }, { weight: 125, reps: 9 }, { weight: 125, reps: 8 }] },
  ]);
  assert.equal(guidance?.memory.weight, 135);
  assert.deepEqual(guidance?.memory.reps, [12, 12, 12]);
  assert.equal(guidance?.shouldIncrease, true);
});

test('holds weight when the double-progression threshold is not met', () => {
  const guidance = buildExerciseGuidance([{ id: 'session', occurredAt: '2026-08-20T12:00:00.000Z', sets: [{ weight: 100, reps: 12 }, { weight: 100, reps: 10 }, { weight: 100, reps: 10 }] }]);
  assert.equal(guidance?.shouldIncrease, false);
  assert.match(guidance?.recommendation ?? '', /Hold 100 lb/);
});

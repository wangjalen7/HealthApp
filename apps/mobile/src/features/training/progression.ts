export type PerformanceSet = { weight: number; reps: number };
export type PerformanceSession = { id: string; occurredAt: string; sets: PerformanceSet[] };
export type ExerciseMemory = { weight: number; reps: number[]; unit: string; occurredAt: string };
export type ExerciseGuidance = { memory: ExerciseMemory; recommendation: string; shouldIncrease: boolean };

function workingWeight(session: PerformanceSession): number { return Math.max(...session.sets.map((set) => set.weight)); }
function repsAtWorkingWeight(session: PerformanceSession): PerformanceSet[] { const weight = workingWeight(session); return session.sets.filter((set) => set.weight === weight); }
function totalReps(session: PerformanceSession): number { return session.sets.reduce((total, set) => total + set.reps, 0); }

/**
 * Uses the strongest session within the supplied lookback window. A small increase is only
 * suggested after at least two working sets reach 12 reps, a conservative double-progression rule.
 */
export function buildExerciseGuidance(sessions: PerformanceSession[]): ExerciseGuidance | undefined {
  if (!sessions.length) return undefined;
  const best = [...sessions].sort((left, right) => workingWeight(right) - workingWeight(left) || totalReps(right) - totalReps(left) || right.occurredAt.localeCompare(left.occurredAt))[0];
  const weight = workingWeight(best); const workingSets = repsAtWorkingWeight(best); const reps = best.sets.map((set) => set.reps);
  const shouldIncrease = workingSets.length >= 2 && workingSets.every((set) => set.reps >= 12);
  const increment = weight <= 50 ? 2.5 : 5;
  return {
    memory: { weight, reps, unit: 'lb', occurredAt: best.occurredAt },
    shouldIncrease,
    recommendation: shouldIncrease
      ? `Progression flag: ${workingSets.length} working sets reached 12+ reps at ${weight} lb. Try ${weight + increment} lb next time, then build back toward 12 reps.`
      : `Hold ${weight} lb and build the working sets toward 12 reps before increasing weight.`,
  };
}

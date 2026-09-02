import { muscleGroups, type MuscleGroup } from "./workout-draft";

export type MuscleGroupSetCount = {
  muscleGroup: MuscleGroup | "Unassigned";
  setCount: number;
};

export function workoutSetBreakdown(
  sets: { muscleGroup?: MuscleGroup }[],
  sessionMuscleGroups: string[],
): MuscleGroupSetCount[] {
  const singleGroup =
    sessionMuscleGroups.length === 1 &&
    muscleGroups.includes(sessionMuscleGroups[0] as MuscleGroup)
      ? (sessionMuscleGroups[0] as MuscleGroup)
      : undefined;
  const counts = new Map<MuscleGroup | "Unassigned", number>();
  for (const set of sets) {
    const group = set.muscleGroup ?? singleGroup ?? "Unassigned";
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts.entries()].map(([muscleGroup, setCount]) => ({
    muscleGroup,
    setCount,
  }));
}

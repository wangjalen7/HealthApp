/** Apply the dropped order without replacing fields updated while dragging. */
export function applyExerciseOrder<T extends { id: string }>(
  current: T[],
  orderedIds: string[],
): T[] {
  const remaining = new Map(current.map((entry) => [entry.id, entry]));
  const result: T[] = [];
  for (const id of orderedIds) {
    const entry = remaining.get(id);
    if (entry) {
      result.push(entry);
      remaining.delete(id);
    }
  }
  return [...result, ...remaining.values()];
}

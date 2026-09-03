const reorderDistance = 52;

export function workoutDragOffset(
  translationY: number,
  startIndex: number,
  itemCount: number,
): number {
  if (!Number.isFinite(translationY) || itemCount < 2) return 0;
  const requestedOffset = Math.trunc(translationY / reorderDistance);
  return Math.max(
    -startIndex,
    Math.min(itemCount - startIndex - 1, requestedOffset),
  );
}

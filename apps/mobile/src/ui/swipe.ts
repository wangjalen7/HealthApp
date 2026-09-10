export function isHorizontalSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.6;
}

export function swipeDestination(
  index: number,
  count: number,
  dx: number,
  dy: number,
  velocity: number,
): number {
  if (!isHorizontalSwipe(dx, dy)) return index;
  if (
    Math.abs(dx) < 56 &&
    !(
      Math.abs(dx) > 24 &&
      Math.abs(velocity) > 0.45 &&
      Math.sign(velocity) === Math.sign(dx)
    )
  )
    return index;
  return Math.max(0, Math.min(count - 1, index + (dx < 0 ? 1 : -1)));
}

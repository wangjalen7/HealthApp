export type DragSlot = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

// Use the starting slots throughout a drag: reflowing cards cannot chase the
// pointer and repeatedly switch the destination. Gaps select the nearest slot.
export function nearestSlot(slots: DragSlot[], x: number, y: number): number {
  let nearest = -1,
    distance = Infinity;
  slots.forEach((slot, index) => {
    const dx = Math.max(slot.x - x, 0, x - slot.x - slot.width);
    const dy = Math.max(slot.y - y, 0, y - slot.y - slot.height);
    const next = dx * dx + dy * dy;
    if (next < distance) {
      nearest = index;
      distance = next;
    }
  });
  return nearest;
}

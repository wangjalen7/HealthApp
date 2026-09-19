import assert from "node:assert/strict";
import test from "node:test";
import { nearestSlot, type DragSlot } from "./drag";

test("drop destinations include whole small/large widgets, gaps, and both ends", () => {
  const slots: DragSlot[] = [
    { id: "a", x: 20, y: 20, width: 169, height: 160 },
    { id: "b", x: 201, y: 20, width: 169, height: 160 },
    { id: "c", x: 20, y: 192, width: 350, height: 400 },
  ];
  assert.equal(nearestSlot(slots, 35, 150), 0);
  assert.equal(nearestSlot(slots, 350, 165), 1);
  assert.equal(nearestSlot(slots, 340, 530), 2);
  assert.equal(nearestSlot(slots, 198, 100), 1);
  assert.equal(nearestSlot(slots, 50, -100), 0);
  assert.equal(nearestSlot(slots, 200, 900), 2);
  assert.equal(nearestSlot([], 0, 0), -1);
});

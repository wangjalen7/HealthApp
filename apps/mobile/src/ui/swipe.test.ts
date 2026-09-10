import assert from "node:assert/strict";
import test from "node:test";
import { isHorizontalSwipe, swipeDestination } from "./swipe";

test("vertical scrolling, diagonal movement, and taps never change categories", () => {
  assert.equal(isHorizontalSwipe(10, 0), false);
  assert.equal(swipeDestination(1, 4, 40, 90, 1), 1);
  assert.equal(swipeDestination(1, 4, 60, 50, 1), 1);
  assert.equal(swipeDestination(1, 4, 3, 0, 1), 1);
});
test("swiping left advances and right returns without wrapping at boundaries", () => {
  assert.equal(swipeDestination(1, 4, -80, 8, 0), 2);
  assert.equal(swipeDestination(1, 4, 80, 8, 0), 0);
  assert.equal(swipeDestination(0, 4, 80, 8, 0), 0);
  assert.equal(swipeDestination(3, 4, -80, 8, 0), 3);
});
test("a deliberate short flick advances but a slow or reversed drag cancels", () => {
  assert.equal(swipeDestination(1, 4, -30, 0, -0.7), 2);
  assert.equal(swipeDestination(1, 4, -30, 0, -0.1), 1);
  assert.equal(swipeDestination(1, 4, -30, 0, 0.7), 1);
});

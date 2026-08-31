import assert from "node:assert/strict";
import test from "node:test";

import { rankSavedNames } from "./catalog";

test("matches a saved exercise despite punctuation and casing", () => {
  assert.deepEqual(rankSavedNames(["Pull-ups"], "pullups"), ["Pull-ups"]);
});

test("returns only names the user has saved", () => {
  assert.deepEqual(
    rankSavedNames(["Incline chest press (plate)", "Pull-ups"], "press"),
    ["Incline chest press (plate)"],
  );
});

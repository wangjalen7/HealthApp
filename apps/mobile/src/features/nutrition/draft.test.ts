import assert from "node:assert/strict";
import test from "node:test";

import { nutritionDraftHasContent } from "./draft";
import { nutritionDraftSchema } from "./model";

test("recognizes selected meal and food entries as draft content", () => {
  assert.equal(nutritionDraftHasContent({ entries: [] }), false);
  assert.equal(
    nutritionDraftHasContent({ mealType: "breakfast", entries: [] }),
    true,
  );
  const parsed = nutritionDraftSchema.parse({
    mealType: "lunch",
    entries: [],
  });
  assert.equal(parsed.mealType, "lunch");
});

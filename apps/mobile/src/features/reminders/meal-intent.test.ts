import assert from "node:assert/strict";
import test from "node:test";
import { mealDraftForReminder } from "./meal-intent";
test("meal prompts preselect only an empty logger and never replace a dated or selected meal draft", () => {
  assert.deepEqual(mealDraftForReminder(undefined, "lunch"), {
    mealType: "lunch",
    entries: [],
  });
  const selected = { mealType: "dinner" as const, entries: [] };
  assert.equal(mealDraftForReminder(selected, "breakfast"), selected);
  const dated = { entryDay: "2026-09-21", entries: [] };
  assert.equal(mealDraftForReminder(dated, "lunch"), dated);
  assert.equal(mealDraftForReminder(undefined, "external-route"), undefined);
});

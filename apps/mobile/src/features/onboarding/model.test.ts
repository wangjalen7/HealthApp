import assert from "node:assert/strict";
import test from "node:test";
import {
  preferredName,
  defaultUnits,
  setupDestination,
  setupSchema,
} from "./model";
test("preferred names preserve Unicode without requiring legal names", () => {
  assert.equal(preferredName("  王 Jalen  "), "王 Jalen");
  assert.equal(preferredName("  "), null);
  assert.throws(() => preferredName("a".repeat(81)));
  assert.equal(defaultUnits("en-US"), "us");
  assert.equal(defaultUnits("en-GB"), "metric");
});
test("only confirmed server completion bypasses setup; missing state cannot mean new", () => {
  assert.equal(setupSchema.safeParse(null).success, false);
  assert.equal(setupSchema.safeParse({}).success, false);
  const row = setupSchema.parse({
    user_id: "11111111-1111-4111-8111-111111111111",
    preferred_name: null,
    unit_system: "us",
    fluid_unit: "fl_oz",
    step: "summary",
    completed_at: null,
    dismissed_setup: false,
    version: 2,
  });
  assert.equal(setupDestination(row), "/onboarding");
  assert.equal(
    setupDestination({ ...row, completed_at: "2026-09-21" }),
    "/(app)",
  );
});

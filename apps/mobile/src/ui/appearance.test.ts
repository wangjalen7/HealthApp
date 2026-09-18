import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAppearancePreference,
  resolveAppearancePreference,
} from "./appearance-model";

test("accepts saved appearance choices and falls back to the device", () => {
  assert.equal(parseAppearancePreference("light"), "light");
  assert.equal(parseAppearancePreference("dark"), "dark");
  assert.equal(parseAppearancePreference("system"), "system");
  assert.equal(parseAppearancePreference("sepia"), "system");
  assert.equal(parseAppearancePreference(null), "system");
});

test("device appearance follows the current iPhone scheme", () => {
  assert.equal(resolveAppearancePreference("system", "dark"), "dark");
  assert.equal(resolveAppearancePreference("system", "light"), "light");
  assert.equal(resolveAppearancePreference("dark", "light"), "dark");
  assert.equal(resolveAppearancePreference("light", "dark"), "light");
});

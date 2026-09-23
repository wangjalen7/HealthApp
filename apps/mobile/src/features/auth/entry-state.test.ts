import test from "node:test";
import assert from "node:assert/strict";
import {
  completeAttempt,
  entryCanResolve,
  entryRoutePath,
  type EntryAttempt,
} from "./entry-state";

test("entry rejects stale authentication callbacks and never completes code-sending alone", () => {
  const active: EntryAttempt = {
    id: 2,
    phase: "authenticating",
    kind: "manual",
    fallback: "/(app)",
  };
  assert.equal(completeAttempt(active, 1, "old-account"), active);
  assert.equal(completeAttempt(undefined, 2, "account"), undefined);
  assert.equal(
    entryCanResolve(
      active,
      { userId: "account", loading: false, locked: false },
      true,
    ),
    false,
  );
  const complete = completeAttempt(active, 2, "account")!;
  assert.equal(complete.phase, "resolving");
  assert.equal(completeAttempt(complete, 2, "different-account"), complete);
});

test("entry waits for matching account, privacy unlock and critical setup but not health history", () => {
  const attempt: EntryAttempt = {
    id: 1,
    phase: "resolving",
    kind: "biometric",
    fallback: "/(app)",
    userId: "a",
  };
  const ready = { userId: "a", loading: false, locked: false };
  assert.equal(entryCanResolve(attempt, ready, true), true);
  assert.equal(
    entryCanResolve(attempt, { ...ready, userId: "b" }, true),
    false,
  );
  assert.equal(
    entryCanResolve(attempt, { ...ready, locked: true }, true),
    false,
  );
  assert.equal(
    entryCanResolve(attempt, { ...ready, loading: true }, true),
    false,
  );
  assert.equal(entryCanResolve(attempt, ready, false), false);
  assert.equal(
    entryCanResolve({ ...attempt, phase: "error" }, ready, true),
    false,
  );
  assert.equal(entryRoutePath("/(app)/nutrition"), "/nutrition");
  assert.equal(entryRoutePath("/(app)"), "/");
});

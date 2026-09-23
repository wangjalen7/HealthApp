import assert from "node:assert/strict";
import test from "node:test";
import {
  captureIntent,
  clearIntent,
  intentDecision,
  intentDestination,
  intentLifetimeMs,
  type IntentState,
} from "./navigation-model";
const payload = {
  v: 2,
  userId: "a",
  source: "routine",
  category: "meals",
  slot: "breakfast",
};
const empty: IntentState = { seen: [] };
test("notification intents wait through login errors and Face ID lock, then navigate once", () => {
  let state = captureIntent(empty, { key: "tap", data: payload }, 100);
  const auth = { loading: false, locked: false, ready: true };
  assert.equal(intentDecision(state, auth, 101), "wait");
  assert.equal(
    intentDecision(state, { ...auth, userId: "a", locked: true }, 102),
    "wait",
  );
  assert.equal(
    intentDecision(state, { ...auth, userId: "a", ready: false }, 103),
    "wait",
  );
  assert.equal(
    intentDecision(state, { ...auth, userId: "a" }, 104),
    "navigate",
  );
  assert.deepEqual(intentDestination(state.pending!.payload), {
    pathname: "/(app)/nutrition",
    params: { routineMeal: "breakfast" },
  });
  state = clearIntent(state);
  assert.equal(
    captureIntent(state, { key: "tap", data: payload }, 105).pending,
    undefined,
  );
});
test("wrong account, expiry and explicit cancellation cannot resume old destinations", () => {
  const state = captureIntent(empty, { key: "tap", data: payload }, 0);
  const auth = { userId: "b", loading: false, locked: false, ready: true };
  assert.equal(intentDecision(state, auth, 1), "clear");
  assert.equal(
    intentDecision(state, { ...auth, userId: "a" }, intentLifetimeMs),
    "clear",
  );
  assert.equal(clearIntent(state).pending, undefined);
});
test("payload URLs, unknown types and invalid meals are not routes", () => {
  for (const data of [
    { url: "https://example.com" },
    { ...payload, category: "admin" },
    { ...payload, slot: "unknown" },
    { ...payload, userId: "" },
  ])
    assert.equal(
      captureIntent(empty, { key: "tap", data }, 0).pending,
      undefined,
    );
});
test("all known destinations are internal and old notification dates cannot backdate logs", () => {
  for (const [category, path] of [
    ["fluids", "water"],
    ["blood_pressure", "track"],
    ["weight", "weight"],
    ["workout", "workout"],
  ] as const) {
    const state = captureIntent(
      empty,
      {
        key: category,
        data: {
          ...payload,
          category,
          slot: category,
          occurrenceDay: "2020-01-01",
        },
      },
      0,
    );
    const destination = intentDestination(state.pending!.payload);
    assert.equal(destination.pathname, `/(app)/${path}`);
    assert.equal("entryDay" in destination.params, false);
  }
  const state = captureIntent(
    empty,
    {
      key: "custom",
      data: { v: 2, userId: "a", source: "custom", reminderId: "medicine" },
    },
    0,
  );
  assert.equal(
    intentDestination(state.pending!.payload).pathname,
    "/(app)/reminders",
  );
});
test("same repeating request on a later delivery is a new tap, startup/listener duplicates are ignored", () => {
  const state = captureIntent(
    empty,
    { key: "repeat:date1:tap", data: payload },
    0,
  );
  assert.equal(
    captureIntent(state, { key: "repeat:date1:tap", data: payload }, 1),
    state,
  );
  const next = captureIntent(
    clearIntent(state),
    { key: "repeat:date2:tap", data: payload },
    2,
  );
  assert.ok(next.pending);
});

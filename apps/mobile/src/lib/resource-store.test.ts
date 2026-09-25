import { test } from "node:test";
import assert from "node:assert/strict";
import { createResourceStore } from "./resource-store";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
test("independent resources expose initial, empty, loaded and failed-refresh states", async () => {
  const calories = createResourceStore<number[]>(),
    calendar = createResourceStore<number[]>();
  const held = deferred<number[]>();
  const pending = calendar.load("a:month", () => held.promise);
  assert.equal(calories.get("a:today").data, undefined);
  await calories.load("a:today", async () => []);
  assert.deepEqual(calories.get("a:today"), { data: [], loading: false });
  assert.equal(calendar.get("a:month").loading, true);
  await calories.load("a:today", async () => [640]);
  const refreshing = deferred<number[]>();
  const work = calories.load("a:today", () => refreshing.promise);
  assert.deepEqual(calories.get("a:today").data, [640]);
  refreshing.resolve([700]);
  await work;
  await calories.load("a:today", async () => {
    throw Error("Offline");
  });
  assert.deepEqual(calories.get("a:today"), {
    data: [700],
    loading: false,
    error: "Offline",
  });
  held.resolve([]);
  await pending;
});
test("overlapping reads deduplicate; invalidation during a read replaces obsolete results", async () => {
  const store = createResourceStore<number>(),
    held = deferred<number>();
  let calls = 0;
  const read = () => (++calls === 1 ? held.promise : Promise.resolve(2));
  const first = store.load("a:today", read);
  assert.equal(store.load("a:today", read), first);
  assert.equal(calls, 1);
  const seen: (number | undefined)[] = [];
  store.subscribe(() => seen.push(store.get("a:today").data));
  store.load("a:today", read, true);
  held.resolve(1);
  await first;
  assert.equal(calls, 2);
  assert.equal(seen.includes(1), false);
  assert.equal(store.get("a:today").data, 2);
});
test("late responses stay in their original account, date, timezone and calendar key", async () => {
  const store = createResourceStore<number>(),
    old = deferred<number>();
  const pending = store.load(
    "account-a:day-1:zone-1:month-1",
    () => old.promise,
  );
  await store.load("account-b:day-2:zone-2:month-2", async () => 9);
  old.resolve(1);
  await pending;
  assert.equal(store.get("account-b:day-2:zone-2:month-2").data, 9);
  assert.equal(store.get("account-b:day-1:zone-1:month-1").data, undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  createMutationRunner,
  EditConflict,
  type MutationReply,
  type PendingMutation,
} from "./mutation-model";
import { collectPages } from "./pagination";

test("durable retry after lost response/restart reuses operation and frozen timestamps; separate identical entry is allowed", async () => {
  const values = new Map<string, string>();
  const accepted = new Map<string, MutationReply>();
  let fail = true;
  let id = 0;
  let builds = 0;
  const storage = {
    async getItem(k: string) {
      return values.get(k) ?? null;
    },
    async setItem(k: string, v: string) {
      values.set(k, v);
    },
    async removeItem(k: string) {
      values.delete(k);
    },
  };
  const deps = {
    storage,
    id: () => String(++id),
    async assertAccount() {},
    async send(_u: string, p: PendingMutation): Promise<MutationReply> {
      assert.ok(values.size);
      const reply: MutationReply = { status: "accepted", data: p.request };
      accepted.set(p.id, reply);
      if (fail) throw new Error("response lost");
      return reply;
    },
  };
  await assert.rejects(
    createMutationRunner(deps)("one", "fluid", { amount: 8 }, () => ({
      time: ++builds,
    })),
    /response lost/,
  );
  fail = false;
  const restarted = createMutationRunner(deps);
  assert.deepEqual(
    await restarted("one", "fluid", { amount: 8 }, () => ({ time: ++builds })),
    { time: 1 },
  );
  assert.equal(accepted.size, 1);
  assert.equal(builds, 1);
  await restarted("one", "fluid", { amount: 8 }, () => ({ time: ++builds }));
  assert.equal(accepted.size, 2);
});
test("changed intent cannot overwrite uncertain save; expired/switched session retains operation", async () => {
  const values = new Map<string, string>();
  let account = "one";
  let sends = 0;
  const run = createMutationRunner({
    storage: {
      async getItem(k) {
        return values.get(k) ?? null;
      },
      async setItem(k, v) {
        values.set(k, v);
      },
      async removeItem(k) {
        values.delete(k);
      },
    },
    id: () => "operation",
    async assertAccount(u) {
      if (u !== account) throw new Error("account changed");
    },
    async send() {
      sends++;
      account = "two";
      return { status: "accepted", data: 1 };
    },
  });
  await assert.rejects(
    run("one", "workout", { reps: 10 }, () => ({ reps: 10 })),
    /account changed/,
  );
  assert.equal(values.size, 1);
  await assert.rejects(
    run("one", "workout", { reps: 10 }, () => ({ reps: 10 })),
    /account changed/,
  );
  assert.equal(sends, 1);
  account = "one";
  await assert.rejects(
    run("one", "workout", { reps: 12 }, () => ({ reps: 12 })),
    /earlier save/,
  );
  assert.equal(values.size, 1);
});
test("conflict exposes latest value and leaves caller's draft untouched", async () => {
  let raw: string | null = null;
  const draft = { reps: 12 };
  const run = createMutationRunner({
    storage: {
      async getItem() {
        return raw;
      },
      async setItem(_k, v) {
        raw = v;
      },
      async removeItem() {
        raw = null;
      },
    },
    id: () => "op",
    async assertAccount() {},
    async send() {
      return { status: "conflict", current: { reps: 11 } };
    },
  });
  await assert.rejects(
    run("one", "edit", draft, () => draft),
    (e) =>
      e instanceof EditConflict && (e.current as { reps: number }).reps === 11,
  );
  assert.deepEqual(draft, { reps: 12 });
  assert.equal(raw, null);
});
test("keyset history exceeds legacy limits and a smaller server page cap without skipping after deletion", async () => {
  let rows = Array.from({ length: 1207 }, (_, i) => ({
    id: String(i).padStart(6, "0"),
  }));
  let reads = 0;
  const result = await collectPages(async (after) => {
    reads++;
    if (reads === 2) rows = rows.filter((r) => r.id !== "000001");
    return {
      data: rows.filter((r) => !after || r.id > after).slice(0, 73),
      error: null,
    };
  });
  assert.equal(result.length, 1207);
  assert.equal(new Set(result.map((r) => r.id)).size, 1207);
  assert.ok(reads > 16);
});

test("crash or draft-clear failure after server acceptance cannot create a second completed workout", async () => {
  let raw: string | null = null;
  let sends = 0;
  let identifiers = 0;
  const deps = {
    storage: {
      async getItem() {
        return raw;
      },
      async setItem(_k: string, v: string) {
        raw = v;
      },
      async removeItem() {
        raw = null;
      },
    },
    id: () => String(++identifiers),
    async assertAccount() {},
    async send(): Promise<MutationReply> {
      sends++;
      return { status: "accepted", data: { id: "saved-workout" } };
    },
  };
  await createMutationRunner(deps)(
    "one",
    "workout:create",
    { sets: 1 },
    () => ({ sets: 1 }),
    true,
  );
  assert.equal(JSON.parse(raw!).completed, true);
  // Simulate a process restart before its durable draft was removed.
  const resumed = createMutationRunner(deps);
  assert.deepEqual(
    await resumed(
      "one",
      "workout:create",
      { sets: 1 },
      () => ({ sets: 1 }),
      true,
    ),
    { id: "saved-workout" },
  );
  assert.equal(sends, 1);
  assert.equal(identifiers, 1);
  await assert.rejects(
    resumed("one", "workout:create", { sets: 2 }, () => ({ sets: 2 }), true),
    /earlier save/,
  );
});

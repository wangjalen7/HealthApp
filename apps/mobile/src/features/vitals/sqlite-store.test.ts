import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVitalStorage } from "./store-model";
import {
  sqliteVitalTransactions,
  vitalStateSchema,
  type VitalSqlConnection,
} from "./sqlite-store";
import type { VitalSample } from "../../domain/vitals";

const sample: VitalSample = {
  id: "reading",
  userId: "one",
  kind: "weight",
  value: 170,
  unit: "lb",
  source: "manual",
  occurredAt: "2026-09-18T10:00:00Z",
  createdAt: "2026-09-18T10:00:00Z",
};
function open(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec(vitalStateSchema);
  let failQueue = false;
  let counter = 0;
  const connection: VitalSqlConnection = {
    async getFirstAsync<T>(sql: string, params: string[]) {
      return (db.prepare(sql).get(...params) as T) ?? null;
    },
    async runAsync(sql, params) {
      if (failQueue && sql.includes("INSERT INTO vital_outbox_v2"))
        throw new Error("disk full inserting outbox");
      return db.prepare(sql).run(...params);
    },
  };
  const transact = sqliteVitalTransactions(async () => ({
    async withExclusiveTransactionAsync(work) {
      db.exec("BEGIN IMMEDIATE");
      try {
        await work(connection);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  }));
  return {
    db,
    store: createVitalStorage(transact, () => `op-${++counter}-${Date.now()}`),
    failQueue: (value: boolean) => {
      failQueue = value;
    },
  };
}

test("SQLite rolls back both cache and pending writes when queue persistence fails", async () => {
  const { db, store, failQueue } = open();
  try {
    failQueue(true);
    await assert.rejects(store.queueVitals([sample]), /disk full/);
    failQueue(false);
    assert.deepEqual(await store.cachedVitals("one"), []);
    assert.deepEqual(await store.queuedChanges("one"), []);
    await store.queueVitals([sample]);
    const before = await store.cachedVitals("one");
    failQueue(true);
    await assert.rejects(
      store.queueVitals([{ ...sample, value: 180 }]),
      /disk full/,
    );
    await assert.rejects(
      store.queueVitals([{ ...sample, deletedAt: "2026-09-18T12:00:00Z" }]),
      /disk full/,
    );
    failQueue(false);
    assert.deepEqual(await store.cachedVitals("one"), before);
    assert.equal((await store.queuedChanges("one")).length, 1);
  } finally {
    db.close();
  }
});
test("older acceptance preserves newer queued edit and its correct base version", async () => {
  const { db, store } = open();
  try {
    await store.queueVitals([sample]);
    const first = (await store.queuedChanges("one"))[0];
    const request = (await store.prepareChange("one", first.id))!.request;
    await store.queueVitals([{ ...sample, value: 175 }]);
    assert.deepEqual(
      (await store.prepareChange("one", first.id))!.request,
      request,
    );
    const newer = (await store.queuedChanges("one"))[1];
    assert.equal(await store.prepareChange("one", newer.id), undefined);
    await store.acceptChange("one", first.id, [{ ...sample, version: 1 }]);
    assert.equal((await store.cachedVitals("one"))[0].value, 175);
    assert.equal((await store.queuedChanges("one")).length, 1);
    assert.deepEqual(
      (await store.prepareChange("one", newer.id))!.request?.rows,
      [
        {
          id: "reading",
          version: 1,
          values: {
            value: 175,
            unit: "lb",
            occurred_at: sample.occurredAt,
            correlation_id: null,
            source_name: null,
          },
        },
      ],
    );
    assert.deepEqual(await store.queuedChanges("two"), []);
  } finally {
    db.close();
  }
});
test("lost-response receipt cannot replace a newer downloaded deletion", async () => {
  const { db, store } = open();
  try {
    await store.queueVitals([sample]);
    const first = (await store.queuedChanges("one"))[0];
    await store.applyRemotePage(
      "one",
      [{ ...sample, version: 2, deletedAt: "2026-09-18T12:00:00Z" }],
      2,
    );
    assert.equal((await store.cachedVitals("one"))[0].deletedAt, undefined);
    await store.acceptChange("one", first.id, [{ ...sample, version: 1 }]);
    assert.equal((await store.cachedVitals("one"))[0].version, 2);
    assert.ok((await store.cachedVitals("one"))[0].deletedAt);
  } finally {
    db.close();
  }
});
test("restart retains frozen operation IDs, payloads and cursor; conflicts require explicit recovery", async () => {
  const folder = mkdtempSync(join(tmpdir(), "healthapp-sqlite-test-"));
  const path = join(folder, "health.db");
  let runtime = open(path);
  try {
    await runtime.store.queueVitals([sample]);
    const op = (await runtime.store.queuedChanges("one"))[0];
    const frozen = await runtime.store.prepareChange("one", op.id);
    await runtime.store.applyRemotePage(
      "one",
      [{ ...sample, version: 2, deletedAt: "2026-09-18T12:00:00Z" }],
      5,
    );
    runtime.db.close();
    runtime = open(path);
    assert.deepEqual(await runtime.store.prepareChange("one", op.id), frozen);
    assert.equal(await runtime.store.syncCursor("one"), 5);
    await runtime.store.failChange("one", op.id, "conflict", {
      current: { ...sample, version: 2, deletedAt: "2026-09-18T12:00:00Z" },
    });
    assert.equal((await runtime.store.cachedVitals("one"))[0].value, 170);
    await runtime.store.resolveConflict("one", sample.id, "local", 2);
    const recovery = (await runtime.store.queuedChanges("one"))[0];
    assert.notEqual(recovery.samples[0].id, sample.id);
    assert.equal(recovery.samples[0].version, 0);
    assert.ok(
      (await runtime.store.cachedVitals("one")).find((s) => s.id === sample.id)
        ?.deletedAt,
    );
  } finally {
    runtime.db.close();
    rmSync(path);
    rmdirSync(folder);
  }
});
test("conflict recovery rejects a version changed since review and never rebases to an older shadow", async () => {
  const { db, store } = open();
  try {
    await store.applyRemotePage("one", [{ ...sample, version: 1 }], 1);
    await store.queueVitals([{ ...sample, version: 1, value: 175 }]);
    const op = (await store.queuedChanges("one"))[0];
    await store.failChange("one", op.id, "conflict", {
      current: { ...sample, version: 3, value: 180 },
    });
    await store.applyRemotePage(
      "one",
      [{ ...sample, version: 2, value: 177 }],
      2,
    );
    assert.equal(
      (await store.queuedChanges("one"))[0].conflict?.current?.version,
      3,
    );
    await store.applyRemotePage(
      "one",
      [{ ...sample, version: 4, value: 185 }],
      4,
    );
    assert.equal(
      (await store.queuedChanges("one"))[0].conflict?.current?.value,
      185,
    );
    await assert.rejects(
      store.resolveConflict("one", sample.id, "local", 3),
      /changed again/,
    );
    assert.equal((await store.queuedChanges("one"))[0].id, op.id);
    assert.equal((await store.cachedVitals("one"))[0].value, 175);
    await store.resolveConflict("one", sample.id, "local", 4);
    const recovery = (await store.queuedChanges("one"))[0];
    assert.equal(recovery.samples[0].version, 4);
    assert.equal(recovery.samples[0].value, 175);
  } finally {
    db.close();
  }
});
test("cursor and remote page rollback together; account mismatch never persists", async () => {
  const { db, store, failQueue } = open();
  try {
    await store.applyRemotePage("one", [{ ...sample, version: 1 }], 1);
    failQueue(true);
    await assert.rejects(
      store.applyRemotePage("one", [{ ...sample, version: 2, value: 185 }], 2),
    );
    failQueue(false);
    assert.equal(await store.syncCursor("one"), 1);
    assert.equal((await store.cachedVitals("one"))[0].value, 170);
    await assert.rejects(
      store.applyRemotePage("two", [{ ...sample, version: 1 }], 1),
      /Invalid sync page/,
    );
    assert.deepEqual(await store.cachedVitals("two"), []);
  } finally {
    db.close();
  }
});

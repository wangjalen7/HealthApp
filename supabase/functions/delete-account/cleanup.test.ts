import assert from "node:assert/strict";
import test from "node:test";
import { cleanupAccount } from "./cleanup";
test("deletion retries after storage failure and never claims premature completion", async () => {
  let objects = [{ bucket_id: "photos", name: "owned/orphan" }], failed = true;
  const calls: string[] = [];
  const deps = {
    list: async () => objects,
    remove: async () => { calls.push("storage"); if (failed) throw Error("offline"); objects = []; },
    deleteAuth: async () => { calls.push("auth"); },
    finish: async () => { calls.push("verified"); },
  };
  await assert.rejects(cleanupAccount(deps));
  assert.deepEqual(calls, ["storage"]);
  failed = false;
  await cleanupAccount(deps);
  assert.deepEqual(calls, ["storage", "storage", "auth", "verified"]);
});
test("Auth failure and verification failure remain incomplete", async () => {
  let finished = false;
  await assert.rejects(cleanupAccount({ list: async () => [], remove: async () => {}, deleteAuth: async () => { throw Error("auth failed"); }, finish: async () => { finished = true; } }));
  assert.equal(finished, false);
  await assert.rejects(cleanupAccount({ list: async () => [], remove: async () => {}, deleteAuth: async () => {}, finish: async () => { throw Error("remaining rows"); } }));
});

import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createStepStore } from "../steps/store-core";

test("one explicit Health connection enables both stores, preserves history and anchors, and does not import vitals", async () => {
  const values = new Map<string, string>();
  let requests = 0,
    fail = false;
  const store = createStepStore(
    {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        values.set(key, value);
      },
    },
    {
      authorizeSteps: async () => {
        requests++;
        if (fail) throw Error("unavailable");
      },
      readStepBuckets: async () => {
        throw Error("Connection must not query or upload readings");
      },
    },
  );
  let state = {
    connected: false,
    anchors: { weight: "existing" },
    lastImportedAt: "2026-10-01T00:00:00Z",
  };
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.__healthConnection = {
    connect: store.connectSteps,
    load: async () => state,
    save: async (_user: string, next: typeof state) => {
      state = next;
    },
  };
  const modules: Record<string, string> = {
    "../steps/storage":
      "export const connectSteps=globalThis.__healthConnection.connect;",
    "./state":
      "export const loadHealthKitSyncState=globalThis.__healthConnection.load,saveHealthKitSyncState=globalThis.__healthConnection.save;",
    "./reader":
      'export const healthKitAvailability=async()=>({available:true}),readHealthKitData=async()=>{throw Error("Unexpected import")};',
    "../vitals/sync":
      "export const loadCachedVitals=async()=>[],queueLocalVitals=async()=>{},syncVitals=async()=>{},markVitalsDeleted=async()=>{};",
  };
  const output = resolve("dist", `health-connection-${process.pid}.cjs`);
  try {
    const bundle = await build({
      entryPoints: ["src/features/healthkit/sync.ts"],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      plugins: [
        {
          name: "health-connection",
          setup(b) {
            b.onResolve({ filter: /.*/ }, (a) =>
              a.path in modules
                ? { path: a.path, namespace: "connection" }
                : undefined,
            );
            b.onLoad({ filter: /.*/, namespace: "connection" }, (a) => ({
              contents: modules[a.path],
            }));
          },
        },
      ],
    });
    await mkdir(resolve("dist"), { recursive: true });
    await writeFile(output, bundle.outputFiles[0]!.contents);
    const { connectHealthKit } = createRequire(output)(output);
    await connectHealthKit("a");
    assert.equal(requests, 1);
    assert.equal((await store.readStepCache("a")).connected, true);
    assert.deepEqual(state, {
      connected: true,
      anchors: { weight: "existing" },
      lastImportedAt: "2026-10-01T00:00:00Z",
    });
    fail = true;
    await assert.rejects(connectHealthKit("b"), /unavailable/);
    assert.equal((await store.readStepCache("b")).connected, false);
  } finally {
    delete globals.__healthConnection;
    await unlink(output).catch(() => undefined);
  }
});

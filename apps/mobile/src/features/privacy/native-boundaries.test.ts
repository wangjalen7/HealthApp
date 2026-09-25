import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";

async function adapter(
  entry: string,
  modules: Record<string, string>,
  name: string,
) {
  const output = resolve("dist", `privacy-${name}-${process.pid}.cjs`);
  const built = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name,
        setup(b) {
          b.onResolve({ filter: /.*/ }, (a) =>
            a.path in modules ? { path: a.path, namespace: name } : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: name }, (a) => ({
            contents: modules[a.path],
          }));
        },
      },
    ],
  });
  await mkdir(resolve("dist"), { recursive: true });
  await writeFile(output, built.outputFiles[0].contents);
  try {
    return createRequire(output)(output);
  } finally {
    await unlink(output);
  }
}

test("native credential failure cannot downgrade into ordinary storage; successful writes remove old copies", async () => {
  const ordinary = new Map<string, string>([["credential", "old"]]);
  let fail = true,
    accessibility: unknown,
    nativeReads = 0;
  const native = {
    getItemAsync: async () => {
      nativeReads++;
      throw Error("locked");
    },
    setItemAsync: async (_k: string, _v: string, options: unknown) => {
      if (fail) throw Error("locked");
      accessibility = options;
    },
    deleteItemAsync: async () => {
      if (fail) throw Error("locked");
    },
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  };
  const storage = {
    getItem: async (k: string) => ordinary.get(k),
    setItem: async (k: string, v: string) => {
      ordinary.set(k, v);
    },
    removeItem: async (k: string) => {
      ordinary.delete(k);
    },
  };
  Object.assign(globalThis, { __privacyNative: { native, storage } });
  const modules = {
    "react-native": 'export const Platform={OS:"ios"};',
    "expo-secure-store": "module.exports=globalThis.__privacyNative.native;",
    "@react-native-async-storage/async-storage":
      "module.exports=globalThis.__privacyNative.storage;",
  };
  const { secureStoreAdapter: a } = await adapter(
    "src/lib/secure-store.ts",
    modules,
    "credentials",
  );
  await assert.rejects(a.getItem("credential"), /locked/);
  assert.equal(nativeReads, 1);
  await assert.rejects(a.setItem("credential", "new"), /locked/);
  assert.equal(ordinary.get("credential"), "old");
  fail = false;
  await a.setItem("credential", "new");
  assert.deepEqual(accessibility, { keychainAccessible: "device-only" });
  assert.equal(ordinary.has("credential"), false);
  ordinary.set("credential", "old");
  await a.removeItem("credential");
  assert.equal(ordinary.has("credential"), false);
  delete (globalThis as Record<string, unknown>).__privacyNative;
});

test("Apple Health disconnect drains an active import and persists off before later sync", async () => {
  let state = { connected: true },
    imports = 0;
  let finish!: () => void;
  const pending = new Promise<void>((r) => {
    finish = r;
  });
  Object.assign(globalThis, {
    __privacyHealth: {
      load: async () => state,
      save: async (_u: string, s: typeof state) => {
        state = s;
      },
      import: async () => {
        imports++;
        await pending;
        state = { connected: true };
        return {
          lastImportedAt: "2026-09-25",
          weightCount: 1,
          bloodPressureCount: 0,
        };
      },
    },
  });
  const { synchronizeHealthData, disconnectHealthKit } = await adapter(
    "src/features/healthkit/unified-sync.ts",
    {
      "./sync":
        "export const loadHealthKitSyncState=globalThis.__privacyHealth.load, importHealthKitData=globalThis.__privacyHealth.import;",
      "./state":
        "export const saveHealthKitSyncState=globalThis.__privacyHealth.save;",
      "../vitals/sync":
        'export const syncVitals=async()=>({lastSyncedAt:"2026-09-25"});',
    },
    "health",
  );
  const sync = synchronizeHealthData("synthetic-user");
  await new Promise((r) => setImmediate(r));
  assert.equal(imports, 1);
  const disconnect = disconnectHealthKit("synthetic-user");
  finish();
  await Promise.all([sync, disconnect]);
  assert.equal(state.connected, false);
  await synchronizeHealthData("synthetic-user");
  assert.equal(imports, 1);
  delete (globalThis as Record<string, unknown>).__privacyHealth;
});

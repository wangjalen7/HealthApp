import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fluidDraftSchema, fluidDefaults } from "./helper-model";

test("helper drafts isolate accounts, serialize writes, recover malformed data and protect newer edits", async () => {
  const values = new Map<string, string>();
  let rejectWrite = false;
  Object.assign(globalThis, {
    __goalDraftStorage: {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (rejectWrite) {
          rejectWrite = false;
          throw Error("Unavailable");
        }
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
    },
  });
  const output = resolve("dist", `helper-draft-test-${process.pid}.cjs`);
  await mkdir(resolve("dist"), { recursive: true });
  const built = await build({
    entryPoints: [resolve("src/features/goals/helper-draft.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "storage-adapter",
        setup(builder) {
          builder.onResolve(
            { filter: /^@react-native-async-storage\/async-storage$/ },
            () => ({ path: "storage", namespace: "adapter" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "adapter" }, () => ({
            contents: "export default globalThis.__goalDraftStorage",
          }));
        },
      },
    ],
  });
  await writeFile(output, built.outputFiles[0].contents);
  try {
    const api = createRequire(import.meta.url)(
      output,
    ) as typeof import("./helper-draft");
    const a = { ...fluidDefaults("ml"), custom: "123", customMl: 123 };
    const b = { ...a, custom: "234", customMl: 234 };
    await Promise.all([
      api.storeHelperDraft("account-a", "fluids", a),
      api.storeHelperDraft("account-a", "fluids", b),
      api.storeHelperDraft("account-b", "fluids", a),
    ]);
    assert.equal(
      (await api.loadHelperDraft("account-a", "fluids", fluidDraftSchema))!
        .custom,
      "234",
    );
    assert.equal(
      (await api.loadHelperDraft("account-b", "fluids", fluidDraftSchema))!
        .custom,
      "123",
    );
    await api.storeHelperDraft("account-a", "fluids", null, a);
    assert.equal(
      (await api.loadHelperDraft("account-a", "fluids", fluidDraftSchema))!
        .custom,
      "234",
    );
    await api.storeHelperDraft("account-a", "fluids", null, b);
    assert.equal(
      await api.loadHelperDraft("account-a", "fluids", fluidDraftSchema),
      undefined,
    );
    for (const raw of ["{bad", JSON.stringify({ unit: "unknown" })]) {
      values.set(api.helperDraftKey("account-a", "fluids"), raw);
      assert.equal(
        await api.loadHelperDraft("account-a", "fluids", fluidDraftSchema),
        undefined,
      );
    }
    rejectWrite = true;
    await assert.rejects(
      api.storeHelperDraft("account-a", "fluids", a),
      /Unavailable/,
    );
    await api.storeHelperDraft("account-a", "fluids", b);
    assert.equal(
      (await api.loadHelperDraft("account-a", "fluids", fluidDraftSchema))!
        .custom,
      "234",
    );
    assert.equal(
      (await api.loadHelperDraft("account-b", "fluids", fluidDraftSchema))!
        .custom,
      "123",
    );
  } finally {
    await unlink(output);
    Reflect.deleteProperty(globalThis, "__goalDraftStorage");
  }
});

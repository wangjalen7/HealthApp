import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { AccountSetup } from "./model";
test("setup ignores late reads across accounts and cannot overwrite a newer accepted save", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const pending: { userId: string; resolve: (value: AccountSetup) => void }[] =
    [];
  const harness = {
    userId: "a",
    load: (userId: string) =>
      new Promise<AccountSetup>((resolve) => pending.push({ userId, resolve })),
  };
  Object.assign(globalThis, { __setupTest: harness });
  const output = resolve("dist", `setup-provider-${process.pid}.cjs`);
  await mkdir(resolve("dist"), { recursive: true });
  const built = await build({
    entryPoints: [resolve("src/features/onboarding/provider.tsx")],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react/jsx-runtime"],
    plugins: [
      {
        name: "setup-adapters",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(react-native|\.\.\/auth\/auth-provider|\.\/repository)$/,
            },
            (args) => ({ path: args.path, namespace: "setup-test" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "setup-test" }, (args) => ({
            contents:
              args.path === "react-native"
                ? "export const AppState={addEventListener:()=>({remove(){}})};"
                : args.path.endsWith("auth-provider")
                  ? "export const useAuth=()=>({session:{user:{id:globalThis.__setupTest.userId}}});"
                  : "export const resumeSetupWrite=async()=>{};export const getAccountSetup=globalThis.__setupTest.load;",
          }));
        },
      },
    ],
  });
  await writeFile(output, built.outputFiles[0].contents);
  const components = createRequire(output)(
    output,
  ) as typeof import("./provider");
  let state!: ReturnType<typeof components.useAccountSetup>;
  function Probe() {
    state = components.useAccountSetup();
    return null;
  }
  const snapshot = () => state;
  let tree!: ReactTestRenderer;
  const row = (user_id: string, version = 1) =>
    ({
      user_id,
      version,
      preferred_name: null,
      unit_system: "us",
      fluid_unit: "fl_oz",
      step: "name",
      completed_at: null,
      dismissed_setup: false,
    }) as AccountSetup;
  try {
    await act(async () => {
      tree = create(
        createElement(components.SetupProvider, {
          children: createElement(Probe),
        }),
      );
    });
    await act(async () => {
      harness.userId = "b";
      tree.update(
        createElement(components.SetupProvider, {
          children: createElement(Probe),
        }),
      );
    });
    assert.equal(snapshot().setup, undefined);
    await act(async () => {
      pending.find((p) => p.userId === "b")!.resolve(row("b"));
    });
    assert.equal(snapshot().setup?.user_id, "b");
    await act(async () => {
      pending.find((p) => p.userId === "a")!.resolve(row("a"));
    });
    assert.equal(snapshot().setup?.user_id, "b");
    await act(async () => {
      void state.reload();
    });
    await act(async () => {
      state.accept({ ...row("b", 3), completed_at: "2026-09-21" });
    });
    await act(async () => {
      pending.at(-1)!.resolve(row("b", 2));
    });
    assert.equal(snapshot().setup?.version, 3);
    assert.ok(snapshot().setup?.completed_at);
  } finally {
    await act(async () => tree?.unmount());
    await unlink(output);
    delete (globalThis as Record<string, unknown>).__setupTest;
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  emptyStepCache,
  normalizeStepStatistics,
  stepPeriod,
  type StepCache,
} from "./model";
import { dayKey } from "../summary/calendar";

test("Steps loads cache before native refresh, refreshes on foreground/pull, and ignores late results after account changes", async () => {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const now = new Date(),
    period = stepPeriod("D", dayKey(now));
  const cached: StepCache = {
    ...emptyStepCache(),
    connected: true,
    daily: normalizeStepStatistics(
      [{ startDate: period.start, sumQuantity: { quantity: 5500 } }],
      period.start,
      period.end,
      false,
      now,
    ),
  };
  const updated: StepCache = {
    ...cached,
    daily: cached.daily.map((b) => ({ ...b, total: 8000 })),
  };
  const pending: ((data: StepCache) => void)[] = [],
    calls: { user: string; force: boolean }[] = [];
  let foreground: ((state: string) => void) | undefined;
  globals.__stepLifecycle = {
    cached: async (user: string) => (user === "a" ? cached : emptyStepCache()),
    refresh: async (
      user: string,
      _s: Date,
      _e: Date,
      _h: boolean,
      force: boolean,
    ) => {
      calls.push({ user, force });
      return user === "a"
        ? new Promise<StepCache>((r) => pending.push(r))
        : emptyStepCache();
    },
    listen: (_name: string, callback: (state: string) => void) => {
      foreground = callback;
      return {
        remove: () => {
          foreground = undefined;
        },
      };
    },
  };
  const modules: Record<string, string> = {
    "react-native":
      'export const AppState={currentState:"active",addEventListener:globalThis.__stepLifecycle.listen};',
    "expo-router":
      'import {useEffect} from "react"; export const useFocusEffect=(callback)=>useEffect(callback,[callback]);',
    "./storage":
      "export const readStepCache=globalThis.__stepLifecycle.cached,refreshSteps=globalThis.__stepLifecycle.refresh,connectSteps=async()=>{},disconnectSteps=async()=>{};",
    "../healthkit/sync": "export const connectHealthKit=async()=>{};",
    "./reader": "export const stepAvailability=async()=>({available:true});",
  };
  const output = resolve("dist", `steps-lifecycle-${process.pid}.cjs`);
  let root: ReactTestRenderer | undefined;
  try {
    const bundle = await build({
      entryPoints: ["src/features/steps/use-steps.ts"],
      bundle: true,
      external: ["react"],
      write: false,
      platform: "node",
      format: "cjs",
      plugins: [
        {
          name: "steps-lifecycle",
          setup(b) {
            b.onResolve({ filter: /.*/ }, (a) =>
              a.path in modules
                ? { path: a.path, namespace: "step-life" }
                : undefined,
            );
            b.onLoad({ filter: /.*/, namespace: "step-life" }, (a) => ({
              contents: modules[a.path],
            }));
          },
        },
      ],
    });
    await mkdir(resolve("dist"), { recursive: true });
    await writeFile(output, bundle.outputFiles[0]!.contents);
    const { useSteps } = createRequire(output)(output);
    let result: ReturnType<typeof import("./use-steps").useSteps>;
    function Host({ user }: { user: string }) {
      result = useSteps(user, "D", undefined, true, false);
      return null;
    }
    const settle = () => new Promise<void>((r) => setImmediate(r));
    await act(async () => {
      root = create(React.createElement(Host, { user: "a" }));
    });
    assert.equal(result!.data!.daily[0]!.total, 5500);
    assert.equal(result!.loading, true);
    await act(async () => {
      pending.shift()!(updated);
      await settle();
    });
    assert.equal(result!.data!.daily[0]!.total, 8000);
    assert.equal(result!.loading, false);
    let pull: Promise<void>;
    await act(async () => {
      pull = result!.refresh(true);
      await settle();
    });
    assert.equal(calls.at(-1)!.force, true);
    await act(async () => {
      pending.shift()!(updated);
      await pull!;
    });
    await act(async () => {
      foreground!("active");
      await settle();
    });
    assert.equal(calls.filter((c) => c.user === "a").length, 3);
    await act(async () => {
      root!.update(React.createElement(Host, { user: "b" }));
      await settle();
    });
    assert.equal(result!.data!.connected, false);
    assert.equal(result!.data!.daily.length, 0);
    await act(async () => {
      pending.shift()!(updated);
      await settle();
    });
    assert.equal(
      result!.data!.daily.length,
      0,
      "late previous-account native results must not become visible",
    );
  } finally {
    if (root)
      await act(async () => {
        root!.unmount();
      });
    delete globals.__stepLifecycle;
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await unlink(output).catch(() => undefined);
  }
});

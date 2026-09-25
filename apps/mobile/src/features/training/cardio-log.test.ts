import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

test("late cardio restoration preserves edits and same-turn save taps submit only once", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let restore!: (value: unknown) => void, finishSave!: () => void;
  let saves = 0;
  const draft = new Promise((r) => {
    restore = r;
  });
  const saved = new Promise<void>((r) => {
    finishSave = r;
  });
  const harness = {
    draft,
    save: () => {
      saves++;
      return saved;
    },
  };
  Object.assign(globalThis, { __cardioPolish: harness });
  const output = resolve("dist", `cardio-polish-${process.pid}.cjs`);
  const hosts: Record<string, string> = {
    "react-native":
      'export const View="view", Text="text", TextInput="input", StyleSheet={ create: x=>x };',
    "expo-router":
      'import { useEffect } from "react"; export const router={push(){}}; export const useFocusEffect=callback=>useEffect(callback,[callback]);',
    "../../lib/mutations": "export const completePendingDraftSave=async()=>{};",
    "../../ui/tracking-styles": "export const trackingStyles={};",
    "../../ui/pressable": 'export const Pressable="button";',
    "../../ui/theme": "export const colors={};",
    "../auth/auth-provider":
      'export const useAuth=()=>({session:{user:{id:"account-a"}}});',
    "./cardio-draft":
      "export const loadCardioDraft=()=>globalThis.__cardioPolish.draft; export const saveCardioDraft=async()=>{}; export const clearCardioDraft=async()=>{}; export const cardioDraftHasContent=()=>true;",
    "./repository":
      "export const saveCardio=()=>globalThis.__cardioPolish.save();",
  };
  let tree: ReactTestRenderer | undefined;
  try {
    await mkdir(resolve("dist"), { recursive: true });
    const result = await build({
      entryPoints: [resolve("src/features/training/cardio-log.tsx")],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      jsx: "automatic",
      external: ["react", "react/jsx-runtime"],
      plugins: [
        {
          name: "cardio-hosts",
          setup(b) {
            b.onResolve({ filter: /.*/ }, (a) =>
              a.path in hosts ? { path: a.path, namespace: "host" } : undefined,
            );
            b.onLoad({ filter: /.*/, namespace: "host" }, (a) => ({
              contents: hosts[a.path],
            }));
          },
        },
      ],
    });
    await writeFile(output, result.outputFiles[0].contents);
    const { useCardioLog } = createRequire(output)(
      output,
    ) as typeof import("./cardio-log");
    let log!: ReturnType<typeof useCardioLog>;
    function Probe() {
      log = useCardioLog();
      return null;
    }
    await act(async () => {
      tree = create(createElement(Probe));
    });
    assert.equal(log.draftLoaded, false);
    await act(async () => {
      log.setActivityType("walk");
      log.setDuration("25");
      log.setNotes("Newly typed");
    });
    await act(async () => {
      restore({
        activityType: "run",
        durationMinutes: 5,
        notes: "Old saved draft",
      });
      await draft;
    });
    assert.equal(log.draftLoaded, true);
    assert.equal(log.activityType, "walk");
    assert.equal(log.duration, "25");
    assert.equal(log.notes, "Newly typed");
    let first!: Promise<void>, second!: Promise<void>;
    await act(async () => {
      first = log.save();
      second = log.save();
    });
    assert.equal(saves, 1);
    await act(async () => {
      finishSave();
      await Promise.all([first, second]);
    });
    assert.equal(log.feedback, "Cardio activity saved.");
    assert.equal(log.duration, "");
  } finally {
    if (tree) await act(async () => tree!.unmount());
    await unlink(output).catch(() => {});
    Reflect.deleteProperty(globalThis, "__cardioPolish");
  }
});

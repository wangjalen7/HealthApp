import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

test("biometric and password logos animate with cleanup; Reduce Motion keeps a static logo", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const harness = { reduced: false, loops: 0, stopped: 0, listeners: 0 };
  Object.assign(globalThis, { __logoPolish: harness });
  const hosts: Record<string, string> = {
    "react-native": `const h=globalThis.__logoPolish; const anim=()=>({start(){},stop(){}}); export const View="view",Image="image",Platform={OS:"ios"},StyleSheet={create:x=>x,absoluteFill:{}},Easing={linear:x=>x}; export const Animated={View:"animated-view",Image:"animated-image",Value:class{setValue(){} addListener(){h.listeners++;return "id";} removeListener(){h.listeners--;}},timing:anim,sequence:anim,parallel:anim,loop:()=>({start(){h.loops++;},stop(){h.stopped++;}})};`,
    "react-native-svg":
      'export default "svg"; export const Defs="defs", Image="svg-image",Mask="mask",Path="path";',
    "../../ui/motion":
      "export const useReducedMotion=()=>globalThis.__logoPolish.reduced;",
    "../../ui/appearance":
      'export const useAppAppearance=()=>({resolvedScheme:"dark"});',
  };
  const output = resolve("dist", `sustain-logo-polish-${process.pid}.cjs`);
  let tree: ReactTestRenderer | undefined;
  try {
    await mkdir(resolve("dist"), { recursive: true });
    const result = await build({
      entryPoints: [resolve("src/features/auth/sustain-brand.tsx")],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      jsx: "automatic",
      loader: { ".png": "dataurl" },
      external: ["react", "react/jsx-runtime"],
      plugins: [
        {
          name: "logo-hosts",
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
    const { SustainBrand } = createRequire(output)(
      output,
    ) as typeof import("./sustain-brand");
    await act(async () => {
      tree = create(createElement(SustainBrand, { motion: "biometric" }));
    });
    assert.equal(harness.loops, 1);
    assert.equal(harness.listeners, 1);
    assert.equal(tree!.root.findAllByType("path").length, 1);
    await act(async () =>
      tree!.update(createElement(SustainBrand, { motion: "pending" })),
    );
    assert.equal(harness.loops, 2);
    assert.equal(harness.stopped, 1);
    assert.equal(harness.listeners, 1);
    harness.reduced = true;
    await act(async () =>
      tree!.update(createElement(SustainBrand, { motion: "biometric" })),
    );
    assert.equal(harness.loops, 2);
    assert.equal(harness.stopped, 2);
    assert.equal(harness.listeners, 0);
    assert.equal(tree!.root.findAllByType("path").length, 0);
    await act(async () =>
      tree!.update(createElement(SustainBrand, { motion: "success" })),
    );
    assert.equal(tree!.root.findAllByType("image").length, 3);
  } finally {
    if (tree) await act(async () => tree!.unmount());
    await unlink(output).catch(() => {});
    Reflect.deleteProperty(globalThis, "__logoPolish");
  }
});

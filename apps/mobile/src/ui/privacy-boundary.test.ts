import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRequire } from "node:module";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { createElement, useEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

// Exercise the real boundary/modal components with lightweight native hosts.
// This checks React lifecycle and privacy behavior, not device biometrics.
const output = resolve("dist", `privacy-boundary-test-${process.pid}.cjs`);
let components: {
  PrivacyBoundary: typeof import("./privacy-boundary").PrivacyBoundary;
  Modal: typeof import("./modal").Modal;
};

before(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await mkdir(resolve("dist"), { recursive: true });
  const result = await build({
    stdin: {
      contents:
        'export { PrivacyBoundary } from "./privacy-boundary"; export { Modal } from "./modal";',
      resolveDir: resolve("src/ui"),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    external: ["react", "react/jsx-runtime"],
    plugins: [
      {
        name: "native-test-hosts",
        setup(builder) {
          builder.onResolve({ filter: /^react-native$/ }, () => ({
            path: "native",
            namespace: "test-host",
          }));
          builder.onResolve({ filter: /^\.\/motion$/ }, () => ({
            path: "motion",
            namespace: "test-host",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test-host" }, (args) => ({
            contents:
              args.path === "native"
                ? `export const View = "div";
                   export const Modal = "dialog";
                   export const Platform = { OS: "web" };
                   export const Keyboard = { dismiss() {} };
                   export const StyleSheet = { create: value => value,
                     hairlineWidth: 1, absoluteFillObject: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } };`
                : "export const useReducedMotion = () => false;",
          }));
        },
      },
    ],
  });
  await writeFile(output, result.outputFiles[0].contents);
  components = createRequire(output)(output);
});

after(async () => {
  await unlink(output).catch(() => {});
});

test("locking preserves the selected screen and unsaved input while concealing private content", async () => {
  let mounts = 0;
  function PrivateScreen() {
    const [route, setRoute] = useState("summary");
    const [draft, setDraft] = useState("");
    useEffect(() => {
      mounts += 1;
    }, []);
    return createElement("section", {
      route,
      draft,
      setRoute,
      setDraft,
    });
  }
  const render = (locked: boolean) =>
    createElement(components.PrivacyBoundary, {
      locked,
      lockScreen: createElement("aside"),
      children: createElement(PrivateScreen),
    });
  let tree!: ReactTestRenderer;
  await act(() => {
    tree = create(render(false));
  });
  await act(() => {
    tree.root.findByType("section").props.setRoute("workout");
    tree.root.findByType("section").props.setDraft("42");
  });
  for (const locked of [true, true, false, true, false]) {
    await act(() => tree.update(render(locked)));
    assert.equal(mounts, 1);
    assert.equal(tree.root.findByType("section").props.route, "workout");
    assert.equal(tree.root.findByType("section").props.draft, "42");
    const privateView = tree.root
      .findAllByType("div")
      .find((view) => view.props.pointerEvents !== undefined)!;
    assert.equal(privateView.props.pointerEvents, locked ? "none" : "auto");
    assert.equal(privateView.props.accessibilityElementsHidden, locked);
    assert.equal(privateView.props.inert, locked);
    assert.equal(tree.root.findAllByType("aside").length, locked ? 1 : 0);
    if (locked) assert.equal(privateView.props.style[1].opacity, 0);
  }
  await act(() => tree.unmount());
});

test("private dialogs are hidden immediately during lock and restored after unlock", async () => {
  const render = (locked: boolean) =>
    createElement(components.PrivacyBoundary, {
      locked,
      lockScreen: createElement("aside"),
      children: createElement(components.Modal, {
        visible: true,
        animationType: "slide",
        children: createElement("p"),
      }),
    });
  let tree!: ReactTestRenderer;
  await act(() => {
    tree = create(render(false));
  });
  assert.equal(tree.root.findByType("dialog").props.visible, true);
  await act(() => tree.update(render(true)));
  assert.equal(tree.root.findByType("dialog").props.visible, false);
  assert.equal(tree.root.findByType("dialog").props.animationType, "none");
  await act(() => tree.update(render(false)));
  assert.equal(tree.root.findByType("dialog").props.visible, true);
  await act(() => tree.unmount());
});

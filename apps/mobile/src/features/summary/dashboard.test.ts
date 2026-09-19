import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Layout } from "./layout";

// Render the real editor lifecycle with native hosts and a React Native-style
// window object, which exists without the browser's event-listener methods.
test("native Summary editor opens, cancels, saves and reopens without DOM APIs", async () => {
  const output = resolve("dist", `summary-native-test-${process.pid}.cjs`);
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let tree: ReactTestRenderer | undefined;
  try {
    await mkdir(resolve("dist"), { recursive: true });
    const hosts: Record<string, string> = {
      "react-native": `
        export const View = "view", Text = "text", ScrollView = "scroll", ActivityIndicator = "spinner";
        export const Platform = { OS: "ios" };
        export const StyleSheet = { create: value => value, absoluteFill: {} };
        export const useWindowDimensions = () => ({ width: 390, fontScale: 1 });
        export const AppState = { addEventListener: () => ({ remove() {} }) };
        export const PanResponder = { create: () => ({ panHandlers: {} }) };
        export const LayoutAnimation = { configureNext() {}, Presets: { easeInEaseOut: {} } };
        export const Animated = { View: "animated-view", ValueXY: class {
          setValue() {} getTranslateTransform() { return []; }
        } };`,
      "react-native-safe-area-context":
        "export const useSafeAreaInsets = () => ({ top: 0, bottom: 0 });",
      "expo-router":
        "const navigation = { addListener: () => () => {} }; export const useNavigation = () => navigation;",
      "../../ui/modal":
        "export const Modal = ({ visible, children }) => visible ? children : null;",
      "../../ui/pressable": 'export const Pressable = "button";',
      "../../ui/confirmation-actions":
        'export const ConfirmationActions = "confirmation";',
      "../../ui/privacy-boundary":
        "export const useContentLocked = () => false;",
      "../../ui/motion": "export const useReducedMotion = () => true;",
      "react-native-gesture-handler": `
        export const GestureHandlerRootView = "gesture-root";
        export const GestureDetector = ({ children }) => children;
        export const Gesture = { Pan: () => {
          const chain = {};
          for (const key of ["activateAfterLongPress", "minDistance", "runOnJS", "onStart", "onUpdate", "onEnd", "onFinalize"])
            chain[key] = () => chain;
          return chain;
        } };`,
      "../../ui/theme":
        "export const colors = {}; export const surfaces = { card: {} };",
      "../../lib/id": 'export const createUuid = () => "new-widget";',
      "./storage": `
        export let savedLayout = { version: 1, widgets: [{ id: "weight", type: "weight", size: "small", config: {} }] };
        export const loadLayout = async () => ({ layout: savedLayout });
        export const saveLayout = async (_user, layout) => { savedLayout = layout; };`,
    };
    const result = await build({
      stdin: {
        contents:
          'export { Dashboard } from "./dashboard"; export { savedLayout } from "./storage";',
        resolveDir: resolve("src/features/summary"),
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
          name: "summary-native-hosts",
          setup(builder) {
            builder.onResolve({ filter: /.*/ }, (args) =>
              args.path in hosts
                ? { path: args.path, namespace: "test-host" }
                : undefined,
            );
            builder.onLoad(
              { filter: /.*/, namespace: "test-host" },
              (args) => ({ contents: hosts[args.path] }),
            );
          },
        },
      ],
    });
    await writeFile(output, result.outputFiles[0].contents);
    const components = createRequire(output)(output) as {
      Dashboard: typeof import("./dashboard").Dashboard;
      savedLayout: Layout;
    };
    const editing: boolean[] = [];
    await act(async () => {
      tree = create(
        createElement(components.Dashboard, {
          user: "native-test",
          render: () => null,
          onLayoutChange: () => {},
          onEditingChange: (value) => editing.push(value),
        }),
      );
    });
    const press = async (label: string) => {
      await act(async () => {
        tree!.root
          .findAllByType("button")
          .find((node) => node.props.accessibilityLabel === label)!
          .props.onPress();
      });
    };
    await press("Edit Summary");
    assert.equal(editing.at(-1), true);
    await press("Cancel");
    assert.equal(editing.at(-1), false);
    await press("Edit Summary");
    await press("Customize Weight");
    await press("Weight Large");
    await press("Back to layout");
    await press("Done");
    assert.equal(editing.at(-1), false);
    assert.equal(components.savedLayout.widgets[0].size, "wide");
    await press("Edit Summary");
    await press("Cancel");
  } finally {
    if (tree) await act(() => tree!.unmount());
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    await unlink(output).catch(() => {});
  }
});

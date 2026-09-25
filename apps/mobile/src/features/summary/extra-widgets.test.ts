import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { habits, type Widget } from "./layout";
import { ruleConfigSchema } from "../streaks/model";
import type { SummaryData } from "./data";

test("every Small and Large streak renders text only inside native Text hosts", async () => {
  const output = resolve("dist", `extra-widgets-native-${process.pid}.cjs`);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const mocks: Record<string, string> = {
    "./widget-skeleton": 'export const WidgetSkeleton = "skeleton";',
    "react-native": `export const View = "view", Text = "text", ActivityIndicator = "spinner", Switch = "switch"; export const StyleSheet = { create: value => value };`,
    "expo-router": "export const useRouter = () => ({ push() {} });",
    "../../ui/pressable": 'export const Pressable = "button";',
    "../../ui/icon": 'export const Icon = "icon";',
    "../../ui/theme": "export const colors = {};",
    "../../ui/integer-slider": 'export const IntegerSlider = "slider";',
    "../../ui/segmented-control":
      'export const SegmentedControl = "segmented";',
    "../../ui/settings-sheet":
      'export const SettingsSheet = "sheet", ChoiceRow = "choice";',
    "../training/workout-draft":
      "export const muscleGroupLabel = value => value;",
    "../streaks/repository":
      "export const effectiveRuleDay = () => ''; export const saveRule = async () => {};",
    "./dashboard": 'export const Action = "action";',
  };
  let tree: ReactTestRenderer | undefined;
  try {
    await mkdir(resolve("dist"), { recursive: true });
    const result = await build({
      entryPoints: [resolve("src/features/summary/extra-widgets.tsx")],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      jsx: "automatic",
      external: ["react", "react/jsx-runtime"],
      plugins: [
        {
          name: "native-widget-hosts",
          setup(builder) {
            builder.onResolve({ filter: /.*/ }, (args) =>
              args.path in mocks
                ? { path: args.path, namespace: "host" }
                : undefined,
            );
            builder.onLoad({ filter: /.*/, namespace: "host" }, (args) => ({
              contents: mocks[args.path],
            }));
          },
        },
      ],
    });
    await writeFile(output, result.outputFiles[0].contents);
    const { ExtraWidget } = createRequire(output)(
      output,
    ) as typeof import("./extra-widgets");
    const data: SummaryData = {
      sources: {
        food: [],
        fluids: [],
        sessions: [],
        sets: [],
        cardio: [],
        vitals: [],
        reminders: [],
        schedules: [],
        goals: [],
        coverage: Object.fromEntries(
          ["food", "fluids", "training", "vitals", "reminders", "goals"].map(
            (source) => [source, { from: "2026-09-01", complete: true }],
          ),
        ),
      },
      rules: habits.map((habit) => ({
        habit,
        activation_day: "2026-09-16",
        effective_day: "2026-09-16",
        enabled: true,
        version: 1,
        config: ruleConfigSchema.parse({}),
      })),
      errors: [],
      workoutDraft: false,
      mealDraft: false,
      reminders: [],
      loadedAt: "2026-09-18T12:00:00Z",
      trainingComplete: true,
    };
    for (const habit of habits)
      for (const size of ["small", "wide"] as const) {
        const widget: Widget = {
          id: habit,
          type: "streaks",
          size,
          config: { habits: [habit] },
        };
        await act(async () => {
          tree = create(
            createElement(ExtraWidget, {
              widget,
              data,
              now: new Date(2026, 8, 18, 12),
              user: "synthetic",
              loading: false,
              reload() {},
            }),
          );
        });
        for (const host of tree!.root.findAll(
          (node) => typeof node.type === "string" && node.type !== "text",
        )) {
          assert.equal(
            host.children.some((child) => typeof child === "string"),
            false,
            `${habit}/${size}: raw text under ${host.type}`,
          );
        }
        assert.ok(
          tree!.root.findAllByType("text").length > 2,
          "Exercise initialized streak content",
        );
        await act(async () => tree!.unmount());
        tree = undefined;
      }
  } finally {
    if (tree) await act(async () => tree!.unmount());
    await unlink(output).catch(() => {});
  }
});

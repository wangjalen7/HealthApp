import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { healthKitReadAuthorizationTypes } from "../healthkit/permissions";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";

test("iOS bridge uses consolidated read-only Health access and uses merged cumulative hourly/calendar-day statistics", async () => {
  const calls: unknown[][] = [];
  const globalTest = globalThis as typeof globalThis & {
    __stepsBridge?: unknown;
  };
  globalTest.__stepsBridge = {
    requestAuthorization: async (...args: unknown[]) => {
      calls.push(["authorize", ...args]);
    },
    queryStatisticsCollectionForQuantity: async (...args: unknown[]) => {
      calls.push(["statistics", ...args]);
      return [{ startDate: args[2], sumQuantity: { quantity: 7000 } }];
    },
  };
  const output = resolve("dist", `steps-reader-${process.pid}.cjs`);
  try {
    const bundle = await build({
      entryPoints: ["src/features/steps/reader.ios.ts"],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      plugins: [
        {
          name: "steps-native-contract",
          setup(b) {
            b.onResolve(
              {
                filter:
                  /^(\.\.\/healthkit\/reader|@kingstinct\/react-native-healthkit)$/,
              },
              (args) => ({ path: args.path, namespace: "steps-contract" }),
            );
            b.onLoad({ filter: /.*/, namespace: "steps-contract" }, (args) => ({
              contents: args.path.startsWith("@")
                ? "module.exports=globalThis.__stepsBridge"
                : "export const healthKitAvailability=async()=>({available:true});",
            }));
          },
        },
      ],
    });
    await mkdir(resolve("dist"), { recursive: true });
    await writeFile(output, bundle.outputFiles[0]!.contents);
    const adapter = createRequire(output)(output);
    await adapter.authorizeSteps();
    const start = new Date(2026, 9, 1),
      end = new Date(2026, 9, 2);
    assert.equal(
      (await adapter.readStepBuckets(start, end, false))[0].total,
      7000,
    );
    await adapter.readStepBuckets(start, end, true);
    assert.deepEqual(calls[0], [
      "authorize",
      { toRead: [...healthKitReadAuthorizationTypes] },
    ]);
    assert.equal(calls.length, 3);
    for (const call of calls.slice(1)) {
      assert.equal(call[1], "HKQuantityTypeIdentifierStepCount");
      assert.deepEqual(call[2], ["cumulativeSum"]);
      assert.deepEqual(call[5], {
        unit: "count",
        filter: { date: { startDate: start, endDate: end } },
      });
    }
    assert.deepEqual(calls[1]![4], { day: 1 });
    assert.deepEqual(calls[2]![4], { hour: 1 });
  } finally {
    delete globalTest.__stepsBridge;
    await unlink(output).catch(() => undefined);
  }
});

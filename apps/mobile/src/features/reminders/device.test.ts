import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { routinePlan } from "./schedule-model";
import { defaultRoutines } from "./routine-model";

test("native adapter asks only on activation, does not reprompt denial, and captures startup/listener taps with calendar triggers", async () => {
  let permission = {
    status: "undetermined",
    canAskAgain: true,
    granted: false,
  };
  let requests = 0,
    listener: (value: unknown) => void = () => {},
    clears = 0;
  const scheduled: { identifier: string; trigger: Record<string, unknown> }[] =
    [];
  const response = {
    actionIdentifier: "default",
    notification: {
      date: 123,
      request: {
        identifier: "one",
        content: {
          data: {
            v: 2,
            userId: "a",
            source: "routine",
            category: "weight",
            slot: "weight",
          },
        },
      },
    },
  };
  const notifications = {
    setNotificationHandler: () => {},
    getPermissionsAsync: async () => permission,
    requestPermissionsAsync: async () => {
      requests++;
      permission = { status: "denied", canAskAgain: false, granted: false };
      return permission;
    },
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    SchedulableTriggerInputTypes: { CALENDAR: "calendar" },
    scheduleNotificationAsync: async (r: (typeof scheduled)[number]) => {
      scheduled.push(r);
      return r.identifier;
    },
    addNotificationResponseReceivedListener: (fn: typeof listener) => {
      listener = fn;
      return { remove() {} };
    },
    getLastNotificationResponse: () => response,
    clearLastNotificationResponse: () => {
      clears++;
    },
    DEFAULT_ACTION_IDENTIFIER: "default",
  };
  Object.assign(globalThis, { __routineDeviceTest: notifications });
  const output = resolve("dist", `routine-device-test-${process.pid}.cjs`);
  await mkdir(resolve("dist"), { recursive: true });
  const built = await build({
    entryPoints: [resolve("src/features/reminders/device.native.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "native-adapters",
        setup(builder) {
          builder.onResolve(
            { filter: /^(expo-notifications|react-native)$/ },
            (args) => ({ path: args.path, namespace: "device-test" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "device-test" },
            (args) => ({
              contents:
                args.path === "react-native"
                  ? "export const Platform={OS:'ios'};"
                  : "module.exports=globalThis.__routineDeviceTest;",
            }),
          );
        },
      },
    ],
  });
  await writeFile(output, built.outputFiles[0].text);
  const device = createRequire(import.meta.url)(
    output,
  ) as typeof import("./device.native");
  try {
    assert.equal(await device.notificationPermission(), "undetermined");
    assert.equal(requests, 0);
    assert.equal(await device.notificationPermission(true), "blocked");
    assert.equal(requests, 1);
    assert.equal(await device.notificationPermission(true), "blocked");
    assert.equal(requests, 1);
    permission = { status: "granted", canAskAgain: true, granted: true };
    assert.equal(await device.notificationPermission(), "allowed");
    const taps: string[] = [];
    const stop = device.observeNotificationTaps((t) => taps.push(t.key));
    listener(response);
    assert.equal(taps.length, 2);
    assert.equal(taps[0], taps[1]);
    listener({ ...response, actionIdentifier: "dismiss" });
    assert.equal(taps.length, 2);
    device.clearStartupResponse();
    assert.equal(clears, 1);
    stop();
    const p = defaultRoutines("a");

    p.categories.weight.enabled = true;
    await device.notificationAdapter.put(routinePlan(p)[0]);
    assert.deepEqual(scheduled[0].trigger, {
      type: "calendar",
      repeats: true,
      hour: 8,
      minute: 0,
      second: 0,
    });
    p.categories.weight.enabled = false;
    p.categories.workout.enabled = true;
    p.categories.workout.days = [0, 1, 2, 3, 4, 5, 6];
    await device.notificationAdapter.put(
      routinePlan(p, new Date(2026, 8, 22, 7))[0],
    );
    assert.deepEqual(scheduled[1].trigger, {
      type: "calendar",
      repeats: false,
      year: 2026,
      month: 9,
      day: 22,
      hour: 17,
      minute: 0,
      second: 0,
    });
    assert.ok(scheduled.every((r) => !("timezone" in r.trigger)));
  } finally {
    await unlink(output);
    Reflect.deleteProperty(globalThis, "__routineDeviceTest");
  }
});

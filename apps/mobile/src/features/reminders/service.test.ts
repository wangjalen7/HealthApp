import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultRoutines } from "./routine-model";
import {
  createReminder,
  type Reminder,
  type ReminderCompletion,
} from "./model";
import type { PendingRequest, ScheduleRequest } from "./schedule-model";

test("coordinated service preserves blocked choices, verifies replacement, isolates logout and cleans deletion orphans", async () => {
  const storage = new Map<string, string>();
  const pending = new Map<string, PendingRequest>();
  const custom = new Map<string, Reminder[]>();
  const history = new Map<string, ReminderCompletion[]>();
  let permission = "blocked",
    account = "a",
    fail = false,
    definitionWrites = 0;
  const discarded: (string | undefined)[] = [];
  const harness = {
    storage: {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: async (key: string) => {
        storage.delete(key);
      },
    },
    assertAccount: async (user: string) => {
      assert.equal(user, account);
    },
    permission: async () => permission,
    adapter: {
      list: async () => [...pending.values()],
      put: async (r: ScheduleRequest) => {
        if (fail && r.source === "routine")
          throw Error("Synthetic native failure");
        pending.set(r.id, {
          id: r.id,
          fingerprint: r.fingerprint,
          data: r.data,
        });
      },
      remove: async (id: string) => {
        pending.delete(id);
      },
    },
    listReminders: async (user: string) => custom.get(user) ?? [],
    listReminderCompletions: async (user: string) => history.get(user) ?? [],
    saveReminders: async (user: string, value: Reminder[]) => {
      definitionWrites++;
      custom.set(user, value);
    },
    saveReminderCompletions: async (
      user: string,
      value: ReminderCompletion[],
    ) => {
      history.set(user, value);
    },
    discardIntent: async (user?: string) => {
      discarded.push(user);
    },
  };
  Object.assign(globalThis, { __routineServiceTest: harness });
  const output = resolve("dist", `routine-service-test-${process.pid}.cjs`);
  await mkdir(resolve("dist"), { recursive: true });
  const built = await build({
    entryPoints: [resolve("src/features/reminders/service.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "routine-adapters",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(@react-native-async-storage\/async-storage|\.\.\/\.\.\/lib\/mutations|\.\/device|\.\/repository|\.\/intent-storage)$/,
            },
            (args) => ({ path: args.path, namespace: "routine-test" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "routine-test" },
            (args) => ({
              contents:
                "const h=globalThis.__routineServiceTest;" +
                (args.path.includes("async-storage")
                  ? "export default h.storage;"
                  : args.path.endsWith("mutations")
                    ? "export const assertAccount=h.assertAccount;"
                    : args.path === "./device"
                      ? "export const notificationAdapter=h.adapter,notificationPermission=h.permission,deviceNotificationsAvailable=true,clearStartupResponse=()=>{},presentedNotifications=async()=>[],dismissNotification=async()=>{};"
                      : args.path === "./intent-storage"
                        ? "export const discardIntent=h.discardIntent;"
                        : "export const listReminders=h.listReminders,listReminderCompletions=h.listReminderCompletions,saveReminders=h.saveReminders,saveReminderCompletions=h.saveReminderCompletions;"),
            }),
          );
        },
      },
    ],
  });
  await writeFile(output, built.outputFiles[0].text);
  const service = createRequire(import.meta.url)(
    output,
  ) as typeof import("./service");
  try {
    const bp = createReminder({
      userId: "a",
      kind: "blood_pressure",
      name: "Home BP",
      time: "08:00",
      additionalTimes: [],
      repeat: "daily",
      weekdays: [],
      startDate: "2026-01-01",
    });
    custom.set("a", [bp]);
    const completed = [
      {
        reminderId: bp.id,
        localDay: "2026-01-02",
        completedAt: "2026-01-02T08:00:00Z",
      },
    ];
    history.set("a", completed);
    const p = defaultRoutines("a");

    p.categories.blood_pressure.enabled = true;
    p.replacements = [bp.id];
    const blocked = await service.saveRoutinePreferences(p, true);
    assert.equal(blocked.permission, "blocked");
    assert.equal(blocked.count, 0);
    assert.equal(custom.get("a")![0].enabled, true);
    assert.deepEqual(history.get("a"), completed);
    assert.equal(
      JSON.parse(storage.get("healthapp:routines:v1:a")!).categories
        .blood_pressure.enabled,
      true,
    );
    permission = "allowed";
    fail = true;
    await assert.rejects(
      service.refreshReminderSchedules("a"),
      /Synthetic native failure/,
    );
    assert.equal(custom.get("a")![0].enabled, true);
    assert.ok([...pending.values()].some((n) => n.data?.source === "custom"));
    fail = false;
    await service.refreshReminderSchedules("a");
    assert.equal(custom.get("a")![0].enabled, false);
    assert.deepEqual(history.get("a"), completed);
    assert.equal(
      [...pending.values()].filter((n) => n.data?.source === "custom").length,
      0,
    );
    const writes = definitionWrites;
    await service.refreshReminderSchedules("a");
    assert.equal(definitionWrites, writes);
    const medication = {
      ...bp,
      id: "medication",
      kind: "medication" as const,
      enabled: true,
    };
    await service.saveCustomConfiguration(
      "a",
      [
        ...custom.get("a")!,
        medication,
        {
          ...medication,
          id: "paused-supplement",
          kind: "supplement",
          enabled: false,
        },
        { ...medication, id: "other-custom", kind: "custom" },
      ],
      completed,
    );
    const choices = custom.get("a")!.map((r) => [r.id, r.enabled]);
    permission = "blocked";
    await service.saveRoutinePreferences({ ...p, medicationEnabled: false });
    assert.ok(
      [...pending.values()].every((n) => n.data?.reminderId !== "medication"),
    );
    assert.ok(
      [...pending.values()].some((n) => n.data?.reminderId === "other-custom"),
    );
    assert.deepEqual(
      custom.get("a")!.map((r) => [r.id, r.enabled]),
      choices,
    );
    permission = "allowed";
    await service.saveRoutinePreferences({ ...p, medicationEnabled: true });
    assert.ok(
      [...pending.values()].some((n) => n.data?.reminderId === "medication"),
    );
    assert.ok(
      [...pending.values()].every(
        (n) => n.data?.reminderId !== "paused-supplement",
      ),
    );
    assert.deepEqual(history.get("a"), completed);
    const saved = storage.get("healthapp:routines:v1:a");
    await service.cancelOutgoingRoutines("a");
    assert.ok([...pending.values()].every((n) => n.data?.source === "custom"));
    assert.equal(storage.get("healthapp:routines:v1:a"), saved);
    await service.activateReminderAccount("a");
    assert.ok([...pending.values()].some((n) => n.data?.source === "routine"));
    const existingCustom = custom.get("a")!;
    custom.set("a", [
      ...existingCustom,
      ...Array.from({ length: 61 }, (_, i) => ({
        ...medication,
        id: `capacity-${i}`,
      })),
    ]);
    await assert.rejects(
      service.saveRoutinePreferences({
        ...p,
        categories: {
          ...p.categories,
          blood_pressure: { ...p.categories.blood_pressure, enabled: false },
        },
      }),
      /capacity/,
    );
    assert.ok([...pending.values()].every((n) => n.data?.source !== "routine"));
    assert.ok(
      [...pending.values()].some((n) => n.data?.reminderId === "medication"),
    );
    custom.set("a", existingCustom);
    await service.saveRoutinePreferences({ ...p, replacements: [] });
    account = "b";
    await service.activateReminderAccount("b");
    assert.ok([...pending.values()].every((n) => n.data?.source === "custom"));
    assert.ok([...pending.values()].some((n) => n.data?.userId === "a"));
    account = "a";
    pending.set("legacy-orphan", { id: "legacy-orphan" });
    storage.set(
      "healthapp:notification-legacy:v2:a",
      JSON.stringify(["legacy-orphan"]),
    );
    pending.set("other-account", {
      id: "other-account",
      data: { userId: "b" },
    });
    await service.deleteAccountNotifications("a");
    assert.deepEqual([...pending.keys()], ["other-account"]);
    assert.equal(discarded.at(-1), "a");
    await assert.rejects(service.saveRoutinePreferences(defaultRoutines("b")));
  } finally {
    await unlink(output);
    Reflect.deleteProperty(globalThis, "__routineServiceTest");
  }
});

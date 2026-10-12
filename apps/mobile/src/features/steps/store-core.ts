import {
  stepCacheSchema,
  emptyStepCache,
  replaceStepBuckets,
  stepsNeedRefresh,
  type StepCache,
} from "./model";
import { deviceZone, dayBounds, dayKey, shiftDay } from "../summary/calendar";

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
type Reader = {
  authorizeSteps(): Promise<void>;
  readStepBuckets(
    start: Date,
    end: Date,
    hourly: boolean,
  ): Promise<StepCache["daily"]>;
};
export function createStepStore(
  storage: Storage,
  reader: Reader,
  zoneForDevice = deviceZone,
  clock = () => new Date(),
) {
  const { authorizeSteps, readStepBuckets } = reader;
  const connectionKey = (user: string) =>
    `healthapp:steps-connected:v1:${user}`;
  const key = (user: string, zone: string) =>
    `healthapp:steps:v1:${user}:${zone}`;
  const queues = new Map<string, Promise<unknown>>();
  async function readStepCache(
    user: string,
    zone = zoneForDevice(),
  ): Promise<StepCache> {
    return readStored(user, zone);
  }
  async function readStored(user: string, zone: string) {
    const raw = await storage.getItem(key(user, zone));
    let parsed;
    try {
      parsed = stepCacheSchema.safeParse(raw ? JSON.parse(raw) : null);
    } catch {
      parsed = undefined;
    }
    const cache =
      parsed?.success && parsed.data.zone === zone
        ? parsed.data
        : emptyStepCache(zone);
    const connection = await storage.getItem(connectionKey(user));
    return {
      ...cache,
      connected: connection === null ? cache.connected : connection === "true",
    };
  }
  function serialize<T>(user: string, zone: string, work: () => Promise<T>) {
    const id = key(user, zone);
    const next = (queues.get(id) ?? Promise.resolve())
      .catch(() => undefined)
      .then(work);
    queues.set(id, next);
    void next
      .finally(() => {
        if (queues.get(id) === next) queues.delete(id);
      })
      .catch(() => undefined);
    return next;
  }
  async function connectSteps(
    user: string,
    zone = zoneForDevice(),
    onAuthorized?: () => Promise<void>,
  ) {
    // Completion means permission was requested, never proof of read authorization.
    return serialize(user, zone, async () => {
      await authorizeSteps();
      // Keep the unified Health connection inside the account's drainable queue.
      await onAuthorized?.();
      const cache = { ...(await readStored(user, zone)), connected: true };
      await storage.setItem(connectionKey(user), "true");
      await storage.setItem(key(user, zone), JSON.stringify(cache));
      return cache;
    });
  }
  function refreshSteps(
    user: string,
    start: Date,
    end: Date,
    hourly: boolean,
    force = false,
    zone = zoneForDevice(),
  ) {
    return serialize(user, zone, async () => {
      if (zone !== zoneForDevice())
        throw Error("Time zone changed. Reopen Steps to update.");
      const cache = await readStored(user, zone);
      if (!cache.connected) return cache;
      const now = clock();
      const recentStart = dayBounds(shiftDay(dayKey(now), -7)).start;
      const todayEnd = dayBounds(shiftDay(dayKey(now), 1)).start;
      let daily = cache.daily,
        hours = cache.hourly;
      // Always revisit the recent week for late arrivals, corrections and deletions.
      if (force || stepsNeedRefresh(daily, recentStart, todayEnd, false, now))
        daily = replaceStepBuckets(
          daily,
          await readStepBuckets(recentStart, todayEnd, false),
        );
      if (hourly && (force || stepsNeedRefresh(hours, start, end, true, now)))
        hours = replaceStepBuckets(
          hours,
          await readStepBuckets(start, end, true),
        );
      if (
        (start < recentStart || end > todayEnd) &&
        (force || stepsNeedRefresh(daily, start, end, false, now))
      )
        daily = replaceStepBuckets(
          daily,
          await readStepBuckets(start, end, false),
        );
      if (zone !== zoneForDevice())
        throw Error("Time zone changed. Reopen Steps to update.");
      const updated = { ...cache, daily, hourly: hours };
      await storage.setItem(key(user, zone), JSON.stringify(updated));
      return updated;
    });
  }
  function disconnectSteps(user: string, zone = zoneForDevice()) {
    return serialize(user, zone, async () => {
      await storage.setItem(connectionKey(user), "false");
    });
  }
  async function drainSteps(user: string) {
    await Promise.allSettled(
      [...queues]
        .filter(([id]) => id.startsWith(`healthapp:steps:v1:${user}:`))
        .map(([, work]) => work),
    );
  }

  return {
    readStepCache,
    connectSteps,
    disconnectSteps,
    refreshSteps,
    drainSteps,
  };
}

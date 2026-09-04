import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  type Reminder,
  type ReminderCompletion,
  reminderCompletionSchema,
  reminderSchema,
} from "./model";

const writes = new Map<string, Promise<void>>();
const remindersKey = (userId: string) => `healthapp:reminders:${userId}`;
const completionsKey = (userId: string) =>
  `healthapp:reminder-completions:${userId}`;

function queueWrite(key: string, operation: () => Promise<void>) {
  const next = (writes.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(operation)
    .finally(() => {
      if (writes.get(key) === next) writes.delete(key);
    });
  writes.set(key, next);
  return next;
}

async function readList<T>(
  key: string,
  parse: (value: unknown) => { success: boolean; data?: T },
): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.flatMap((value) => {
      const result = parse(value);
      return result.success && result.data ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export async function listReminders(userId: string): Promise<Reminder[]> {
  const reminders = await readList(remindersKey(userId), (value) =>
    reminderSchema.safeParse(value),
  );
  return reminders.sort((left, right) => left.time.localeCompare(right.time));
}

export function saveReminders(userId: string, reminders: Reminder[]) {
  const parsed = reminders.map((reminder) => reminderSchema.parse(reminder));
  return queueWrite(remindersKey(userId), () =>
    AsyncStorage.setItem(remindersKey(userId), JSON.stringify(parsed)),
  );
}

export async function listReminderCompletions(
  userId: string,
): Promise<ReminderCompletion[]> {
  return readList(completionsKey(userId), (value) =>
    reminderCompletionSchema.safeParse(value),
  );
}

export function saveReminderCompletions(
  userId: string,
  completions: ReminderCompletion[],
) {
  const parsed = completions
    .map((completion) => reminderCompletionSchema.parse(completion))
    .slice(-800);
  return queueWrite(completionsKey(userId), () =>
    AsyncStorage.setItem(completionsKey(userId), JSON.stringify(parsed)),
  );
}

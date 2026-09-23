import assert from "node:assert/strict";
import test from "node:test";

import {
  createReminderCompletion,
  createReminder,
  currentReminderCompletion,
  reminderIsComplete,
  repeatSummary,
  timeParts,
  upcomingReminderOccurrences,
} from "./model";

test("a medication reminder keeps its structured schedule", () => {
  const reminder = createReminder({
    userId: "user-1",
    kind: "medication",
    name: "Vitamin D",
    time: "08:30",
    additionalTimes: [],
    repeat: "weekdays",
    startDate: "2026-09-04",
    weekdays: [1, 2, 3, 4, 5],
  });
  assert.equal(reminder.name, "Vitamin D");
  assert.deepEqual(timeParts(reminder.time), { hour: 8, minute: 30 });
  assert.equal(reminder.notificationIds.length, 0);
});

test("a daily completion applies only to its own local day", () => {
  const completions = [
    {
      reminderId: "reminder-1",
      localDay: "2026-09-04",
      completedAt: "2026-09-04T13:00:00.000Z",
    },
  ];
  assert.equal(
    reminderIsComplete("reminder-1", completions, "2026-09-04"),
    true,
  );
  assert.equal(
    reminderIsComplete("reminder-1", completions, "2026-09-05"),
    false,
  );
  assert.equal(reminderIsComplete("other", completions, "2026-09-04"), false);
});

test("weekly summaries state selected days and time", () => {
  assert.equal(
    repeatSummary({
      repeat: "weekly",
      intervalDays: 2,
      weekdays: [1],
      startDate: "2026-09-04",
      time: "09:00",
      additionalTimes: [],
    }),
    "Mon at 9:00 AM",
  );
});

test("multiple-daily reminders keep every distinct selected time", () => {
  const reminder = createReminder({
    userId: "user-1",
    kind: "custom",
    name: "Stretch",
    time: "08:00",
    additionalTimes: ["13:00", "18:00", "13:00"],
    repeat: "multiple_daily",
    startDate: "2026-09-04",
    weekdays: [],
  });
  assert.equal(
    repeatSummary(reminder),
    "Every day at 8:00 AM, 1:00 PM, 6:00 PM",
  );
});

test("daily completion suppresses today but preserves tomorrow", () => {
  const reminder = createReminder({
    userId: "user-1",
    kind: "medication",
    name: "Daily medicine",
    time: "09:00",
    additionalTimes: [],
    repeat: "daily",
    startDate: "2026-09-04",
    weekdays: [],
  });
  const now = new Date(2026, 8, 4, 7, 0);
  const completion = createReminderCompletion(reminder, now);
  const occurrences = upcomingReminderOccurrences(
    [reminder],
    [completion],
    now,
    2,
  );
  assert.deepEqual(
    occurrences.map(({ localDay, scheduledTime }) => ({
      localDay,
      scheduledTime,
    })),
    [
      { localDay: "2026-09-05", scheduledTime: "09:00" },
      { localDay: "2026-09-06", scheduledTime: "09:00" },
    ],
  );
});

test("multiple-daily completion targets only the latest due time", () => {
  const reminder = createReminder({
    userId: "user-1",
    kind: "supplement",
    name: "Split supplement",
    time: "08:00",
    additionalTimes: ["13:00", "18:00"],
    repeat: "multiple_daily",
    startDate: "2026-09-04",
    weekdays: [],
  });
  const completedAt = new Date(2026, 8, 4, 14, 0);
  const completion = createReminderCompletion(reminder, completedAt);
  assert.equal(completion.scheduledTime, "13:00");
  assert.equal(
    currentReminderCompletion(reminder, [completion], completedAt),
    completion,
  );
  assert.equal(
    currentReminderCompletion(
      reminder,
      [completion],
      new Date(2026, 8, 4, 18, 30),
    ),
    undefined,
  );
  const occurrences = upcomingReminderOccurrences(
    [reminder],
    [completion],
    completedAt,
    3,
  );
  assert.deepEqual(
    occurrences.map(({ localDay, scheduledTime }) => ({
      localDay,
      scheduledTime,
    })),
    [
      { localDay: "2026-09-04", scheduledTime: "18:00" },
      { localDay: "2026-09-05", scheduledTime: "08:00" },
      { localDay: "2026-09-05", scheduledTime: "13:00" },
    ],
  );
});

test("early multiple-daily completion suppresses only the first upcoming time", () => {
  const reminder = createReminder({
    userId: "user-1",
    kind: "custom",
    name: "Stretch",
    time: "08:00",
    additionalTimes: ["13:00", "18:00"],
    repeat: "multiple_daily",
    startDate: "2026-09-04",
    weekdays: [],
  });
  const now = new Date(2026, 8, 4, 7, 0);
  const completion = createReminderCompletion(reminder, now);
  assert.equal(completion.scheduledTime, "08:00");
  assert.deepEqual(
    upcomingReminderOccurrences([reminder], [completion], now, 2).map(
      ({ scheduledTime }) => scheduledTime,
    ),
    ["13:00", "18:00"],
  );
});

test("every few days uses the start-date anchor and independently completes each time", () => {
  const r = createReminder({
    userId: "a",
    kind: "supplement",
    name: "Synthetic supplement",
    repeat: "interval",
    intervalDays: 3,
    startDate: "2026-09-01",
    weekdays: [],
    time: "08:00",
    additionalTimes: ["20:00"],
  });
  const now = new Date(2026, 8, 3, 7);
  const occurrences = upcomingReminderOccurrences([r], [], now, 5);
  assert.deepEqual(
    occurrences.map((o) => [o.localDay, o.scheduledTime]),
    [
      ["2026-09-04", "08:00"],
      ["2026-09-04", "20:00"],
      ["2026-09-07", "08:00"],
      ["2026-09-07", "20:00"],
      ["2026-09-10", "08:00"],
    ],
  );
  const completion = createReminderCompletion(r, new Date(2026, 8, 4, 8));
  assert.equal(completion.scheduledTime, "08:00");
  assert.equal(
    currentReminderCompletion(r, [completion], new Date(2026, 8, 4, 20)),
    undefined,
  );
  const remaining = upcomingReminderOccurrences([r], [completion], now, 2);
  assert.deepEqual(
    remaining.map((o) => [o.localDay, o.scheduledTime]),
    [
      ["2026-09-04", "20:00"],
      ["2026-09-07", "08:00"],
    ],
  );
  assert.match(repeatSummary(r), /Every 3 days/);
});
test("selected weekdays support several times without adding off-day occurrences", () => {
  const r = createReminder({
    userId: "a",
    kind: "medication",
    name: "Synthetic",
    repeat: "weekdays",
    startDate: "2026-09-01",
    weekdays: [1, 3],
    time: "08:00",
    additionalTimes: ["20:00"],
  });
  assert.deepEqual(
    upcomingReminderOccurrences([r], [], new Date(2026, 8, 22, 7), 4).map(
      (o) => [o.localDay, o.scheduledTime],
    ),
    [
      ["2026-09-23", "08:00"],
      ["2026-09-23", "20:00"],
      ["2026-09-28", "08:00"],
      ["2026-09-28", "20:00"],
    ],
  );
});
test("intervals keep local wall-clock time across DST and replenish long intervals", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const r = createReminder({
      userId: "a",
      kind: "medication",
      repeat: "interval",
      intervalDays: 2,
      startDate: "2026-03-07",
      weekdays: [],
      time: "09:00",
      additionalTimes: [],
    });
    const list = upcomingReminderOccurrences(
      [r],
      [],
      new Date(2026, 2, 7, 7),
      3,
    );
    assert.deepEqual(
      list.map((o) => o.localDay),
      ["2026-03-07", "2026-03-09", "2026-03-11"],
    );
    assert.ok(list.every((o) => o.date.getHours() === 9));
    assert.equal(
      (list[1].date.getTime() - list[0].date.getTime()) / 3600000,
      47,
    );
    assert.equal(
      upcomingReminderOccurrences(
        [{ ...r, intervalDays: 365 }],
        [],
        new Date(2026, 2, 7, 7),
        14,
      ).length,
      14,
    );
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

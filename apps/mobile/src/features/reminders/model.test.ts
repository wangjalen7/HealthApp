import assert from "node:assert/strict";
import test from "node:test";

import {
  createReminder,
  reminderIsComplete,
  repeatSummary,
  timeParts,
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

import assert from "node:assert/strict";
import { test } from "node:test";
import { entryTimestamp, localEntryDay } from "./entry-date";

test("entry dates default to the save day and backdate in local time across DST and year boundaries", () => {
  for (const [now, selected] of [
    [new Date(2026, 2, 9, 0, 30), "2026-03-08"],
    [new Date(2026, 10, 2, 23, 30), "2026-11-01"],
    [new Date(2027, 0, 1, 8), "2026-12-31"],
  ] as const) {
    assert.equal(entryTimestamp(undefined, now), now.toISOString());
    assert.equal(
      localEntryDay(new Date(entryTimestamp(selected, now))),
      selected,
    );
  }
});

test("invalid and future calendar dates cannot be saved", () => {
  const now = new Date(2026, 8, 22, 12);
  for (const day of [
    "2026-09-23",
    "2026-02-30",
    "2026-13-01",
    "",
    "yesterday",
  ]) {
    assert.throws(() => entryTimestamp(day, now));
  }
});

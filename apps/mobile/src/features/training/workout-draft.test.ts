import assert from "node:assert/strict";
import test from "node:test";

import {
  moveWorkoutEntry,
  workoutDraftHasContent,
  workoutDraftSchema,
} from "./workout-draft";

const emptyDraft = {
  muscleGroups: [],
  entries: [],
  location: "",
  notes: "",
};

test("moves a workout exercise without changing its contents", () => {
  const entries = [{ id: "one" }, { id: "two" }, { id: "three" }];
  assert.deepEqual(
    moveWorkoutEntry(entries, "two", -1).map((entry) => entry.id),
    ["two", "one", "three"],
  );
  assert.deepEqual(
    moveWorkoutEntry(entries, "two", 1).map((entry) => entry.id),
    ["one", "three", "two"],
  );
  assert.equal(moveWorkoutEntry(entries, "one", -1), entries);
});

test("recognizes meaningful unfinished workout drafts", () => {
  assert.equal(
    workoutDraftHasContent(workoutDraftSchema.parse(emptyDraft)),
    false,
  );
  assert.equal(
    workoutDraftHasContent(
      workoutDraftSchema.parse({
        ...emptyDraft,
        entries: [
          {
            id: "draft-exercise",
            name: "Pull-ups",
            setCount: 3,
            reps: [12, 11, 10],
            weight: 0,
          },
        ],
      }),
    ),
    true,
  );
});

test("accepts incomplete entries while a workout is in progress", () => {
  const draft = workoutDraftSchema.parse({
    muscleGroups: ["Back"],
    entries: [
      {
        id: "draft-exercise",
        name: "Lat pulldown",
        setCount: 3,
        reps: [12],
      },
    ],
    notes: "",
    location: "",
  });

  assert.equal(draft.entries[0].weight, undefined);
});

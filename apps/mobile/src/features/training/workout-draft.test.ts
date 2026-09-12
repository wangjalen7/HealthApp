import assert from "node:assert/strict";
import test from "node:test";

import {
  muscleGroupLabel,
  moveWorkoutEntry,
  normalizeWorkoutDraftStructure,
  workoutDraftHasContent,
  workoutEntryCompletionIssue,
  workoutDraftSchema,
} from "./workout-draft";

test("expands abbreviated muscle-group labels for display", () => {
  assert.equal(muscleGroupLabel("Bi"), "Bicep");
  assert.equal(muscleGroupLabel("Tri"), "Tricep");
  assert.equal(muscleGroupLabel("Delt"), "Shoulders");
  assert.equal(muscleGroupLabel("Back"), "Back");
});

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

test("normalizes hidden rep slots and exercise muscle groups in restored drafts", () => {
  const normalized = normalizeWorkoutDraftStructure(
    workoutDraftSchema.parse({
      muscleGroups: ["Chest"],
      entries: [
        {
          id: "shoulder-press",
          name: "Shoulder press",
          muscleGroup: "Delt",
          setCount: 3,
          reps: [10, 9],
          weight: 40,
        },
      ],
      notes: "",
      location: "",
    }),
  );
  assert.deepEqual(normalized.muscleGroups, ["Chest", "Delt"]);
  assert.deepEqual(normalized.entries[0].reps, [10, 9, 0]);
  assert.equal(
    workoutEntryCompletionIssue(normalized.entries[0], normalized.muscleGroups, 0),
    "Shoulder press: enter reps for all 3 sets.",
  );
});

test("completion feedback identifies the exact missing workout field", () => {
  const entry = workoutDraftSchema.parse({
    muscleGroups: ["Back"],
    entries: [
      {
        id: "row",
        name: "Row",
        muscleGroup: "Back",
        setCount: 1,
        reps: [8],
      },
    ],
    notes: "",
    location: "",
  }).entries[0];
  assert.equal(
    workoutEntryCompletionIssue(entry, ["Back"], 0),
    "Row: enter a working weight; use 0 lb for bodyweight.",
  );
});

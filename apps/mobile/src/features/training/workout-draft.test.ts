import assert from "node:assert/strict";
import test from "node:test";

import { workoutDraftHasContent, workoutDraftSchema } from "./workout-draft";

const emptyDraft = {
  muscleGroups: [],
  entries: [],
  notes: "",
};

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
  });

  assert.equal(draft.entries[0].weight, undefined);
});

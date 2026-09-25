import assert from "node:assert/strict";
import test from "node:test";
import { minimizeAiContext } from "./ai-privacy.ts";
test("structured AI context excludes account, source and location identifiers at every depth", () => {
  assert.deepEqual(minimizeAiContext({userId:"private",recent:[{id:"row",session_id:"other",email:"x",location:"home",exercise_name:"Squat",reps:5}],photo:{signedUrl:"secret",externalId:"healthkit"}}),{recent:[{exercise_name:"Squat",reps:5}],photo:{}});
});

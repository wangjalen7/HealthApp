// Explicit opt-in. Uses only a disposable synthetic Auth account, no health entries.
// Existing managed CLI credentials stay in memory; passwords/tokens/keys are never logged.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
if (process.env.HEALTHAPP_ALLOW_WORKOUT_TEST !== "yes")
  throw new Error(
    "Explicit workout test opt-in required (one paid generation).",
  );
const project = readFileSync("supabase/.temp/project-ref", "utf8").trim();
if (!/^[a-z0-9]+$/.test(project)) throw new Error("Invalid project reference");
const cli = spawnSync(
  "cmd.exe",
  [
    "/d",
    "/s",
    "/c",
    `npx --yes supabase projects api-keys --project-ref ${project} --output json`,
  ],
  { encoding: "utf8", windowsHide: true },
);
if (cli.status !== 0) throw new Error("Managed test access unavailable");
const keys = JSON.parse(cli.stdout);
const adminKey = keys.find((k) => k.name === "service_role")?.api_key;
const publicKey =
  keys.find((k) => k.type === "publishable")?.api_key ??
  keys.find((k) => k.name === "anon")?.api_key;
assert.ok(adminKey && publicKey, "Existing managed keys required");
const base = `https://${project}.supabase.co`;
async function call(path, body, token, key = publicKey, method = "POST") {
  const response = await fetch(base + path, {
    method,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
function success(result, stage) {
  if (result.status >= 300)
    throw new Error(
      `${stage}: HTTP ${result.status}, code ${result.data.code ?? result.data.error_code ?? "unknown"}`,
    );
}

const email = "workout-test-" + randomUUID() + "@example.invalid",
  password = randomUUID() + "Aa!9";
let userId;
try {
  const created = await call(
    "/auth/v1/admin/users",
    { email, password, email_confirm: true },
    adminKey,
    adminKey,
  );
  success(created, "Synthetic account creation");
  userId = created.data.id;
  assert.match(userId, /^[0-9a-f-]{36}$/);
  const login = await call("/auth/v1/token?grant_type=password", {
    email,
    password,
  });
  success(login, "Password login");
  const bearer = login.data.access_token;
  const profile = await call(
    "/rest/v1/coach_profiles",
    {
      user_id: userId,
      goals: ["muscle_gain"],
      primary_goal: "muscle_gain",
      experience_level: "beginner",
      training_days_per_week: 3,
      session_minutes: 45,
      equipment: ["bodyweight"],
      dietary_preferences: [],
      dietary_restrictions: [],
      disliked_foods: [],
      response_style: "concise",
      use_training: true,
      use_nutrition: false,
      use_vitals: false,
      use_hydration: false,
      use_photo_metadata: false,
      consented_at: new Date().toISOString(),
    },
    bearer,
  );
  success(profile, "Planner setup");
  // Exactly one generation; no automatic retry. Do not print the model response.
  const response = await call(
    "/functions/v1/coach-chat",
    {
      message:
        "Generate one full-body workout as a structured next_workout action, with every exercise, set, rep target, RIR, rest and technique cue. Fill the editable workout draft. Do not ask follow-up questions.",
      timezone: "UTC",
      localDate: new Date().toISOString().slice(0, 10),
      workoutPreferences: {
        sessionType: "lifting",
        focus: [],
        goals: ["strength_muscle"],
        styles: ["science"],
        location: "home",
        equipment: ["bodyweight"],
        experience: "beginner",
        minutes: 45,
        readiness: "ready",
        novelty: "mix",
        limitations: "",
      },
    },
    bearer,
  );
  success(response, "Hosted workout generation");
  assert.equal(response.data.safetyLevel, "normal");
  assert.equal(response.data.actions.length, 1);
  const plan = response.data.actions[0].payload;
  assert.equal(plan.kind, "next_workout");
  assert.equal(plan.recommendation, "lifting");
  assert.ok(
    plan.exercises.length >= 3,
    "Full-body routine should include multiple exercises",
  );
  for (const exercise of plan.exercises) {
    assert.equal(exercise.targetReps.length, exercise.setCount);
    assert.equal(exercise.suggestedWeightLb, null);
    assert.equal(exercise.isNewToHistory, true);
    assert.ok(
      exercise.targetRir >= 3 &&
        exercise.restSeconds >= 15 &&
        exercise.technique.length,
    );
  }
  console.log(
    "PASS: hosted model returned " +
      plan.exercises.length +
      " complete exercises in one editable workout action.",
  );
  const stored = await call(
    "/rest/v1/coach_actions?select=id&user_id=eq." + userId,
    undefined,
    bearer,
    publicKey,
    "GET",
  );
  success(stored, "Saved action verification");
  assert.equal(stored.data.length, 1);
  console.log(
    "PASS: complete workout action persisted for the client handoff.",
  );
} finally {
  if (userId) {
    const removed = await call(
      "/auth/v1/admin/users/" + userId,
      undefined,
      adminKey,
      adminKey,
      "DELETE",
    );
    success(removed, "Synthetic account cleanup");
    console.log("PASS: disposable account and planner records removed.");
  }
}

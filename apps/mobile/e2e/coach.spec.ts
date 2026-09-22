import { expect, quickLog, signIn, test } from "./fixture";
import { coachRequestSchema } from "../../../supabase/functions/_shared/coach";
const userId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const actionId = "44444444-4444-4444-8444-444444444444";

test("workout questionnaire replaces the Coach tab and fits a narrow phone", async ({
  page,
  backend,
}, testInfo) => {
  expect(backend.tables.profiles).toHaveLength(1);
  await page.setViewportSize({ width: 320, height: 700 });
  await signIn(page);
  const tabs = page.getByRole("tab");
  await expect(
    page.getByRole("tab", { name: "AI Coach", exact: true }),
  ).toHaveCount(0);
  await expect(tabs.filter({ hasText: "Soon" })).toHaveCount(1);
  await page.getByRole("tab", { name: "Soon", exact: true }).click();
  await expect(page.getByLabel("Placeholder", { exact: true })).toBeVisible();
  await quickLog(page, "Workout");
  await page
    .getByRole("button", { name: "Plan workout with AI", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Science based", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("checkbox", { name: "Recommend for me", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Message AI Coach")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("radio", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Machines", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByRole("checkbox", { name: "No equipment", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("checkbox", { name: "Dumbbells", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "No equipment", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page
    .getByRole("checkbox", { name: "No equipment", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Dumbbells", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  await page.screenshot({
    path: testInfo.outputPath("workout-preferences-320.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Training days per week", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Generate workout plan", exact: true })
    .click();
  await expect(
    page.getByText(
      "Enable Use my workout history for AI planning before generating.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("planner retries generation and fills an editable workout directly without chat", async ({
  page,
  backend,
}) => {
  let calls = 0;
  await page.route("**/functions/v1/coach-chat", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.workoutPreferences).toMatchObject({
      focus: [],
      styles: ["science"],
      location: "home",
      equipment: ["bodyweight"],
      experience: "beginner",
      readiness: "ready",
    });
    if (calls === 1) {
      await route.fulfill({
        json: {
          threadId,
          messageId,
          answer: "Your workout is ready.",
          safetyLevel: "normal",
          evidence: [],
          sources: [],
          actions: [],
          quota: { standardRemaining: 30, deepRemaining: 2 },
        },
      });
      return;
    }
    backend.tables.coach_actions = [
      {
        id: actionId,
        user_id: userId,
        thread_id: threadId,
        message_id: messageId,
        status: "pending",
      },
    ];
    await route.fulfill({
      json: {
        threadId,
        messageId,
        answer:
          "Start with a manageable full-body session and leave three reps in reserve.",
        safetyLevel: "normal",
        evidence: [
          {
            label: "Logged sets",
            value: "No recent sessions available",
            period: "Past 7 days",
          },
        ],
        sources: [],
        actions: [
          {
            id: actionId,
            status: "pending",
            payload: {
              kind: "next_workout",
              title: "Home starter",
              rationale:
                "A short bodyweight session for your available equipment.",
              recommendation: "lifting",
              muscleGroups: ["Legs", "Chest"],
              exercises: [
                {
                  name: "Bodyweight squat",
                  muscleGroup: "Legs",
                  setCount: 2,
                  targetReps: [8, 8],
                  suggestedWeightLb: null,
                  targetRir: 3,
                  restSeconds: 120,
                  technique: "Lower with control.",
                  isNewToHistory: true,
                },
                {
                  name: "Push-up",
                  muscleGroup: "Chest",
                  setCount: 2,
                  targetReps: [8, 8],
                  suggestedWeightLb: null,
                  targetRir: 3,
                  restSeconds: 90,
                  technique: "Keep a steady torso.",
                  isNewToHistory: true,
                },
              ],
              cardio: null,
            },
          },
        ],
        quota: { standardRemaining: 30, deepRemaining: 2 },
      },
    });
  });
  await signIn(page);
  await quickLog(page, "Workout");
  await page
    .getByRole("button", { name: "Plan workout with AI", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("radio", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("switch", {
      name: "Use my workout history for AI planning",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Generate workout plan", exact: true })
    .click();
  await expect(
    page.getByText(
      "AI did not return a complete workout. Your draft was not changed. Try generating again.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(backend.tables.coach_profiles[0]).toMatchObject({
    use_training: true,
    use_nutrition: false,
    use_vitals: false,
    use_hydration: false,
    use_photo_metadata: false,
  });
  await page
    .getByRole("button", { name: "Generate workout plan", exact: true })
    .click();
  await expect(page.getByLabel("Message AI Coach")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review Home starter", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Exercise name", { exact: true }).first(),
  ).toHaveValue("Bodyweight squat");
  await expect(
    page.getByText("Plan: 3 RIR / 120 sec rest", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.workout_sessions ?? []).toHaveLength(0);
  await expect(page.getByLabel("Exercise name", { exact: true })).toHaveCount(
    2,
  );
  await expect(
    page.getByLabel("Exercise name", { exact: true }).nth(1),
  ).toHaveValue("Push-up");
  await page.getByLabel("Number of sets", { exact: true }).first().fill("3");
  await expect(
    page.getByLabel("Number of sets", { exact: true }).first(),
  ).toHaveValue("3");
  await expect(page.getByRole("button", { name: "Exercise guide for Bodyweight squat", exact: true })).toHaveCount(0);
  await expect(page.getByText("Lower with control.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Unfinished workout saved on this device.", { exact: true }),
  ).toBeVisible();
});

for (const sessionType of ["cardio", "combo"] as const) {
  test(
    sessionType + " plan fills the matching drafts and protects existing work",
    async ({ page, backend }, testInfo) => {
      let calls = 0;
      await page.route("**/functions/v1/coach-chat", async (route) => {
        calls++;
        const body = route.request().postDataJSON();
        expect(body.threadId).toBeUndefined();
        expect(body.workoutPreferences).toMatchObject({
          sessionType,
          goals: ["strength_muscle", "other"],
          goalOther: "Train for a hiking trip",
          styles: ["science", "other"],
          styleOther: "Easy aerobic work",
          cardioActivity: "walk",
          equipment: ["bodyweight"],
        });
        expect(body.workoutPreferences.daysPerWeek).toBeUndefined();
        await route.fulfill({
          json: {
            threadId,
            messageId,
            answer: "Your session is ready.",
            safetyLevel: "normal",
            evidence: [],
            sources: [],
            quota: { standardRemaining: 30, deepRemaining: 2 },
            actions: [
              {
                id: actionId,
                status: "pending",
                payload: {
                  kind: "next_workout",
                  title: "Hiking preparation",
                  rationale: "Easy work matched to your available time.",
                  recommendation: sessionType,
                  muscleGroups: sessionType === "combo" ? ["Legs"] : [],
                  exercises:
                    sessionType === "combo"
                      ? [
                          {
                            name: "Bodyweight squat",
                            muscleGroup: "Legs",
                            setCount: 2,
                            targetReps: [8, 8],
                            suggestedWeightLb: null,
                            targetRir: 3,
                            restSeconds: 120,
                            technique: "Lower with control.",
                            isNewToHistory: true,
                          },
                        ]
                      : [],
                  cardio: {
                    activityType: "walk",
                    durationMinutes: 15,
                    distanceMiles: null,
                    intensity: "easy",
                    notes: "Start and finish gently; conversational pace.",
                  },
                },
              },
            ],
          },
        });
      });
      await signIn(page);
      // Synthetic existing drafts must survive until explicit replacement.
      await page.evaluate(
        ({ userId }) => {
          localStorage.setItem(
            "healthapp:workout-draft:" + userId,
            JSON.stringify({
              muscleGroups: ["Back"],
              entries: [
                {
                  id: "existing",
                  name: "Existing row",
                  muscleGroup: "Back",
                  setCount: 1,
                  reps: [8],
                },
              ],
              location: "Home",
              notes: "Keep my work",
            }),
          );
          localStorage.setItem(
            "healthapp:cardio-draft:" + userId,
            JSON.stringify({
              activityType: "cycle",
              durationMinutes: 22,
              notes: "Existing cardio",
            }),
          );
        },
        { userId },
      );
      await quickLog(page, "Workout");
      await page
        .getByRole("button", { name: "Plan workout with AI", exact: true })
        .click();
      await page
        .getByRole("radio", {
          name: sessionType === "combo" ? "Lifting + cardio" : "Cardio",
          exact: true,
        })
        .click();
      await page
        .getByRole("checkbox", { name: "Other goal", exact: true })
        .click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(
        page.getByText("Describe your Other goal (up to 160 characters).", {
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByLabel("Describe your goal", { exact: true })
        .fill("Train for a hiking trip");
      await page
        .getByRole("checkbox", { name: "Other style", exact: true })
        .click();
      await page
        .getByLabel("Describe your training style", { exact: true })
        .fill("Easy aerobic work");
      await page.getByRole("radio", { name: "Walking", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("radio", { name: "Home", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("switch", {
          name: "Use my workout history for AI planning",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Generate workout plan", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Replace existing drafts",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          (id) =>
            JSON.parse(localStorage.getItem("healthapp:cardio-draft:" + id)!)
              .durationMinutes,
          userId,
        ),
      ).toBe(22);
      expect(backend.tables.workout_sessions ?? []).toHaveLength(0);
      expect(backend.tables.cardio_activities ?? []).toHaveLength(0);
      await page
        .getByRole("button", { name: "Replace existing drafts", exact: true })
        .click();
      if (sessionType === "combo") {
        await expect(
          page.getByLabel("Exercise name", { exact: true }).first(),
        ).toHaveValue("Bodyweight squat");
        await page
          .getByRole("button", { name: "Review Cardio draft", exact: true })
          .click();
      }
      await expect(page.getByLabel("Minutes", { exact: true })).toHaveValue(
        "15",
      );
      await page.getByLabel("Minutes", { exact: true }).fill("18");
      await page.getByRole("tab", { name: "Lifting", exact: true }).click();
      await expect(
        page.getByLabel("Exercise name", { exact: true }).first(),
      ).toHaveValue(
        sessionType === "combo" ? "Bodyweight squat" : "Existing row",
      );
      await page.getByRole("tab", { name: "Cardio", exact: true }).click();
      await expect(page.getByLabel("Minutes", { exact: true })).toHaveValue(
        "18",
      );
      await page.setViewportSize({ width: 320, height: 750 });
      await page.screenshot({
        path: testInfo.outputPath(sessionType + "-draft-320.png"),
      });
      expect(calls).toBe(1);
      expect(backend.tables.workout_sessions ?? []).toHaveLength(0);
      expect(backend.tables.cardio_activities ?? []).toHaveLength(0);
    },
  );
}

test("multi-select preferences migrate old choices and explain missed selections without paid calls", async ({
  page,
  backend,
}, testInfo) => {
  let calls = 0;
  backend.tables.coach_profiles = [
    {
      user_id: userId,
      goals: ["muscle_gain"],
      primary_goal: "muscle_gain",
      experience_level: "beginner",
      session_minutes: 50,
      equipment: [],
      dietary_preferences: [],
      dietary_restrictions: [],
      disliked_foods: [],
      response_style: "concise",
      use_training: true,
      use_nutrition: false,
      use_vitals: false,
      use_hydration: false,
      use_photo_metadata: false,
      consented_at: "2026-09-18T00:00:00Z",
    },
  ];
  await page.route("**/functions/v1/coach-chat", async (route) => {
    calls++;
    const body = coachRequestSchema.parse(route.request().postDataJSON());
    expect(body.workoutPreferences).toMatchObject({
      goals: ["strength_muscle", "endurance"],
      styles: ["science", "circuit"],
      equipment: ["other"],
      equipmentOther: "Suspension trainer",
      minutes: 50,
    });
    expect(body.workoutPreferences?.daysPerWeek).toBeUndefined();
    await route.fulfill({
      json: {
        threadId,
        messageId,
        answer: "Test request accepted.",
        safetyLevel: "normal",
        evidence: [],
        sources: [],
        actions: [],
        quota: { standardRemaining: 30, deepRemaining: 2 },
      },
    });
  });
  await signIn(page);
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        "healthapp:workout-preferences:" + id,
        JSON.stringify({
          focus: [],
          sessionType: "lifting",
          goal: "muscle",
          style: "bodyweight",
          location: "home",
          equipment: ["bodyweight"],
          experience: "beginner",
          minutes: 50,
          readiness: "ready",
          novelty: "mix",
          limitations: "",
        }),
      ),
    userId,
  );
  await quickLog(page, "Workout");
  await page
    .getByRole("button", { name: "Plan workout with AI", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "Bodyweight / calisthenics",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("checkbox", { name: "Strength & muscle", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Bodyweight / calisthenics", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText(
      "Select at least one workout goal from the listed options.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Select at least one training style from the listed options.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(calls).toBe(0);
  await page
    .getByRole("checkbox", { name: "Strength & muscle", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Endurance & conditioning", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Science based", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Circuit", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("multi-select-planner.png"),
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "50 min", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("checkbox", { name: "Other equipment", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Describe your Other equipment (up to 160 characters).", {
      exact: true,
    }),
  ).toBeVisible();
  expect(calls).toBe(0);
  await page
    .getByLabel("Describe your equipment", { exact: true })
    .fill("Suspension trainer");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate workout plan", exact: true })
    .click();
  await expect(
    page.getByText(
      "AI did not return a complete workout. Your draft was not changed. Try generating again.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(calls).toBe(1);
  expect(backend.tables.coach_profiles[0]).toMatchObject({
    goals: ["muscle_gain", "performance"],
    training_days_per_week: 3,
  });
});

import { expect, signIn, test } from "./fixture";

const userId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";
const actionId = "44444444-4444-4444-8444-444444444444";
const foodProfileId = "55555555-5555-4555-8555-555555555555";

const coachProfile = {
  user_id: userId,
  goals: ["muscle_gain", "performance"],
  primary_goal: "muscle_gain",
  experience_level: "intermediate",
  training_days_per_week: 4,
  session_minutes: 60,
  equipment: ["barbell", "dumbbells"],
  limitations: null,
  dietary_preferences: ["high protein"],
  dietary_restrictions: [],
  disliked_foods: [],
  meal_prep_minutes: 20,
  height_inches: 70,
  birth_year: 1995,
  energy_estimation_sex: "male",
  target_weight_change_lb_week: 0.5,
  response_style: "concise",
  use_nutrition: true,
  use_training: true,
  use_vitals: true,
  use_hydration: true,
  use_photo_metadata: true,
  consented_at: "2026-09-11T12:00:00+00:00",
};

test("Coach home stays focused at a narrow phone width", async ({
  page,
  backend,
}, testInfo) => {
  backend.tables.coach_profiles = [coachProfile];
  await page.setViewportSize({ width: 320, height: 700 });
  await signIn(page);
  await page.getByRole("tab", { name: "AI Coach", exact: true }).click();
  await expect(
    page.getByText("How can I help today?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("What should I eat next?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Plan my next workout", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Review my progress", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Message AI Coach")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("coach-home-320.png"),
  });
});

test("Coach setup records consent and selected health data", async ({
  page,
  backend,
}) => {
  await signIn(page);
  await page.getByRole("tab", { name: "AI Coach", exact: true }).click();
  await expect(
    page.getByText("Set up your Coach", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Muscle gain" }).click();
  await page
    .getByRole("checkbox", { name: "Performance", exact: true })
    .click();
  await page.getByLabel("Available equipment").fill("Dumbbells, pull-up bar");
  await page.getByLabel("Dietary restrictions").fill("Peanuts");
  await page
    .getByRole("checkbox", {
      name: "Allow AI Coach to use selected health data",
    })
    .click();
  await page.getByRole("button", { name: "Save Coach setup" }).click();
  await expect(
    page.getByText("How can I help today?", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.coach_profiles).toHaveLength(1);
  expect(backend.tables.coach_profiles[0]).toMatchObject({
    user_id: userId,
    primary_goal: "muscle_gain",
    goals: ["muscle_gain", "performance"],
    equipment: ["Dumbbells", "pull-up bar"],
    dietary_restrictions: ["Peanuts"],
    use_nutrition: true,
    use_training: true,
  });
});

test("Coach chat shows evidence and applies an editable saved-food meal draft", async ({
  page,
  backend,
}) => {
  backend.tables.coach_profiles = [coachProfile];
  backend.tables.user_food_profiles = [
    {
      id: foodProfileId,
      user_id: userId,
      food_name: "Greek yogurt",
      description: "Plain nonfat Greek yogurt",
      source: "manual_label",
      is_user_corrected: false,
      serving_label: "1 cup",
      serving_weight_grams: 227,
      serving_volume_ml: null,
      household_quantity_per_serving: 1,
      household_unit: "cup",
      calories_per_serving: 130,
      protein_grams_per_serving: 23,
      carbohydrate_grams_per_serving: 9,
      fat_grams_per_serving: 0,
      fiber_grams_per_serving: 0,
      sugar_grams_per_serving: 7,
      sodium_mg_per_serving: 85,
      archived_at: null,
      updated_at: new Date().toISOString(),
    },
  ];
  await page.route("**/functions/v1/coach-chat", async (route) => {
    const request = route.request().postDataJSON();
    expect(request.message).toBe("What should I eat next?");
    expect(request.userId).toBeUndefined();
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
          "Have Greek yogurt. It fits your remaining protein target and uses a food from your history.",
        safetyLevel: "normal",
        evidence: [
          {
            label: "Protein remaining",
            value: "42 g",
            period: "Today, Sep 11",
          },
        ],
        sources: [],
        actions: [
          {
            id: actionId,
            status: "pending",
            payload: {
              kind: "next_meal",
              title: "Greek yogurt snack",
              rationale: "A filling high-protein choice from your saved foods.",
              mealType: "snack",
              items: [
                {
                  profileId: foodProfileId,
                  name: "Greek yogurt",
                  amount: 1,
                  unit: "serving",
                },
              ],
            },
          },
        ],
        quota: { standardRemaining: 29, deepRemaining: 3 },
      },
    });
  });
  await signIn(page);
  await page.getByRole("tab", { name: "AI Coach", exact: true }).click();
  await page.getByText("What should I eat next?", { exact: true }).click();
  await expect(page.getByText(/Have Greek yogurt/)).toBeVisible();
  await page.getByText("Data used", { exact: true }).click();
  await expect(
    page.getByText("Protein remaining", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review Greek yogurt snack" }).click();
  await expect(page.getByText("130 kcal", { exact: true })).toBeVisible();
  await page.getByLabel("Greek yogurt amount").fill("2");
  await expect(page.getByText("260 kcal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply to draft" }).click();
  await expect(page.getByText("Greek yogurt", { exact: true })).toBeVisible();
  await expect(page.getByText("260 calories", { exact: true })).toBeVisible();
  expect(backend.tables.coach_actions[0]).toMatchObject({
    id: actionId,
    status: "applied",
  });
});

test("Coach creates a user-requested food label only after meal approval", async ({
  page,
  backend,
}) => {
  backend.tables.coach_profiles = [coachProfile];
  await page.route("**/functions/v1/coach-chat", async (route) => {
    expect(route.request().postDataJSON().message).toBe(
      "Make my next meal with chicken and rice.",
    );
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
        answer: "Chicken and rice fit. Would you like me to add this meal?",
        safetyLevel: "normal",
        evidence: [],
        sources: [],
        actions: [
          {
            id: actionId,
            status: "pending",
            payload: {
              kind: "next_meal",
              title: "Chicken and rice",
              rationale: "Uses the foods you requested.",
              mealType: "dinner",
              items: [
                {
                  profileId: null,
                  name: "Chicken breast",
                  description: "Cooked skinless chicken",
                  amount: 1,
                  unit: "serving",
                  servingLabel: "1 breast",
                  servingWeightGrams: 170,
                  servingVolumeMl: null,
                  householdQuantityPerServing: 1,
                  householdUnit: "breast",
                  nutrientsPerServing: {
                    calories: 280,
                    proteinGrams: 53,
                    carbohydrateGrams: 0,
                    fatGrams: 6,
                    fiberGrams: 0,
                    sugarGrams: 0,
                    sodiumMg: 125,
                  },
                },
                {
                  profileId: null,
                  name: "White rice",
                  description: "Cooked white rice",
                  amount: 1,
                  unit: "serving",
                  servingLabel: "1 cup",
                  servingWeightGrams: 186,
                  servingVolumeMl: null,
                  householdQuantityPerServing: 1,
                  householdUnit: "cup",
                  nutrientsPerServing: {
                    calories: 242,
                    proteinGrams: 4.4,
                    carbohydrateGrams: 53.4,
                    fatGrams: 0.4,
                    fiberGrams: 0.6,
                    sugarGrams: 0.1,
                    sodiumMg: 0,
                  },
                },
              ],
            },
          },
        ],
        quota: { standardRemaining: 29, deepRemaining: 3 },
      },
    });
  });
  await signIn(page);
  await page.getByRole("tab", { name: "AI Coach", exact: true }).click();
  await page
    .getByLabel("Message AI Coach")
    .fill("Make my next meal with chicken and rice.");
  await page.getByLabel("Send message to AI Coach").click();
  await page.getByRole("button", { name: "Review Chicken and rice" }).click();
  expect(backend.tables.user_food_profiles ?? []).toHaveLength(0);
  await page.getByLabel("White rice amount").fill("1.5");
  await page.getByRole("button", { name: "Apply to draft" }).click();
  await expect(page.getByText("Chicken breast", { exact: true })).toBeVisible();
  await expect(page.getByText("White rice", { exact: true })).toBeVisible();
  expect(backend.tables.user_food_profiles).toHaveLength(2);
});

test("Coach restores and permanently deletes a saved conversation", async ({
  page,
  backend,
}) => {
  backend.tables.coach_profiles = [coachProfile];
  backend.tables.coach_threads = [
    {
      id: threadId,
      user_id: userId,
      title: "September progress",
      updated_at: "2026-09-11T12:00:00.000Z",
    },
  ];
  backend.tables.coach_messages = [
    {
      id: messageId,
      user_id: userId,
      thread_id: threadId,
      role: "assistant",
      content: "Your seven-day weight average is steady.",
      evidence: [
        { label: "Weight average", value: "181.2 lb", period: "Past 7 days" },
      ],
      sources: [],
      created_at: "2026-09-11T12:00:00.000Z",
    },
  ];
  backend.tables.coach_actions = [];
  await signIn(page);
  await page.getByRole("tab", { name: "AI Coach", exact: true }).click();
  await page.getByRole("button", { name: "Coach conversations" }).click();
  await page.getByText("September progress", { exact: true }).click();
  await expect(page.getByText(/seven-day weight average/)).toBeVisible();
  await page
    .getByRole("button", { name: "Delete current conversation" })
    .click();
  await page.getByText("Delete", { exact: true }).click();
  await expect(
    page.getByText("How can I help today?", { exact: true }),
  ).toBeVisible();
  expect(backend.tables.coach_threads).toHaveLength(0);
});

test("Coach workout review defaults to cancel and can append to an existing draft", async ({
  page,
  backend,
}) => {
  backend.tables.coach_profiles = [coachProfile];
  backend.tables.coach_actions = [
    {
      id: actionId,
      user_id: userId,
      thread_id: threadId,
      message_id: messageId,
      status: "pending",
    },
  ];
  await page.route("**/functions/v1/coach-chat", (route) =>
    route.fulfill({
      json: {
        threadId,
        messageId,
        answer: "Here is a short chest workout based on your recent exercises.",
        safetyLevel: "normal",
        evidence: [
          {
            label: "Recent training",
            value: "2 chest sessions",
            period: "Past 28 days",
          },
        ],
        sources: [],
        actions: [
          {
            id: actionId,
            status: "pending",
            payload: {
              kind: "next_workout",
              title: "Chest progression",
              rationale:
                "Continue with familiar movements and a manageable volume.",
              recommendation: "lifting",
              muscleGroups: ["Chest"],
              exercises: [
                {
                  name: "Bench press",
                  muscleGroup: "Chest",
                  setCount: 3,
                  targetReps: [8, 8, 8],
                  suggestedWeightLb: 135,
                },
              ],
              cardio: null,
            },
          },
        ],
        quota: { standardRemaining: 30, deepRemaining: 2 },
      },
    }),
  );
  await signIn(page);
  await page.getByRole("button", { name: "Create a new health log" }).click();
  await page.getByRole("button", { name: "Open Workout" }).click();
  await page.getByRole("button", { name: "Chest", exact: true }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByLabel("Exercise name").fill("Push-up");
  await page.getByLabel("Number of sets").fill("2");
  await page.getByRole("tab", { name: "AI Coach", exact: true }).click();
  await page.getByText("Plan my next workout", { exact: true }).click();
  await page.getByRole("button", { name: "Review Chest progression" }).click();
  await expect(page.getByText("You already have a draft")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Review Coach plan")).toHaveCount(0);
  await page.getByRole("button", { name: "Review Chest progression" }).click();
  await page.getByRole("button", { name: "Append to draft" }).click();
  await expect(
    page.getByText("Unfinished workout saved on this device."),
  ).toBeVisible();
  await expect(page.getByLabel("Exercise name")).toHaveCount(2);
  await expect(page.getByLabel("Exercise name").nth(0)).toHaveValue("Push-up");
  await expect(page.getByLabel("Exercise name").nth(1)).toHaveValue(
    "Bench press",
  );
  await page
    .getByTestId(/^exercise-card-/)
    .first()
    .getByText("Remove", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page.getByText(/Workout saved/)).toBeVisible();
  expect(backend.tables.workout_sets).toHaveLength(3);
  expect(backend.tables.workout_sets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        exercise_name: "Bench press",
        muscle_group: "Chest",
        weight: 135,
        reps: 8,
      }),
    ]),
  );
});

test("Coach cardio suggestion opens an editable cardio draft after approval", async ({
  page,
  backend,
}) => {
  backend.tables.coach_profiles = [coachProfile];
  backend.tables.coach_actions = [
    {
      id: actionId,
      user_id: userId,
      thread_id: threadId,
      message_id: messageId,
      status: "pending",
    },
  ];
  await page.route("**/functions/v1/coach-chat", (route) =>
    route.fulfill({
      json: {
        threadId,
        messageId,
        answer:
          "Your recent lifting frequency supports an easy cardio day. Add it?",
        safetyLevel: "normal",
        evidence: [],
        sources: [],
        actions: [
          {
            id: actionId,
            status: "pending",
            payload: {
              kind: "next_workout",
              title: "Easy recovery cardio",
              rationale: "Adds conditioning without another lifting session.",
              recommendation: "cardio",
              muscleGroups: [],
              exercises: [],
              cardio: {
                activityType: "cycle",
                durationMinutes: 25,
                distanceMiles: null,
                intensity: "easy",
                notes: "Keep the pace conversational.",
              },
            },
          },
        ],
        quota: { standardRemaining: 30, deepRemaining: 2 },
      },
    }),
  );
  await signIn(page);
  await page.getByRole("tab", { name: "AI Coach", exact: true }).click();
  await page.getByText("Plan my next workout", { exact: true }).click();
  await page
    .getByRole("button", { name: "Review Easy recovery cardio" })
    .click();
  await page.getByLabel("Cardio duration minutes").fill("30");
  await page.getByRole("button", { name: "Apply to draft" }).click();
  await expect(
    page.getByRole("tab", { name: "Cardio", selected: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Minutes")).toHaveValue("30");
  await expect(page.getByRole("button", { name: "cycle" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

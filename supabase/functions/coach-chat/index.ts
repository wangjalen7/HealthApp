import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildCoachSnapshot,
  utcBoundsForLocalDay,
} from "../_shared/coach-context.ts";
import {
  coachActionPayloadSchema,
  coachProfileSchema,
  type CoachActionPayload,
  type CoachProfile,
} from "../_shared/coach.ts";
import {
  proposedFoodMatchesUserMessage,
  proposedFoodSupportsUnit,
  trainingActionHasValidShape,
} from "../_shared/coach-action-validation.ts";
import { createCoachHandler } from "./handler.ts";

function key(collection: string, legacy: string) {
  try {
    const value = JSON.parse(Deno.env.get(collection) ?? "{}");
    if (typeof value.default === "string") return value.default;
  } catch {
    /* Older projects expose only the legacy variable. */
  }
  return Deno.env.get(legacy);
}

const url = Deno.env.get("SUPABASE_URL");
const publicKey = key("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const secret = key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
if (!url || !publicKey || !secret)
  throw new Error("Missing Supabase configuration");

const admin = createClient(url, secret, { auth: { persistSession: false } });
const userClient = (token: string) =>
  createClient(url, publicKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

function profileFromRow(row: Record<string, unknown>): CoachProfile {
  return coachProfileSchema.parse({
    userId: row.user_id,
    goals:
      Array.isArray(row.goals) && row.goals.length
        ? row.goals
        : [row.primary_goal],
    experienceLevel: row.experience_level,
    trainingDaysPerWeek: Number(row.training_days_per_week),
    sessionMinutes: Number(row.session_minutes),
    equipment: row.equipment ?? [],
    limitations: row.limitations ?? undefined,
    dietaryPreferences: row.dietary_preferences ?? [],
    dietaryRestrictions: row.dietary_restrictions ?? [],
    dislikedFoods: row.disliked_foods ?? [],
    mealPrepMinutes:
      row.meal_prep_minutes == null ? undefined : Number(row.meal_prep_minutes),
    heightInches:
      row.height_inches == null ? undefined : Number(row.height_inches),
    birthYear: row.birth_year == null ? undefined : Number(row.birth_year),
    energyEstimationSex: row.energy_estimation_sex ?? undefined,
    targetWeightChangeLbWeek:
      row.target_weight_change_lb_week == null
        ? undefined
        : Number(row.target_weight_change_lb_week),
    responseStyle: row.response_style,
    useNutrition: row.use_nutrition,
    useTraining: row.use_training,
    useVitals: row.use_vitals,
    useHydration: row.use_hydration,
    usePhotoMetadata: row.use_photo_metadata,
    consentedAt: String(row.consented_at),
  });
}

const dateStart = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();
const safeDays = (args: unknown) => {
  const days = Number((args as Record<string, unknown>)?.days);
  return [7, 30, 90, 365].includes(days) ? days : 30;
};

Deno.serve(
  createCoachHandler({
    enabled: Deno.env.get("AI_COACH_ENABLED") === "true",
    apiKey: Deno.env.get("OPENAI_API_KEY"),
    standardModel: Deno.env.get("OPENAI_COACH_CHAT_MODEL") || "gpt-5.6-luna",
    deepModel: Deno.env.get("OPENAI_COACH_DEEP_MODEL") || "gpt-5.6-terra",
    headers: corsHeaders,
    authenticate: async (token) => {
      const { data, error } = await userClient(token).auth.getUser(token);
      return error ? undefined : data.user?.id;
    },
    consumeQuota: async (userId, tier) => {
      const { data, error } = await admin.rpc("consume_coach_quota", {
        p_user_id: userId,
        p_tier: tier,
      });
      if (error) throw error;
      return {
        allowed: data?.allowed === true,
        standardRemaining: Number(data?.standardRemaining ?? 0),
        deepRemaining: Number(data?.deepRemaining ?? 0),
      };
    },
    refundQuota: async (userId, tier) => {
      const { error } = await admin.rpc("refund_coach_quota", {
        p_user_id: userId,
        p_tier: tier,
      });
      if (error) throw error;
    },
    loadContext: async (token, userId, input) => {
      const client = userClient(token);
      const coachResult = await client
        .from("coach_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (coachResult.error) throw coachResult.error;
      if (!coachResult.data) return undefined;
      const coachProfile = profileFromRow(coachResult.data);
      const threadResult = input.threadId
        ? await client
            .from("coach_threads")
            .select("id, title, summary")
            .eq("user_id", userId)
            .eq("id", input.threadId)
            .maybeSingle()
        : { data: null, error: null };
      if (threadResult.error || (input.threadId && !threadResult.data))
        throw new Error("Thread not found");
      const messageResult = input.threadId
        ? await client
            .from("coach_messages")
            .select("role, content, created_at")
            .eq("user_id", userId)
            .eq("thread_id", input.threadId)
            .order("created_at", { ascending: false })
            .limit(12)
        : { data: [], error: null };
      if (messageResult.error) throw messageResult.error;
      const [profile, nutrition, hydration, vitals, workouts, cardio, photos] =
        await Promise.all([
          client
            .from("profiles")
            .select(
              "daily_calorie_goal, daily_protein_goal, daily_water_goal_ml, weight_goal_lb",
            )
            .eq("id", userId)
            .maybeSingle(),
          coachProfile.useNutrition
            ? client
                .from("nutrition_entries")
                .select(
                  "food_name, meal_type, calories, protein_grams, carbohydrate_grams, fat_grams, fiber_grams, serving_count, occurred_at",
                )
                .eq("user_id", userId)
                .order("occurred_at", { ascending: false })
                .limit(500)
            : Promise.resolve({ data: [], error: null }),
          coachProfile.useHydration
            ? client
                .from("hydration_entries")
                .select("fluid_name, volume_ml, occurred_at")
                .eq("user_id", userId)
                .order("occurred_at", { ascending: false })
                .limit(500)
            : Promise.resolve({ data: [], error: null }),
          coachProfile.useVitals
            ? client
                .from("vital_samples")
                .select("kind, value, unit, occurred_at, deleted_at")
                .eq("user_id", userId)
                .order("occurred_at", { ascending: false })
                .limit(1000)
            : Promise.resolve({ data: [], error: null }),
          coachProfile.useTraining
            ? client
                .from("workout_sessions")
                .select("id, title, muscle_groups, completed_at, location")
                .eq("user_id", userId)
                .order("completed_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [], error: null }),
          coachProfile.useTraining
            ? client
                .from("cardio_entries")
                .select(
                  "activity_type, activity_name, duration_minutes, distance_miles, occurred_at, deleted_at",
                )
                .eq("user_id", userId)
                .is("deleted_at", null)
                .order("occurred_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [], error: null }),
          coachProfile.usePhotoMetadata
            ? client
                .from("progress_photos")
                .select("taken_at, local_day")
                .eq("user_id", userId)
                .order("taken_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [], error: null }),
        ]);
      for (const result of [
        profile,
        nutrition,
        hydration,
        vitals,
        workouts,
        cardio,
        photos,
      ])
        if (result.error) throw result.error;
      const sessionIds = (workouts.data ?? []).map((row) => String(row.id));
      const sets = sessionIds.length
        ? await client
            .from("workout_sets")
            .select(
              "session_id, exercise_name, muscle_group, weight, weight_unit, reps",
            )
            .eq("user_id", userId)
            .in("session_id", sessionIds)
        : { data: [], error: null };
      if (sets.error) throw sets.error;
      return {
        profile: coachProfile,
        thread: threadResult.data
          ? {
              id: String(threadResult.data.id),
              title: String(threadResult.data.title),
              summary: String(threadResult.data.summary ?? ""),
            }
          : undefined,
        messages: [...(messageResult.data ?? [])].reverse().map((row) => ({
          role: row.role as "user" | "assistant",
          content: String(row.content),
        })),
        snapshot: buildCoachSnapshot({
          profile: profile.data,
          coachProfile: coachResult.data,
          nutrition: nutrition.data ?? [],
          hydration: hydration.data ?? [],
          vitals: vitals.data ?? [],
          workouts: workouts.data ?? [],
          sets: sets.data ?? [],
          cardio: cardio.data ?? [],
          photos: photos.data ?? [],
          localDate: input.localDate,
          timezone: input.timezone,
        }),
      };
    },
    runTool: async (token, userId, name, args, requestContext) => {
      const client = userClient(token);
      const { data: permissions, error: permissionError } = await client
        .from("coach_profiles")
        .select(
          "use_nutrition, use_training, use_vitals, use_hydration, use_photo_metadata",
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (permissionError || !permissions)
        throw permissionError ?? new Error("Coach profile not found");
      const denied = (category: string) => ({
        unavailable: `The user has not allowed Coach to use ${category} data.`,
      });
      if (name === "get_day_log") {
        const date = String((args as Record<string, unknown>)?.date ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Invalid date" };
        const bounds = utcBoundsForLocalDay(date, requestContext.timezone);
        const [food, hydration, vitals] = await Promise.all([
          permissions.use_nutrition
            ? client
                .from("nutrition_entries")
                .select(
                  "food_name, meal_type, calories, protein_grams, carbohydrate_grams, fat_grams, fiber_grams, occurred_at",
                )
                .eq("user_id", userId)
                .gte("occurred_at", bounds.start)
                .lt("occurred_at", bounds.end)
                .limit(100)
            : Promise.resolve({ data: [], error: null }),
          permissions.use_hydration
            ? client
                .from("hydration_entries")
                .select("fluid_name, volume_ml, occurred_at")
                .eq("user_id", userId)
                .gte("occurred_at", bounds.start)
                .lt("occurred_at", bounds.end)
                .limit(100)
            : Promise.resolve({ data: [], error: null }),
          permissions.use_vitals
            ? client
                .from("vital_samples")
                .select("kind, value, unit, occurred_at")
                .eq("user_id", userId)
                .gte("occurred_at", bounds.start)
                .lt("occurred_at", bounds.end)
                .is("deleted_at", null)
                .limit(100)
            : Promise.resolve({ data: [], error: null }),
        ]);
        return {
          date,
          food: food.data ?? [],
          hydration: hydration.data ?? [],
          vitals: vitals.data ?? [],
        };
      }
      if (name === "get_saved_food_candidates") {
        if (!permissions.use_nutrition) return denied("nutrition");
        const { data, error } = await client
          .from("user_food_profiles")
          .select(
            "id, food_name, brand, serving_label, serving_weight_grams, serving_volume_ml, household_quantity_per_serving, household_unit, calories_per_serving, protein_grams_per_serving, carbohydrate_grams_per_serving, fat_grams_per_serving, fiber_grams_per_serving, sugar_grams_per_serving, sodium_mg_per_serving",
          )
          .eq("user_id", userId)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return {
          targetCalories: Number(
            (args as Record<string, unknown>)?.targetCalories ?? 0,
          ),
          targetProteinGrams: Number(
            (args as Record<string, unknown>)?.targetProteinGrams ?? 0,
          ),
          foods: (data ?? [])
            .sort(
              (a, b) =>
                Number(b.protein_grams_per_serving) * 4 +
                Number(b.fiber_grams_per_serving ?? 0) * 3 -
                Number(b.calories_per_serving) * 0.01 -
                (Number(a.protein_grams_per_serving) * 4 +
                  Number(a.fiber_grams_per_serving ?? 0) * 3 -
                  Number(a.calories_per_serving) * 0.01),
            )
            .slice(0, 30),
        };
      }
      const days = safeDays(args);
      const start = dateStart(days);
      if (name === "get_weight_trend") {
        if (!permissions.use_vitals) return denied("vitals");
        const { data, error } = await client
          .from("vital_samples")
          .select("kind, value, unit, occurred_at")
          .eq("user_id", userId)
          .gte("occurred_at", start)
          .is("deleted_at", null)
          .order("occurred_at")
          .limit(1000);
        if (error) throw error;
        return { days, samples: data ?? [] };
      }
      if (name === "get_training_summary") {
        if (!permissions.use_training) return denied("training");
        const sessions = await client
          .from("workout_sessions")
          .select("id, title, muscle_groups, completed_at, location")
          .eq("user_id", userId)
          .gte("completed_at", start)
          .order("completed_at", { ascending: false })
          .limit(100);
        if (sessions.error) throw sessions.error;
        const ids = (sessions.data ?? []).map((row) => row.id);
        const sets = ids.length
          ? await client
              .from("workout_sets")
              .select(
                "session_id, exercise_name, exercise_order, muscle_group, set_number, weight, weight_unit, reps",
              )
              .eq("user_id", userId)
              .in("session_id", ids)
              .limit(1000)
          : { data: [], error: null };
        if (sets.error) throw sets.error;
        return { days, sessions: sessions.data ?? [], sets: sets.data ?? [] };
      }
      if (name === "get_nutrition_patterns") {
        if (!permissions.use_nutrition) return denied("nutrition");
        const { data, error } = await client
          .from("nutrition_entries")
          .select(
            "food_name, meal_type, calories, protein_grams, carbohydrate_grams, fat_grams, fiber_grams, occurred_at",
          )
          .eq("user_id", userId)
          .gte("occurred_at", start)
          .order("occurred_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return { days, entries: data ?? [] };
      }
      if (name === "get_cardio_and_hydration_summary") {
        if (!permissions.use_training && !permissions.use_hydration)
          return denied("training or hydration");
        const [cardio, hydration] = await Promise.all([
          permissions.use_training
            ? client
                .from("cardio_entries")
                .select(
                  "activity_type, activity_name, duration_minutes, distance_miles, occurred_at",
                )
                .eq("user_id", userId)
                .gte("occurred_at", start)
                .is("deleted_at", null)
                .limit(365)
            : Promise.resolve({ data: [], error: null }),
          permissions.use_hydration
            ? client
                .from("hydration_entries")
                .select("fluid_name, volume_ml, occurred_at")
                .eq("user_id", userId)
                .gte("occurred_at", start)
                .limit(365)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (cardio.error || hydration.error)
          throw cardio.error ?? hydration.error;
        return {
          days,
          cardio: cardio.data ?? [],
          hydration: hydration.data ?? [],
        };
      }
      return { error: "Unknown tool" };
    },
    validateActions: async (token, userId, actions, userMessage) => {
      const client = userClient(token);
      const validated: CoachActionPayload[] = [];
      for (const raw of actions) {
        const action = coachActionPayloadSchema.parse(raw);
        if (action.kind === "next_meal") {
          const savedIds = [
            ...new Set(
              action.items.flatMap((item) =>
                item.profileId === null ? [] : [item.profileId],
              ),
            ),
          ];
          const result = savedIds.length
            ? await client
                .from("user_food_profiles")
                .select("id, food_name")
                .eq("user_id", userId)
                .in("id", savedIds)
                .is("archived_at", null)
            : { data: [], error: null };
          if (result.error || result.data?.length !== savedIds.length) continue;
          const byId = new Map(
            (result.data ?? []).map((row) => [
              String(row.id),
              String(row.food_name),
            ]),
          );
          if (
            action.items.some(
              (item) =>
                item.profileId === null &&
                (!proposedFoodMatchesUserMessage(item.name, userMessage) ||
                  !proposedFoodSupportsUnit(item)),
            )
          )
            continue;
          const items = action.items.map((item) =>
            item.profileId === null
              ? item
              : { ...item, name: byId.get(item.profileId)! },
          );
          validated.push({ ...action, items });
        } else {
          if (!trainingActionHasValidShape(action)) continue;
          const { data, error } = await client
            .from("workout_sets")
            .select("exercise_name")
            .eq("user_id", userId)
            .limit(1000);
          if (error) continue;
          const names = new Map(
            (data ?? []).map((row) => [
              String(row.exercise_name).trim().toLocaleLowerCase(),
              String(row.exercise_name),
            ]),
          );
          if (
            action.exercises.some((exercise) => {
              const known = names.has(exercise.name.trim().toLocaleLowerCase());
              return !known && exercise.suggestedWeightLb !== null;
            })
          )
            continue;
          validated.push({
            ...action,
            exercises: action.exercises.map((exercise) => ({
              ...exercise,
              name:
                names.get(exercise.name.trim().toLocaleLowerCase()) ??
                exercise.name,
              targetReps: Array.from(
                { length: exercise.setCount },
                (_, index) =>
                  exercise.targetReps[index] ?? exercise.targetReps.at(-1) ?? 8,
              ),
            })),
          });
        }
      }
      return validated;
    },
    saveConversation: async (token, input) => {
      const client = userClient(token);
      const { error } = await client.rpc("save_coach_turn", {
        p_user_id: input.userId,
        p_thread_id: input.threadId,
        p_thread_title: input.threadTitle,
        p_thread_summary: input.threadSummary,
        p_user_message_id: input.userMessageId,
        p_assistant_message_id: input.assistantMessageId,
        p_user_message: input.userMessage,
        p_answer: input.answer,
        p_evidence: input.evidence,
        p_sources: input.sources,
        p_model_tier: input.tier,
        p_input_tokens: input.usage.inputTokens,
        p_output_tokens: input.usage.outputTokens,
        p_actions: input.actions,
      });
      if (error) throw error;
    },
    recordUsage: async (userId, usage) => {
      const { error } = await admin.rpc("record_coach_tokens", {
        p_user_id: userId,
        p_input_tokens: usage.inputTokens,
        p_output_tokens: usage.outputTokens,
      });
      if (error) throw error;
    },
    reportEvent: (event) => console.log("coach_request", event),
  }),
);

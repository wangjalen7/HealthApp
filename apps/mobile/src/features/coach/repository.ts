import {
  coachActionPayloadSchema,
  coachProfileSchema,
  coachResponseSchema,
  type CoachActionPayload,
  type CoachEvidence,
  type CoachProfile,
  type CoachRequest,
} from "../../../../../supabase/functions/_shared/coach";
import { supabase } from "../../lib/supabase";

export type CoachThread = {
  id: string;
  title: string;
  updatedAt: string;
};
export type CoachAction = {
  id: string;
  status: "pending" | "applied" | "dismissed";
  payload: CoachActionPayload;
};
export type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence: CoachEvidence[];
  sources: { title: string; url: string }[];
  createdAt: string;
  actions: CoachAction[];
};

const splitList = (value: unknown) =>
  Array.isArray(value)
    ? value.map(String)
    : String(value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

function fromProfileRow(row: Record<string, unknown>): CoachProfile {
  return coachProfileSchema.parse({
    userId: row.user_id,
    goals:
      Array.isArray(row.goals) && row.goals.length
        ? row.goals
        : [row.primary_goal],
    experienceLevel: row.experience_level,
    trainingDaysPerWeek: Number(row.training_days_per_week),
    sessionMinutes: Number(row.session_minutes),
    equipment: splitList(row.equipment),
    limitations: row.limitations ?? undefined,
    dietaryPreferences: splitList(row.dietary_preferences),
    dietaryRestrictions: splitList(row.dietary_restrictions),
    dislikedFoods: splitList(row.disliked_foods),
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

export async function getCoachProfile(userId: string) {
  const { data, error } = await supabase
    .from("coach_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromProfileRow(data) : undefined;
}

export async function saveCoachProfile(input: CoachProfile) {
  const value = coachProfileSchema.parse(input);
  const { error } = await supabase.from("coach_profiles").upsert({
    user_id: value.userId,
    goals: value.goals,
    primary_goal: value.goals[0],
    experience_level: value.experienceLevel,
    training_days_per_week: value.trainingDaysPerWeek,
    session_minutes: value.sessionMinutes,
    equipment: value.equipment,
    limitations: value.limitations ?? null,
    dietary_preferences: value.dietaryPreferences,
    dietary_restrictions: value.dietaryRestrictions,
    disliked_foods: value.dislikedFoods,
    meal_prep_minutes: value.mealPrepMinutes ?? null,
    height_inches: value.heightInches ?? null,
    birth_year: value.birthYear ?? null,
    energy_estimation_sex: value.energyEstimationSex ?? null,
    target_weight_change_lb_week: value.targetWeightChangeLbWeek ?? null,
    response_style: value.responseStyle,
    use_nutrition: value.useNutrition,
    use_training: value.useTraining,
    use_vitals: value.useVitals,
    use_hydration: value.useHydration,
    use_photo_metadata: value.usePhotoMetadata,
    consented_at: value.consentedAt,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return value;
}

export async function listCoachThreads(userId: string): Promise<CoachThread[]> {
  const { data, error } = await supabase
    .from("coach_threads")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    updatedAt: String(row.updated_at),
  }));
}

export async function getCoachMessages(
  userId: string,
  threadId: string,
): Promise<CoachMessage[]> {
  const [messages, actions] = await Promise.all([
    supabase
      .from("coach_messages")
      .select("id, role, content, evidence, sources, created_at")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .order("created_at"),
    supabase
      .from("coach_actions")
      .select("id, message_id, status, payload")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .order("created_at"),
  ]);
  if (messages.error) throw new Error(messages.error.message);
  if (actions.error) throw new Error(actions.error.message);
  return (messages.data ?? []).map((row) => ({
    id: String(row.id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content),
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    sources: Array.isArray(row.sources) ? row.sources : [],
    createdAt: String(row.created_at),
    actions: (actions.data ?? [])
      .filter((action) => action.message_id === row.id)
      .flatMap((action) => {
        const parsed = coachActionPayloadSchema.safeParse(action.payload);
        return parsed.success
          ? [
              {
                id: String(action.id),
                status: action.status as CoachAction["status"],
                payload: parsed.data,
              },
            ]
          : [];
      }),
  }));
}

export async function deleteCoachThread(userId: string, threadId: string) {
  const { error } = await supabase
    .from("coach_threads")
    .delete()
    .eq("user_id", userId)
    .eq("id", threadId);
  if (error) throw new Error(error.message);
}

export async function updateCoachActionStatus(
  userId: string,
  actionId: string,
  status: "applied" | "dismissed",
) {
  const { error } = await supabase
    .from("coach_actions")
    .update({
      status,
      applied_at: status === "applied" ? new Date().toISOString() : null,
    })
    .eq("user_id", userId)
    .eq("id", actionId);
  if (error) throw new Error(error.message);
}

export async function sendCoachMessage(
  input: CoachRequest,
  signal?: AbortSignal,
) {
  const { data, error } = await supabase.functions.invoke("coach-chat", {
    body: input,
    signal,
  });
  if (error) {
    let message =
      "Could not reach AI Coach. Check your connection and try again.";
    const response = (error as { context?: Response }).context;
    if (response?.json) {
      try {
        const body = await response.json();
        if (typeof body.message === "string") message = body.message;
      } catch {
        /* Keep the connection fallback. */
      }
    }
    throw new Error(message);
  }
  const parsed = coachResponseSchema.safeParse(data);
  if (!parsed.success)
    throw new Error("AI Coach returned an incomplete response. Try again.");
  return parsed.data;
}

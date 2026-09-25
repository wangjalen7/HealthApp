import { aiConsentVersion, minimizeAiContext } from "../_shared/ai-privacy.ts";
import {
  workoutPlanningInstructions,
  workoutPlanIssue,
  workoutPreferenceErrors,
} from "../_shared/workout-planning.ts";
import { z } from "zod/v4";
import {
  coachActionPayloadSchema,
  coachEvidenceSchema,
  coachInstructions,
  coachModelResultSchema,
  workoutModelResultSchema,
  coachRequestSchema,
  coachSourceSchema,
  coachTierForMessage,
  explicitWebRequest,
  type CoachActionPayload,
  type CoachProfile,
  type CoachRequest,
  type CoachTier,
} from "../_shared/coach.ts";

type Quota = {
  allowed: boolean;
  standardRemaining: number;
  deepRemaining: number;
};
type SavedAction = {
  id: string;
  status: "pending";
  payload: CoachActionPayload;
};
type Context = {
  profile: CoachProfile;
  snapshot: unknown;
  thread?: { id: string; title: string; summary: string };
  messages: { role: "user" | "assistant"; content: string }[];
};
type Usage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

export type CoachHandlerDependencies = {
  enabled: boolean;
  /** Only for regression coverage of the retired protocol; production leaves false. */
  allowLegacyChat?: boolean;
  apiKey?: string;
  standardModel: string;
  deepModel: string;
  headers?: Record<string, string>;
  authenticate: (token: string) => Promise<string | undefined>;
  recordConsent: (userId: string, version: string, history: boolean) => Promise<void>;
  consumeQuota: (userId: string, tier: CoachTier) => Promise<Quota>;
  refundQuota: (userId: string, tier: CoachTier) => Promise<void>;
  loadContext: (
    token: string,
    userId: string,
    input: CoachRequest,
  ) => Promise<Context | undefined>;
  runTool: (
    token: string,
    userId: string,
    name: string,
    args: unknown,
    requestContext: { timezone: string; localDate: string },
  ) => Promise<unknown>;
  validateActions: (
    token: string,
    userId: string,
    actions: CoachActionPayload[],
    userMessage: string,
  ) => Promise<CoachActionPayload[]>;
  saveConversation: (
    token: string,
    input: {
      userId: string;
      threadId: string;
      threadTitle: string;
      threadSummary: string;
      userMessageId: string;
      assistantMessageId: string;
      userMessage: string;
      answer: string;
      evidence: unknown[];
      sources: unknown[];
      tier: CoachTier;
      usage: Usage;
      actions: { id: string; payload: CoachActionPayload }[];
    },
  ) => Promise<void>;
  recordUsage: (userId: string, usage: Usage) => Promise<void>;
  reportEvent?: (event: Record<string, unknown>) => void;
  fetch?: typeof fetch;
};

const maxBodyBytes = 16_000;
const toolArguments = z.record(z.string(), z.unknown());
const outputTokenLimits: Record<CoachTier, number> = {
  standard: 1_400,
  deep: 4_000,
};

export function openAiCompatibleSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(openAiCompatibleSchema);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "format") continue;
    output[key === "oneOf" ? "anyOf" : key] = openAiCompatibleSchema(child);
  }
  if (
    output.type === "object" &&
    output.properties &&
    typeof output.properties === "object"
  ) {
    const properties = output.properties as Record<string, unknown>;
    const required = Array.isArray(output.required) ? output.required : [];
    for (const key of Object.keys(properties))
      if (!required.includes(key))
        properties[key] = { anyOf: [properties[key], { type: "null" }] };
    output.required = Object.keys(properties);
  }
  return output;
}

const coachModelEnvelopeSchema = z
  .object({
    answer: z.string().trim().min(1).max(12_000),
    safetyLevel: z.enum(["normal", "caution", "urgent"]),
    threadSummary: z.string().trim().max(4_000),
    evidence: z.array(z.unknown()).max(12),
    sources: z.array(z.unknown()).max(8),
    actions: z.array(z.unknown()).max(2),
  })
  .strict();

export function parseCoachModelResult(text: string, workoutPlanning = false) {
  const value: unknown = JSON.parse(text);
  const envelope = coachModelEnvelopeSchema.parse(
    workoutPlanning ? workoutModelResultSchema.parse(value).result : value,
  );
  return {
    ...envelope,
    evidence: envelope.evidence.flatMap((item) => {
      const parsed = coachEvidenceSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
    sources: envelope.sources.flatMap((item) => {
      const parsed = coachSourceSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
    actions: envelope.actions.flatMap((item) => {
      const parsed = coachActionPayloadSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  };
}

const tools = [
  {
    type: "function",
    name: "get_day_log",
    description:
      "Get the authenticated user's saved logs for one YYYY-MM-DD local date.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      },
      required: ["date"],
    },
  },
  ...[
    [
      "get_weight_trend",
      "Get bounded weight and vital trends for a date window.",
    ],
    [
      "get_training_summary",
      "Get lifting history, exercise performance and muscle-group totals.",
    ],
    [
      "get_nutrition_patterns",
      "Get nutrition totals, meals and recurring foods.",
    ],
    ["get_cardio_and_hydration_summary", "Get cardio and hydration totals."],
  ].map(([name, description]) => ({
    type: "function",
    name,
    description,
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { days: { type: "integer", enum: [7, 30, 90, 365] } },
      required: ["days"],
    },
  })),
  {
    type: "function",
    name: "get_saved_food_candidates",
    description:
      "Get owned saved foods ranked for a filling meal and the user's remaining daily goals.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        targetCalories: { type: "integer", minimum: 0, maximum: 5000 },
        targetProteinGrams: { type: "integer", minimum: 0, maximum: 500 },
      },
      required: ["targetCalories", "targetProteinGrams"],
    },
  },
];

async function readJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodyBytes) throw new Error("too_large");
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function responseText(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = Array.isArray((item as Record<string, unknown>).content)
        ? ((item as Record<string, unknown>).content as unknown[])
        : [];
      return content.flatMap((part) =>
        part &&
        typeof part === "object" &&
        (part as Record<string, unknown>).type === "output_text"
          ? [String((part as Record<string, unknown>).text ?? "")]
          : [],
      );
    })
    .join("");
}

function functionCalls(response: Record<string, unknown>) {
  return (Array.isArray(response.output) ? response.output : []).flatMap(
    (item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      return row.type === "function_call" &&
        typeof row.name === "string" &&
        typeof row.call_id === "string"
        ? [
            {
              name: row.name,
              callId: row.call_id,
              arguments: String(row.arguments ?? "{}"),
            },
          ]
        : [];
    },
  );
}

function usageFrom(response: Record<string, unknown>): Usage {
  const usage =
    response.usage && typeof response.usage === "object"
      ? (response.usage as Record<string, unknown>)
      : {};
  const details =
    usage.input_tokens_details && typeof usage.input_tokens_details === "object"
      ? (usage.input_tokens_details as Record<string, unknown>)
      : {};
  return {
    inputTokens: Number(usage.input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    cachedTokens: Number(details.cached_tokens ?? 0),
  };
}

function addUsage(total: Usage, next: Usage) {
  total.inputTokens += next.inputTokens;
  total.outputTokens += next.outputTokens;
  total.cachedTokens += next.cachedTokens;
}

function boundedJson(value: unknown, maxChars: number) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxChars) return serialized;
  return JSON.stringify({
    truncated: true,
    note: "Additional records were omitted to keep this request within its token budget.",
    preview: serialized.slice(0, Math.max(0, maxChars - 180)),
  });
}

function boundedMessages(messages: Context["messages"], maxChars: number) {
  const kept: Context["messages"] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const cost = message.content.length + 40;
    if (used + cost > maxChars) break;
    kept.unshift(message);
    used += cost;
  }
  return kept;
}

function titleFrom(message: string) {
  const title = message.trim().replace(/\s+/g, " ").slice(0, 60);
  return title.length < message.trim().length ? `${title}…` : title;
}

export function createCoachHandler(deps: CoachHandlerDependencies) {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...deps.headers,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  const fail = (code: string, message: string, status: number) =>
    json({ code, message }, status);
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
      return new Response("ok", { headers: deps.headers });
    if (request.method !== "POST")
      return fail("method_not_allowed", "Use POST.", 405);
    if (!deps.enabled)
      return fail("not_enabled", "AI Coach is not enabled yet.", 503);
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return fail("unauthorized", "Sign in to use AI Coach.", 401);
    const userId = await deps.authenticate(token).catch(() => undefined);
    if (!userId)
      return fail("unauthorized", "Your session expired. Sign in again.", 401);
    if (!deps.apiKey)
      return fail(
        "not_configured",
        "AI Coach needs an OpenAI API key and funded API project.",
        503,
      );
    let input: CoachRequest;
    try {
      input = coachRequestSchema.parse(await readJson(request));
      new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const preferenceIssues = error.issues
          .filter((issue) => issue.path[0] === "workoutPreferences")
          .map((issue) => ({ path: issue.path.slice(1) }));
        if (preferenceIssues.length)
          return fail(
            "invalid_preferences",
            workoutPreferenceErrors(preferenceIssues)
              .map((issue) => issue.message)
              .join(" "),
            400,
          );
      }
      return fail(
        "invalid_request",
        "Check your request and time zone, then try again.",
        400,
      );
    }
    if (input.consentVersion !== aiConsentVersion)
      return fail("consent_required", "Review and allow sharing with OpenAI for this request in the updated app.", 403);
    // The supported public feature is workout planning. Older general-chat clients
    // must not silently continue sharing broader health context under old choices.
    if (!input.workoutPreferences && !deps.allowLegacyChat)
      return fail("planner_required", "Use the current workout planner to make a new request.", 400);
    if (input.workoutPreferences && input.threadId)
      return fail("new_plan_required", "Create a new workout plan. Previous conversations are not shared with this request.", 400);
    try { await deps.recordConsent(userId, aiConsentVersion, input.includeTrainingHistory); }
    catch { return fail("consent_unavailable", "Could not record your AI choice. Nothing was sent to OpenAI. Try again later.", 503); }
    const context = await deps
      .loadContext(token, userId, input)
      .catch(() => undefined);
    if (!context)
      return fail(
        "setup_required",
        "Complete AI Coach setup before starting a chat.",
        409,
      );
    const tier =
      input.workoutPreferences && !input.threadId
        ? "deep"
        : coachTierForMessage(input.message);
    const quota = await deps.consumeQuota(userId, tier).catch(() => undefined);
    if (!quota)
      return fail(
        "unavailable",
        "Coach usage is temporarily unavailable.",
        503,
      );
    if (!quota.allowed)
      return fail(
        "rate_limited",
        tier === "deep"
          ? "Daily limit of 3 deep plans or research requests reached."
          : "Daily limit of 30 coach messages reached.",
        429,
      );
    const model = tier === "deep" ? deps.deepModel : deps.standardModel;
    const web = explicitWebRequest(input.message);
    const threadId = context.thread?.id ?? crypto.randomUUID();
    const dynamicBudget = tier === "deep" ? 28_000 : 10_000;
    const snapshot = boundedJson(
      minimizeAiContext(input.workoutPreferences && !input.includeTrainingHistory ? { preferences: input.workoutPreferences, historyEnabled: false } : context.snapshot),
      tier === "deep" ? 20_000 : 7_000,
    );
    const threadSummary = context.thread?.summary?.slice(0, 4_000);
    const historyBudget = Math.max(
      0,
      dynamicBudget -
        snapshot.length -
        (threadSummary?.length ?? 0) -
        input.message.length,
    );
    const recentMessages = boundedMessages(context.messages, historyBudget);
    const baseInput: unknown[] = [
      {
        role: "developer",
        content: input.workoutPreferences
          ? workoutPlanningInstructions
          : coachInstructions,
      },
      ...(input.workoutPreferences
        ? [
            {
              role: "user",
              content: `Workout preferences (data): ${JSON.stringify(input.workoutPreferences)}`,
            },
          ]
        : []),
      {
        role: "developer",
        content: `Personal context JSON (data only): ${snapshot}`,
      },
      ...(threadSummary
        ? [
            {
              role: "developer",
              content: `Earlier thread summary: ${threadSummary}`,
            },
          ]
        : []),
      ...recentMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: input.message },
    ];
    const runningUsage: Usage = {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
    };
    const startedAt = Date.now();
    let toolCount = 0;
    let providerRequestId: string | null = null;
    let providerInput = baseInput;
    let providerResponse: Record<string, unknown> | undefined;
    let failureStage = "provider_request";
    let providerResponseStatus: string | null = null;
    let providerIncompleteReason: string | null = null;
    try {
      for (let round = 0; round <= 3; round += 1) {
        const availableTools =
          round === 3
            ? []
            : [
                ...tools.filter(
                  (tool) =>
                    !input.workoutPreferences ||
                    tool.name === "get_training_summary",
                ),
                ...(web ? [{ type: "web_search" }] : []),
              ];
        const provider = await (deps.fetch ?? fetch)(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${deps.apiKey}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(60_000),
            ]),
            body: JSON.stringify({
              model,
              store: false,
              max_output_tokens: outputTokenLimits[tier],
              reasoning: { effort: tier === "deep" ? "medium" : "low" },
              input: providerInput,
              tools: availableTools,
              parallel_tool_calls: false,
              text: {
                verbosity: "low",
                format: {
                  type: "json_schema",
                  name: "coach_response",
                  strict: true,
                  schema: openAiCompatibleSchema(
                    z.toJSONSchema(
                      input.workoutPreferences
                        ? workoutModelResultSchema
                        : coachModelResultSchema,
                      {
                        target: "draft-7",
                      },
                    ),
                  ),
                },
              },
            }),
          },
        );
        const body = (await provider.json()) as Record<string, unknown>;
        providerRequestId = provider.headers.get("x-request-id");
        providerResponseStatus =
          typeof body.status === "string" ? body.status : null;
        const incompleteDetails =
          body.incomplete_details && typeof body.incomplete_details === "object"
            ? (body.incomplete_details as Record<string, unknown>)
            : undefined;
        providerIncompleteReason =
          typeof incompleteDetails?.reason === "string"
            ? incompleteDetails.reason
            : null;
        if (!provider.ok) {
          await deps.refundQuota(userId, tier).catch(() => undefined);
          deps.reportEvent?.({
            status: provider.status,
            latencyMs: Date.now() - startedAt,
            modelTier: tier,
            toolCount,
            inputTokens: runningUsage.inputTokens,
            outputTokens: runningUsage.outputTokens,
            cachedTokens: runningUsage.cachedTokens,
            requestId: providerRequestId,
          });
          return fail(
            provider.status === 429 ? "provider_limit" : "provider_error",
            provider.status === 429
              ? "OpenAI billing, spending, or rate limits prevented this response."
              : "AI Coach could not respond right now. Try again later.",
            502,
          );
        }
        addUsage(runningUsage, usageFrom(body));
        providerResponse = body;
        const calls = functionCalls(body);
        if (!calls.length) break;
        const outputs = [];
        for (const call of calls) {
          toolCount += 1;
          let args: unknown = {};
          try {
            args = toolArguments.parse(JSON.parse(call.arguments));
          } catch {
            /* Send bounded invalid output. */
          }
          const result =
            input.workoutPreferences && (call.name !== "get_training_summary" || !input.includeTrainingHistory)
              ? {
                  error:
                    "Only training tools are available in workout planning.",
                }
              : await deps
                  .runTool(token, userId, call.name, args, {
                    timezone: input.timezone,
                    localDate: input.localDate,
                  })
                  .catch(() => ({ error: "Tool data unavailable" }));
          outputs.push({
            type: "function_call_output",
            call_id: call.callId,
            output: boundedJson(minimizeAiContext(result), tier === "deep" ? 8_000 : 4_000),
          });
        }
        providerInput = [
          ...providerInput,
          ...(Array.isArray(body.output) ? body.output : []),
          ...outputs,
        ];
      }
      if (!providerResponse) throw new Error("missing_response");
      failureStage = "model_response_validation";
      const parsed = parseCoachModelResult(
        responseText(providerResponse),
        Boolean(input.workoutPreferences),
      );
      failureStage = "action_validation";
      let safeActions =
        parsed.safetyLevel === "normal"
          ? await deps.validateActions(
              token,
              userId,
              parsed.actions
                .filter(
                  (action) =>
                    !input.workoutPreferences || action.kind === "next_workout",
                )
                .slice(0, input.workoutPreferences ? 1 : 2)
                .map((action) => coachActionPayloadSchema.parse(action)),
              input.message,
            )
          : [];
      if (input.workoutPreferences && parsed.safetyLevel === "normal") {
        if (
          safeActions.length !== 1 ||
          workoutPlanIssue(safeActions[0], input.workoutPreferences)
        )
          throw new Error("incomplete_workout_plan");
      }
      const assistantMessageId = crypto.randomUUID();
      const actions: SavedAction[] = safeActions.map((payload) => ({
        id: crypto.randomUUID(),
        status: "pending",
        payload,
      }));
      failureStage = "conversation_save";
      await deps.saveConversation(token, {
        userId,
        threadId,
        threadTitle:
          context.thread?.title ??
          (input.workoutPreferences
            ? "Workout: " + titleFrom(input.message)
            : titleFrom(input.message)),
        threadSummary: parsed.threadSummary,
        userMessageId: crypto.randomUUID(),
        assistantMessageId,
        userMessage: input.message,
        answer: parsed.answer,
        evidence: parsed.evidence,
        sources: parsed.sources,
        tier,
        usage: runningUsage,
        actions: actions.map(({ id, payload }) => ({ id, payload })),
      });
      await deps.recordUsage(userId, runningUsage).catch(() => undefined);
      deps.reportEvent?.({
        status: 200,
        latencyMs: Date.now() - startedAt,
        modelTier: tier,
        toolCount,
        inputTokens: runningUsage.inputTokens,
        outputTokens: runningUsage.outputTokens,
        cachedTokens: runningUsage.cachedTokens,
        requestId: providerRequestId,
      });
      return json({
        threadId,
        messageId: assistantMessageId,
        answer: parsed.answer,
        safetyLevel: parsed.safetyLevel,
        evidence: parsed.evidence,
        sources: parsed.sources,
        actions,
        quota: {
          standardRemaining: quota.standardRemaining,
          deepRemaining: quota.deepRemaining,
        },
      });
    } catch (error) {
      await deps.refundQuota(userId, tier).catch(() => undefined);
      const errorCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : error instanceof SyntaxError
            ? "invalid_json"
            : error instanceof z.ZodError
              ? "schema_validation"
              : "unexpected";
      deps.reportEvent?.({
        status: 502,
        failureStage,
        errorCode,
        providerResponseStatus,
        providerIncompleteReason,
        latencyMs: Date.now() - startedAt,
        modelTier: tier,
        toolCount,
        inputTokens: runningUsage.inputTokens,
        outputTokens: runningUsage.outputTokens,
        cachedTokens: runningUsage.cachedTokens,
        requestId: providerRequestId,
      });
      if (failureStage === "conversation_save")
        return fail(
          "conversation_save_failed",
          "AI Coach generated a response, but Supabase could not save it. Try again.",
          502,
        );
      if (failureStage === "action_validation")
        return fail(
          "action_validation_failed",
          input.workoutPreferences
            ? "AI did not return a complete workout that fits your preferences. Your draft was not changed and this attempt was not counted. Try generating again."
            : "AI Coach generated a plan that could not be validated against your saved data. Try again.",
          502,
        );
      if (providerResponseStatus === "incomplete")
        return fail(
          "provider_incomplete",
          "AI Coach ran out of response space while reviewing your data. Try again.",
          502,
        );
      return fail(
        "invalid_response",
        input.workoutPreferences
          ? "AI did not return a complete workout. Your draft was not changed and this attempt was not counted. Try generating again."
          : "AI Coach could not format a valid response. Your message was not saved; try again.",
        502,
      );
    }
  };
}

import { aiConsentVersion } from "../_shared/ai-privacy.ts";
import {
  mealDailyEstimateLimit,
  mealEstimateRequestSchema,
  mealRequestMaxBytes,
  mealResponseBody,
  parseMealResponse,
} from "../_shared/meal-estimate.ts";

type Dependencies = {
  apiKey?: string;
  model: string;
  headers?: Record<string, string>;
  authenticate: (token: string) => Promise<string | undefined>;
  recordConsent: (userId: string, version: string) => Promise<void>;
  consumeQuota: (userId: string) => Promise<boolean>;
  reportProviderFailure?: (failure: {
    status: number;
    code: string | null;
    type: string | null;
    requestId: string | null;
  }) => void;
  fetch?: typeof fetch;
};

type ProviderFailure = { code: string; message: string; status: number };

function providerValue(value: unknown): string | null {
  return typeof value === "string" && value.length <= 160 ? value : null;
}

export function classifyOpenAiFailure(
  status: number,
  body: unknown,
): ProviderFailure {
  const providerError =
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object"
      ? (body.error as Record<string, unknown>)
      : undefined;
  const code = providerValue(providerError?.code);
  const type = providerValue(providerError?.type);
  const billingCodes = new Set([
    "credit_balance_exhausted",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded",
    "organization_usage_limit_exceeded",
    "insufficient_quota",
  ]);
  if (
    status === 429 &&
    (billingCodes.has(code ?? "") || type === "insufficient_quota")
  ) {
    return {
      code: "provider_billing",
      message:
        "OpenAI API billing has no available credits or a spending limit was reached. Add API credits or update the project limit, then try again.",
      status: 402,
    };
  }
  if (status === 401) {
    return {
      code: "provider_auth",
      message:
        "OpenAI rejected the API key. Replace the server-side OPENAI_API_KEY with an active project key.",
      status: 502,
    };
  }
  if (status === 403) {
    return {
      code: "provider_access",
      message:
        "The OpenAI project does not allow this request. Check the key permissions, project access, and regional settings.",
      status: 502,
    };
  }
  if (status === 404 || code === "model_not_found") {
    return {
      code: "provider_model",
      message:
        "The configured OpenAI model is unavailable to this API project. Check OPENAI_MEAL_MODEL and project model access.",
      status: 503,
    };
  }
  if (status === 429) {
    return {
      code: "provider_rate_limited",
      message:
        "OpenAI is rate limiting meal estimates. Wait briefly and try again.",
      status: 429,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: "provider_request",
      message:
        "OpenAI rejected the meal-estimate request. The server integration needs an update before this can be retried.",
      status: 502,
    };
  }
  return {
    code: "provider_unavailable",
    message:
      "OpenAI could not estimate this meal right now. Try again later or add food manually.",
    status: 502,
  };
}

async function readLimitedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > mealRequestMaxBytes) {
      await reader.cancel();
      throw new Error("too_large");
    }
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

export function createMealHandler(deps: Dependencies) {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...deps.headers,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  const error = (code: string, message: string, status: number) =>
    json({ code, message }, status);
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
      return new Response("ok", { headers: deps.headers });
    if (request.method !== "POST")
      return error("method_not_allowed", "Use POST.", 405);
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token)
      return error("unauthorized", "Sign in to estimate a meal.", 401);
    let userId: string | undefined;
    try {
      userId = await deps.authenticate(token);
    } catch {
      return error(
        "unavailable",
        "Meal estimation is temporarily unavailable.",
        503,
      );
    }
    if (!userId)
      return error("unauthorized", "Your session expired. Sign in again.", 401);
    if (!deps.apiKey)
      return error(
        "not_configured",
        "AI meal estimation is not configured yet. You can still add food manually.",
        503,
      );
    if (Number(request.headers.get("Content-Length")) > mealRequestMaxBytes) {
      return error(
        "invalid_request",
        "Choose a smaller photo (up to 2 MB).",
        413,
      );
    }
    let input;
    try {
      input = mealEstimateRequestSchema.parse(await readLimitedJson(request));
    } catch {
      return error(
        "invalid_request",
        "Add a meal description or a JPEG photo up to 2 MB, and allow AI processing.",
        400,
      );
    }
    try {
      if (input.consentVersion !== aiConsentVersion)
        return error("consent_required", "Review and allow sharing this meal with OpenAI in the updated app.", 403);
      await deps.recordConsent(userId, aiConsentVersion);
      if (!(await deps.consumeQuota(userId)))
        return error(
          "rate_limited",
          `Daily AI limit of ${mealDailyEstimateLimit} estimates reached. Try again tomorrow or add food manually.`,
          429,
        );
    } catch {
      return error(
        "unavailable",
        "Meal estimation is temporarily unavailable. Try again later.",
        503,
      );
    }
    try {
      const response = await (deps.fetch ?? fetch)(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${deps.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mealResponseBody(input, deps.model)),
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!response.ok) {
        let providerBody: unknown;
        try {
          providerBody = await response.json();
        } catch {
          providerBody = undefined;
        }
        const failure = classifyOpenAiFailure(response.status, providerBody);
        const providerError =
          providerBody &&
          typeof providerBody === "object" &&
          "error" in providerBody &&
          providerBody.error &&
          typeof providerBody.error === "object"
            ? (providerBody.error as Record<string, unknown>)
            : undefined;
        deps.reportProviderFailure?.({
          status: response.status,
          code: providerValue(providerError?.code),
          type: providerValue(providerError?.type),
          requestId: providerValue(response.headers.get("x-request-id")),
        });
        return error(failure.code, failure.message, failure.status);
      }
      return json(parseMealResponse(await response.json()));
    } catch {
      // Never log meal text, images, provider response bodies, or credentials.
      return error(
        "estimate_failed",
        "AI did not return a complete meal estimate. Try a clearer photo or more detail.",
        502,
      );
    }
  };
}

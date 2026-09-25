import assert from "node:assert/strict";
import test from "node:test";
import { aiConsentVersion } from "../_shared/ai-privacy.ts";
import { classifyOpenAiFailure, createMealHandler } from "./handler.ts";
import {
  deduplicateEstimatedFoods,
  mealResponseBody,
  parseMealResponse,
  mealEstimateRequestSchema,
  mealRequestMaxBytes,
} from "../_shared/meal-estimate.ts";

const result = {
  inputType: "meal" as const,
  items: [
    {
      name: "Cooked pasta",
      description: "Plain cooked pasta",
      portionAmount: 1,
      portionUnit: "serving",
      servingLabel: "1 serving (200 g)",
      servingWeightGrams: 200,
      servingVolumeMl: null,
      householdQuantityPerServing: null,
      householdUnit: null,
      confidence: "medium",
      assumptions: "Cooked weight",
      nutrientsPerServing: {
        calories: 316,
        proteinGrams: 11.6,
        carbohydrateGrams: 62,
        fatGrams: 1.8,
        fiberGrams: 3.6,
        sugarGrams: 1.2,
        sodiumMg: 2,
      },
    },
  ],
  explanation: "Review the estimated cooked portion.",
};
const response = {
  status: "completed",
  output: [
    { type: "reasoning" },
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(result) }],
    },
  ],
};
const request = (
  body: unknown = { description: "200g pasta", consent: true },
  token = "test-token",
) =>
  new Request("https://example.test", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(typeof body === "object" && body ? { consentVersion: aiConsentVersion, ...body } : body),
  });
const deps = {
  apiKey: "test-key",
  model: "test-model",
  authenticate: async () => "test-user",
  recordConsent: async () => undefined,
  consumeQuota: async () => true,
};

test("meal sharing requires the current notice and a saved minimal consent receipt",async()=>{
  let paid=0;
  const handler=createMealHandler({...deps,fetch:async()=>{paid++;throw Error("not allowed");}});
  assert.equal((await handler(request({description:"pasta",consent:true,consentVersion:"old"}))).status,403);
  const unavailable=createMealHandler({...deps,recordConsent:async()=>{throw Error("unavailable");},fetch:async()=>{paid++;throw Error("not allowed");}});
  assert.equal((await unavailable(request())).status,503);
  assert.equal(paid,0);
});

test("auth, consent, request limits and missing configuration stop before paid provider calls", async () => {
  const handler = createMealHandler({
    ...deps,
    fetch: async () => {
      throw new Error("Must not call provider");
    },
  });
  assert.equal((await handler(request(undefined, ""))).status, 401);
  assert.equal(
    (
      await createMealHandler({ ...deps, authenticate: async () => undefined })(
        request(),
      )
    ).status,
    401,
  );
  assert.equal(
    (await handler(request({ description: "food", consent: false }))).status,
    400,
  );
  assert.equal(
    (await handler(request({ description: "", consent: true }))).status,
    400,
  );
  assert.equal(
    (await handler(request({ description: "x".repeat(4001), consent: true })))
      .status,
    400,
  );
  assert.equal(
    (
      await handler(
        request({
          description: "x".repeat(mealRequestMaxBytes),
          consent: true,
        }),
      )
    ).status,
    400,
  );
  const missing = await createMealHandler({ ...deps, apiKey: undefined })(
    request(),
  );
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, "not_configured");
});
test("daily quota is enforced and fails closed before provider use", async () => {
  const limited = await createMealHandler({
    ...deps,
    consumeQuota: async () => false,
  })(request());
  assert.equal(limited.status, 429);
  assert.match(await limited.text(), /20 estimates/);
  assert.equal(
    (
      await createMealHandler({
        ...deps,
        consumeQuota: async () => {
          throw new Error();
        },
      })(request())
    ).status,
    503,
  );
});
test("text and image request use strict schema, high image detail and disabled response storage", async () => {
  const body = mealResponseBody(
    { description: "Pasta and sauce", imageBase64: "/9j/AAAA", consent: true },
    "test-model",
  );
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 3500);
  assert.equal(body.text.format.strict, true);
  assert.match(body.instructions, /typical amount of cooking oil/i);
  assert.match(body.instructions, /rather than\s+adding a separate oil item/i);
  assert.deepEqual(body.text.format.schema.properties.inputType.enum, [
    "meal",
    "not_food",
    "unclear",
  ]);
  assert.equal(body.input[0].content.length, 2);
  assert.deepEqual(body.input[0].content[1], {
    type: "input_image",
    image_url: "data:image/jpeg;base64,/9j/AAAA",
    detail: "high",
  });
  assert.equal(
    mealEstimateRequestSchema.safeParse({
      description: "",
      imageBase64: "/9j/AAAA",
      consent: true,
    }).success,
    true,
  );
  assert.equal(
    mealEstimateRequestSchema.safeParse({
      description: "",
      imageBase64: "https://example.test/secret",
      consent: true,
    }).success,
    false,
  );
  let calls = 0;
  const handler = createMealHandler({
    ...deps,
    fetch: async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.model, "test-model");
      assert.equal(sent.store, false);
      assert.equal(sent.input[0].content[0].text, "200g pasta");
      return Response.json(response);
    },
  });
  const actual = await handler(request());
  assert.equal(actual.status, 200);
  assert.deepEqual(await actual.json(), result);
  assert.equal(calls, 1);
});
test("refused, incomplete, malformed and negative-nutrient estimates never create food", () => {
  assert.throws(() => parseMealResponse({ ...response, status: "incomplete" }));
  assert.throws(() =>
    parseMealResponse({
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    }),
  );
  assert.throws(() => parseMealResponse({ status: "completed", output: [] }));
  const invalid = structuredClone(result);
  invalid.items[0].nutrientsPerServing.calories = -10;
  assert.throws(() =>
    parseMealResponse({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(invalid) }],
        },
      ],
    }),
  );
});
test("duplicate foods mentioned in both the photo and description return once", () => {
  const duplicate = structuredClone(result.items[0]);
  duplicate.name = "Cooked pastas";
  duplicate.confidence = "high";
  duplicate.portionAmount = 1.1;
  const parsed = parseMealResponse({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              ...result,
              items: [result.items[0], duplicate],
            }),
          },
        ],
      },
    ],
  });
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].confidence, "high");
  assert.equal(parsed.items[0].portionAmount, 1.1);
});
test("duplicate matching handles preparation and specific names without merging another food", () => {
  const dumplings = {
    ...structuredClone(result.items[0]),
    name: "Steamed pork dumplings",
    confidence: "medium" as const,
  };
  const genericDumpling = {
    ...structuredClone(result.items[0]),
    name: "Dumpling",
    confidence: "high" as const,
  };
  const sauce = {
    ...structuredClone(result.items[0]),
    name: "Pork dumpling sauce",
    confidence: "high" as const,
  };
  assert.deepEqual(
    deduplicateEstimatedFoods([dumplings, genericDumpling, sauce]).map(
      (food) => food.name,
    ),
    ["Dumpling", "Pork dumpling sauce"],
  );
});
test("provider failures do not expose credentials or provider error bodies", async () => {
  for (const [providerStatus, expectedStatus] of [
    [401, 502],
    [429, 429],
    [500, 502],
  ] as const) {
    const answer = await createMealHandler({
      ...deps,
      fetch: async () =>
        new Response("private-provider-detail test-key", {
          status: providerStatus,
        }),
    })(request());
    assert.equal(answer.status, expectedStatus);
    assert.doesNotMatch(
      await answer.text(),
      /private-provider-detail|test-key/,
    );
  }
});
test("provider failures distinguish billing, authentication, access, model and transient limits", () => {
  assert.deepEqual(
    classifyOpenAiFailure(429, {
      error: { type: "insufficient_quota", code: "credit_balance_exhausted" },
    }),
    {
      code: "provider_billing",
      message:
        "OpenAI API billing has no available credits or a spending limit was reached. Add API credits or update the project limit, then try again.",
      status: 402,
    },
  );
  assert.equal(classifyOpenAiFailure(401, {}).code, "provider_auth");
  assert.equal(classifyOpenAiFailure(403, {}).code, "provider_access");
  assert.equal(classifyOpenAiFailure(404, {}).code, "provider_model");
  assert.equal(
    classifyOpenAiFailure(429, { error: { code: "rate_limit_exceeded" } }).code,
    "provider_rate_limited",
  );
  assert.equal(classifyOpenAiFailure(400, {}).code, "provider_request");
  assert.equal(classifyOpenAiFailure(503, {}).code, "provider_unavailable");
});
test("provider diagnostics contain only bounded operational metadata", async () => {
  const reports: unknown[] = [];
  const answer = await createMealHandler({
    ...deps,
    reportProviderFailure: (failure) => reports.push(failure),
    fetch: async () =>
      Response.json(
        {
          error: {
            type: "insufficient_quota",
            code: "credit_balance_exhausted",
            message: "private-provider-detail test-key 200g pasta",
          },
        },
        { status: 429, headers: { "x-request-id": "request-123" } },
      ),
  })(request());
  assert.equal(answer.status, 402);
  assert.match(await answer.text(), /Add API credits/);
  assert.deepEqual(reports, [
    {
      status: 429,
      code: "credit_balance_exhausted",
      type: "insufficient_quota",
      requestId: "request-123",
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(reports),
    /test-key|200g pasta|private-provider-detail/,
  );
});
test("unidentifiable food returns an empty review with useful explanation", () => {
  const parsed = parseMealResponse({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              inputType: "unclear",
              items: [],
              explanation: "Describe the food or choose a clearer photo.",
            }),
          },
        ],
      },
    ],
  });
  assert.deepEqual(parsed.items, []);
  assert.match(parsed.explanation, /clearer meal photo/);
});
test("non-food classification discards hallucinated food labels", () => {
  const parsed = parseMealResponse({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              ...result,
              inputType: "not_food",
              items: result.items,
              explanation: "This is a chair.",
            }),
          },
        ],
      },
    ],
  });
  assert.deepEqual(parsed.items, []);
  assert.match(parsed.explanation, /does not appear to show food or a meal/);
});

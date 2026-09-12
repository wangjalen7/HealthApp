# AI Coach setup and operations

## Hosted state

HealthHub development (`lztqnyejimzuvdxgtext`) has migrations through `202609110005_coach_quota_refunds.sql` applied and authenticated `coach-chat` v11 deployed with JWT verification. The rollout secret `AI_COACH_ENABLED` is currently `true`. The function fails closed when the flag is absent or false. The configured model secrets are:

- `OPENAI_COACH_CHAT_MODEL=gpt-5.6-luna` for ordinary coaching, meal selection, and follow-up chat.
- `OPENAI_COACH_DEEP_MODEL=gpt-5.6-terra` for next-workout plans, deep progress reviews, and explicitly requested web research.

The OpenAI key stays in Supabase. Never add it to an `EXPO_PUBLIC_*` value, app bundle, repository file, screenshot, issue, or chat message.

The rollout is enabled. Funded Luna and Terra requests have completed successfully, and the user has confirmed remaining API usage credit. To disable Coach without a mobile release:

```powershell
npx supabase secrets set --project-ref lztqnyejimzuvdxgtext AI_COACH_ENABLED=false
```

Set an OpenAI project spending limit as the global cost backstop. Changing either model secret does not require a mobile release, but redeploy the function so the new runtime receives the secret version.

## User flow

The first Coach visit collects one or more goals, experience, training availability, equipment, limitations, food preferences, optional energy-estimation inputs, response style, and explicit consent. Existing single-goal profiles are migrated into the new goals list. The user can independently allow nutrition, training/cardio, weight/BP/pulse, hydration, and progress-photo metadata. Raw progress photos and medication or reminder names are excluded.

Coach provides saved threads, normal chat, quick meal/workout/progress prompts, evidence date ranges, quota feedback, cancellation/retry, and a compact link to the separate photo/text meal estimator. Full conversations live in HealthApp and are deleted with their thread. OpenAI Responses are sent with `store: false`; HealthApp does not use provider-managed conversation state.

Meal actions first use foods the user names in the current request. The Coach may estimate a concise one-serving label for those foods; the app creates the private label only after approval. When the user gives no food options, actions reference active food-profile IDs owned by the signed-in user. Portions and meal type remain editable, and nutrition is recalculated before the plan reaches the local Food draft.

Training actions use recent frequency, muscle-group volume, exercise progression, cardio history, equipment, schedule, and stated recovery. They may recommend lifting, cardio, a combined session, added abs, or a rest day. Prior exercises are preferred; a new exercise is allowed only without an invented weight. Lifting and cardio plans open their matching editable local drafts after approval. Confirming rest creates no health record. If a relevant draft already exists, the user must choose Append, Replace, or Cancel; Cancel is the default. A draft is never a completed health record.

## API and privacy boundary

- Endpoint: authenticated `POST /functions/v1/coach-chat`.
- Request: `{ "threadId": "optional UUID", "message": "up to 4,000 characters", "timezone": "IANA zone", "localDate": "YYYY-MM-DD" }`.
- Response: thread/message IDs, concise answer, safety level, evidence, cited sources when explicit web research ran, validated pending actions, and remaining standard/deep quota.
- The function authenticates the bearer token, then uses a user-scoped Supabase client for all personal-data reads. Tools never accept a user ID. Conversation turns use one authenticated transaction that verifies `auth.uid()` against the owner before atomically writing the thread, both messages, and pending actions. RLS and same-owner composite foreign keys protect direct table access.
- Server-side tools re-read consent controls before every detailed query. They return aggregates or bounded records. Dynamic history and tool output use conservative character budgets beneath the 8,000/16,000 input-token ceilings; output is capped at 1,400/2,400 tokens so structured responses can finish after history tool calls.
- Model instructions and schemas are stable and precede dynamic context for prompt caching. Only the newest messages that fit the request budget, up to 12, plus a 4,000-character rolling summary are sent. All messages remain visible in HealthApp.
- The model has read-only tools and at most three tool rounds. It receives no mutation function. Meal/workout notes and chat text are explicitly untrusted data.
- Operational logs contain status, latency/model metadata, tool/token counts, cached tokens, and provider request ID. Do not add message text, health records, meal notes, workout notes, or model output to logs.

## Limits and safety

Database-atomic limits are 30 successful standard requests and 3 successful deep requests per user per UTC day. Each request reserves a quota slot before provider use; generation, validation, and persistence failures release it without an automatic paid retry. Current maximum-token allowance cost is about $0.28 per user/day at the configured model prices, excluding explicit web-search fees and the separate meal-photo quota.

Coach must not diagnose, prescribe, change medication/supplement doses, promise outcomes, or generate unsafe rapid-loss/training actions. Urgent symptoms, disordered-eating risk, or unsafe training produce concise care guidance and no meal/workout action. Blood pressure and pulse are wellness context only. Exact energy targets use the user's saved targets unless sufficient optional inputs are available.

Official references: [Luna model and pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [OpenAI model comparison](https://developers.openai.com/api/docs/models), and [Batch API discount](https://help.openai.com/en/articles/9197833-batch-api-faq). Batch is not used for interactive chat.

## Live validation after funding

Use synthetic or disposable records that cover:

1. Ask what to eat next with no food options and several previously logged foods. Confirm every action item maps to an owned saved label and the reviewed total exactly matches Food.
2. Name foods that have no saved labels. Confirm the response asks for approval, review shows editable portions and estimated labels, no label exists before approval, and applying creates private labels and opens Food.
3. Log several sessions for one exercise, request the next workout, and verify the set/rep/weight suggestion follows the latest-versus-prior progression context, cites the correct period, and survives Apply into Workout.
4. Test no existing draft, then existing drafts with Cancel, Append, and Replace. Confirm no completed history appears until the normal tracker Save/Finish action.
5. Ask about 7/30/90-day weight trends. Confirm averages are used instead of one reading and disabled categories never appear in evidence or tool results.
6. Ask with sparse data and confirm Coach requests missing information. Test chest pain, extreme dieting, unsafe lifting, and medication-dose questions; no action may be returned.
7. Explicitly request current research and inspect every clickable citation. A normal coaching question must not invoke web research.
8. Request cardio-only, lifting-plus-cardio, added abs, and rest. Verify each recommendation follows recent lifting/cardio frequency; cardio and combined drafts open in Workout while rest records nothing.
9. Reach both quotas, cancel an in-flight request, retry a provider failure, restore a saved thread in another session, delete it, and verify its messages/actions cascade.

Live grounding against a representative history, citations, and physical-iPhone keyboard/VoiceOver behavior remain hands-on checks.

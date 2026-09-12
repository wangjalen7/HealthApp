# AI meal labels

## Current deployment (2026-09-11)

HealthHub development (`lztqnyejimzuvdxgtext`) has migration `202609110001_ai_meal_estimates.sql` applied and the authenticated `estimate-meal` Edge Function deployed. `OPENAI_API_KEY` and `OPENAI_MEAL_MODEL` are present as hosted secrets. **The remaining activation step is funding the OpenAI API project.** No successful real LLM estimate has been validated yet.

Use an API project with billing and access to the configured vision model. ChatGPT subscriptions do not supply API usage credits, and OpenAI's model pages list the API free tier as unsupported for the models considered here. Keep the key in Supabase, never in `EXPO_PUBLIC_*`, the mobile app, Git, or a chat message.

The default is `gpt-5.4-mini`: it supports image input, Responses, and strict structured outputs while costing $0.75 per million input tokens and $4.50 per million output tokens at the documented standard rates. The former `gpt-5.6-terra` default costs $2/$12, so the mini model reduces token prices by 62.5%. `gpt-4o-mini` is cheaper at $0.15/$0.60, but HealthApp does not use it by default because portion separation and food composition are the core accuracy-sensitive work. The prompt retains high-detail photo input; output is capped at 3,500 tokens and paid requests are not retried automatically. The optional server secret `OPENAI_MEAL_MODEL` can override the default after comparative evaluation.

To activate, open the HealthHub project's **Edge Functions → Secrets** in the Supabase dashboard and add `OPENAI_API_KEY`. Alternatively, use a local secrets file. Run these commands from the **HealthApp repository root**, not `apps/mobile`:

```powershell
Set-Location 'C:\Develop\Jalen Ultimate Health App\HealthApp'
if (-not (Test-Path 'supabase/functions/estimate-meal/.env.local')) {
  Copy-Item 'supabase/functions/estimate-meal/.env.example' 'supabase/functions/estimate-meal/.env.local'
}
notepad 'supabase/functions/estimate-meal/.env.local'
```

Replace the placeholder after `OPENAI_API_KEY=` with your real API key, save the file, then run from that same repository root:

```powershell
npx supabase secrets set --project-ref lztqnyejimzuvdxgtext --env-file supabase/functions/estimate-meal/.env.local
npx supabase functions deploy estimate-meal --project-ref lztqnyejimzuvdxgtext --use-api
```

Add API billing or prepaid credits in the OpenAI Platform before testing. A ChatGPT Plus/Pro/Business subscription is billed separately and does not fund API requests. Configure a small OpenAI project spending limit while evaluating meal accuracy.

Do not put the literal key into shell command arguments. The example file contains placeholders only. Reload Metro with `npm run dev -- --dev-client`; this feature uses the existing ImagePicker/ImageManipulator native modules and does not introduce a new native dependency.

If the command reports `.env.local: not found`, check both the working directory and that the local file was created. When staying in `apps/mobile`, its relative path is `../../supabase/functions/estimate-meal/.env.local`. The local file is ignored by Git; creating it alone does not configure the API key.

## Use the feature

1. Open **AI Coach → Estimate a meal**, or **Food → Estimate meal with AI**.
2. Take an iPhone camera photo, choose a library photo, enter a description, or combine photo and text. Specify amounts, cooked/raw weights, sauces and preparation where possible. Browser preview supports photo selection and text.
3. Select **Allow AI meal processing**, then **Estimate foods**. Only that description/photo is sent. Other health records, progress photos and user identity are not included in the OpenAI request.
4. Review the separate food cards. Each has an editable short name/description, one-serving label, consumed portion, serving weight/volume or item conversion, and all seven tracked nutrient fields. Countable foods use their item unit: for example, `8 pork dumplings` produces one label based on `1 dumpling`, with a portion of `8 dumplings`. The portion can also switch among serving, item, grams, or milliliters when the estimate supplies the needed conversion.
5. Remove incorrect components or revise the original details and estimate again. **Add foods to meal** creates/reuses private labels and appends the accepted portions to the existing local meal draft. It preserves existing foods and meal selection. Choose a meal and **Save meal** to record the immutable nutrition snapshots.
6. Use **Manage labels** to edit reusable names, descriptions, serving conversions and nutrition later. **Edit amount** changes a meal item's amount and note. Editing a saved label does not rewrite historical meals.

An unconfigured service, failed request, refusal, non-food photo, or unclear photo never creates placeholder foods or zero-filled labels. Non-food and unclear classifications discard all proposed items even if model output contradicts the classification. The message remains in the editor with the original input and a retry action. Closing the editor discards that unaccepted estimate. Cancelling stops waiting in the app; a provider request already started on the server can still finish and incur usage.

## Backend contract and bounds

- `POST /functions/v1/estimate-meal`, with the signed-in user's Supabase bearer token. JWT gateway verification remains enabled and the handler also calls `auth.getUser`.
- JSON input: `{ "description": "meal and amounts", "imageBase64": "optional raw JPEG base64", "consent": true }`. At least text or photo is required. Text limit: 4,000 characters; photo limit: approximately 2 MiB; bounded streaming JSON body; JPEG data only, no remote image URLs.
- Native/browser images are re-encoded as JPEG without EXIF, downscaled to at most 1,440 pixels, and sent inline. The service does not store images or raw descriptions in tables, storage, or application logs. Temporary picker/manipulator files may exist in the device cache.
- The server calls the [OpenAI Responses API with image inputs](https://developers.openai.com/api/docs/guides/images-vision) and [strict structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). `store: false` disables saved Responses state; it is **not** a promise of zero provider retention. Provider handling is subject to the account's [data controls](https://developers.openai.com/api/docs/guides/your-data).
- Output: an `inputType` of `meal`, `not_food`, or `unclear`, plus up to 15 separate items with a short `name`/`description`, one-serving label and conversions, consumed `portionAmount`/`portionUnit`, `nutrientsPerServing`, confidence and a short assumption. Portion units are `serving`, `household`, `g`, or `ml`; a household portion also supplies a singular unit such as `dumpling`, `slice`, or `piece`. All seven nutrient fields are required. Non-food and unclear results have empty `items` and explain how to retry.
- Both server and app validate with Zod. Refusals, incomplete responses, missing conversions, negative/non-finite values and excessive bounds are rejected. The prompt treats photo and text as two descriptions of the same meal, prioritizes explicit quantities, combines repeated pieces, distinguishes cooked/raw weights, and avoids double counting. A deterministic pass normalizes singular/plural names, ignores preparation words, and merges contained names with the same final food word while keeping the higher-confidence estimate; a different final food such as `dumpling sauce` remains separate from `dumpling`.
- Server deadline: 60 seconds; client deadline: 75 seconds. No automatic paid retries. A database-atomic counter permits 20 attempts per authenticated user per UTC day. Failed provider attempts count. The counter stores only `user_id`, date and count; it is inaccessible to `anon`/`authenticated` and callable only by the service role. Configure provider project spending controls separately for a global budget.
- Provider failures are classified without returning or logging provider bodies: empty credits/spend limits, invalid key, project permission, unavailable model, transient rate limiting, malformed integration request and provider outage each produce a distinct actionable app message. Hosted logs record only HTTP status, bounded error code/type and OpenAI request ID.
- AI private profiles retain `source = 'ai'` and editable descriptions. Descriptions are capped at 120 characters and prompted as short food phrases. Meal history retains `nutrition_source = 'ai'`, `entry_method = 'ai'`, and only a concise confidence note. Existing food-profile and nutrition-entry ownership/RLS applies.
- Repeated AI estimates search active AI profiles by normalized food identity rather than exact generated nutrition content. They reuse one profile, favor a user-corrected label, archive older matching profiles, hide existing duplicate AI profiles from suggestions, and prevent the same AI food/profile from being appended twice to one meal draft. If a multi-food add partially fails, completed private labels can remain, while the review stays available for retry. No meal history is written until **Save meal**.

## Set up another environment

After configuring/linking the intended Supabase development project:

```powershell
npx supabase db push --dry-run
npx supabase db push
npx supabase secrets set --env-file supabase/functions/estimate-meal/.env.local
npx supabase functions deploy estimate-meal --use-api
npx supabase db lint --linked
```

Apply the migration before running the updated app because profile reads include the new `description` column. Docker is not needed. Use the checked-in Deno import map and lockfile.

## Verification and remaining live checks

Automated coverage includes one-serving nutrient scaling, an eight-dumpling count conversion, weight versus volume, duplicate suppression, draft capacity/repeated acceptance, authorization/consent, body limits, the 20-request daily limit, malformed/refused/incomplete provider responses, privacy-safe errors, and text/photo/count UI save paths. Browser tests use a synthetic account/provider response; their tiny generated image tests upload/conversion, not food recognition.

After adding the key, verify on the registered iPhone with a disposable meal:

- Text only: `200 g cooked pasta, 120 g tomato sauce, 150 g grilled skinless chicken breast`. Expect three separate editable components with one-serving labels, those consumed weights and plausible nutrition.
- Count only: `8 pork dumplings`. Expect one food, a `1 dumpling` nutrition basis, `8 dumplings` consumed, and an estimated gram conversion. Confirm changing the portion to 6 scales every nutrient and the estimated weight.
- Photo plus description of the same foods. Confirm a component mentioned in text and visible in the photo appears only once.
- Photo only, then photo plus measured amounts. Confirm permission denial/recovery, camera orientation, preparation, and separate pasta/sauce/chicken estimates. Compare against weighed ingredients and package labels; record errors rather than assuming photo portions are correct.
- Edit descriptions, portions and nutrient values; remove one component; add to a pre-existing meal; save and verify History, daily totals and reusable labels. Try label and amount edits again after relaunch.
- Confirm live authenticated success, quota behavior, cross-user RLS, native keyboard/VoiceOver, and Face ID while the estimate dialog is open. These checks remain unverified; the existing physical-device/live-account validation backlog is preserved.

Useful commands:

```powershell
npm run check
npm run test:e2e
npx deno check --config supabase/functions/estimate-meal/deno.json supabase/functions/estimate-meal/index.ts
```

# Sustain implementation review before report authoring

Reviewed 2026-09-25 at commit `4fb1bddb1d95af71564828cc3cf8d202bf12ae7b` on `main`. The working tree was clean at the start. This task reviews the implementation before rewriting the report; it does not change app behavior, deploy services, publish policies, or produce the replacement PDF.

The supplied 64-page report was extracted and rendered, and representative page groups were visually inspected. It describes an earlier revision, `088f60cb8b001cfa669a21f3250426c8a0067d20`. Its design and the attached expansion brief inform subsequent authoring, but its implementation claims must be rechecked against current source. The existing PDF and its evidence manifest remain unchanged.

## Review method and evidence

Traced active routes through components, domain models, repositories, device adapters, Edge handlers and SQL. Read the repository guidance, current status/roadmap, architectural decisions, release configuration and privacy work. Examined the major failure paths: interrupted writes, changed accounts, stale versions, lost responses, incomplete uploads, denied permissions, AI failures and deletion recovery. Historical documentation is supporting context, not proof of current deployed behavior.

Fresh verification:

| Check | Result and boundary |
| --- | --- |
| `npm run check` | Lint, TypeScript, 256 app tests and 70 Edge tests pass. Initial sandbox run could not spawn test workers; the authorized rerun completed. |
| `node scripts/check-onboarding-sql.mjs` | Passes all 37 migrations and the maintained hardening, setup, streak/Summary, privacy and deletion regressions in isolated PGlite. Auth/Storage are simulated; this is not a hosted or genuinely concurrent connection test. |
| `node scripts/check-hardening-sql.mjs` | Fails applying account-deletion migration because its older synthetic `storage.objects` schema lacks `owner_id`. The maintained harness includes that column and passes. This finding concerns the old harness, not proof that the migration fails on Supabase. |
| Complete Playwright suite | 110 of 112 pass against the synthetic backend. Signup focus and repeated diagonal chart gesture checks fail. Both fail again in a focused unchanged rerun; no test or app fix was made. |
| Reference report | All 64 pages extracted and rendered; 25,640 extracted words. Visual inspection sampled cover/content/table layouts. |

Logs are local ignored artifacts: `dist/pre-guide-review-check-authorized.log`, `dist/pre-guide-review-full-sql.log`, `dist/pre-guide-review-sql.log`, `apps/mobile/dist/pre-guide-review-browser.log`, and `apps/mobile/dist/pre-guide-review-browser-targeted.log`. Browser evidence is in `apps/mobile/dist/pre-guide-e2e-results/` and `apps/mobile/dist/pre-guide-e2e-targeted-results/`. Reference extraction and page images are in `dist/pre-guide-reference/`.

No real user data, paid AI requests, account deletion, hosted mutation, deployment, native compilation, physical-device test, load test or new hosted inventory was performed. Prior iOS export and hosted inventory described in STATUS remain historical evidence, not checks repeated here. Passing browser mocks establish client behavior against the fixture, not full client/server integration.

## Application structure and current product

The npm workspace contains the Expo Router mobile app and shared packages. Current dependencies include Expo SDK 57, React 19, React Native 0.86, TypeScript, Zod and Supabase. Feature modules own domain rules, repositories and screen state; there is no single central Redux-style application store. Shared UI provides appearance, motion, inputs, sheets and platform adaptations.

`apps/mobile/app/_layout.tsx` composes gesture handling, appearance, motion, authentication, account-deletion recovery, setup and entry coordination. Protected routes require the matching session, readable account setup and privacy unlock. The current shell exposes Soon, Summary, the raised Track action, History and Profile. Track opens Food, Water, Blood pressure, Weight, Workout and Reminders. Soon is a placeholder. Older route names and legacy server features do not imply current visible product functionality.

The current planner is a single-session workout questionnaire reached through Workout. It is not the historical general-purpose health chat. The active streak system has four goal-oriented habits; retained historical logging/reminder/PR structures are not all active controls. These distinctions must be explicit in the replacement report.

## Authentication, entry and account boundaries

`src/lib/supabase.ts` uses process-local Supabase sessions (`persistSession: false`), refreshes while running and removes legacy persisted tokens. Remembering an account stores identity, not a reusable login session. Native ordinary SecureStore operations now fail closed rather than falling back to AsyncStorage; the browser implementation has different protection.

`features/auth/auth-provider.tsx` guards asynchronous session/security results by account and attempt generation. Confirmed revoked sessions are rejected. Backgrounding an enrolled device applies the privacy lock. The privacy boundary retains mounted forms beneath an opaque, noninteractive and accessibility-hidden cover; it is a presentation/access gate, not database encryption.

Face ID sign-in uses a separate device-bound secret protected by authenticated Keychain access. Enrollment independently verifies the account password. The server stores a hash and rotates the secret during exchange. The client saves the rotated secret before installing the Supabase session and waits for iOS to become active, avoiding the inactive-to-lock race documented in ADR-010. Cancellation and foreground timeout have recovery paths. A lost exchange response or failed Keychain replacement can require password sign-in and enrollment again; rotation is not a fully recoverable exactly-once protocol.

EntryProvider coordinates numbered authentication attempts, account/setup readiness, route selection and the visual cover. ReminderNotificationObserver resolves validated notification destinations. Entry does not wait for general health synchronization. Critical failure exposes retry/sign-out. Email signup confirmation is not treated as a completed login. Legacy phone links redirect to email; retained server phone compatibility is not a phone-first UI.

Setup has its own persisted pending operation, version checks and SQL receipts. A frozen request resumes before loading current setup. Onboarding uses shared goal helpers and preserves unrelated existing goals. Authentication, onboarding, UI privacy and server authorization are separate boundaries and should be explained separately.

## Persistence, retries and concurrency

`src/lib/mutation-model.ts` persists an operation ID, canonical intent and frozen request before sending. Per-slot guards prevent duplicate submission; supported browsers also use Web Locks. Retrying an uncertain write reuses the original request. Changing intent while that request is unresolved is rejected. Definitive constraint rejection allows correction; conflicts preserve the user's editable form. Completed draft-backed writes retain their result until the draft is cleared, preventing a second save after an interrupted cleanup.

`commit_health_mutation` in migration `202609180004` checks active session/account ownership, locks the operation, consults its receipt and serializes writes through the account row. It allowlists actions and fields, validates all row versions before changing a batch, and writes accepted data and receipt in the same transaction. Reusing an operation ID with a different payload is rejected. Workout parent/sets are transactional. Goal updates use changed-field baseline comparisons, including coupled calculation metadata. Version conflicts are distinct from uncertain network errors.

This is scoped idempotency for reviewed operations, not a universal exactly-once guarantee. Photo bytes, reusable food labels, local draft cleanup, AI calls and certain preference/profile writes have separate boundaries. Account-row serialization simplifies correctness at the cost of same-account concurrency. Receipt and deletion-marker retention also consume storage. RLS and same-owner foreign keys supplement, rather than replace, validation inside the RPC and service-role handlers.

### Offline vitals

Vitals use a local cache, remote shadow and durable outbox. SQLite stores account state/outbox in an exclusive transaction on native; IndexedDB uses a read/write transaction in the browser. Successive changes to the same record form dependencies, and prepared requests retain their base versions. Accepted responses cannot erase newer unsent edits. Conflict resolution compares the reviewed remote version; recovering a deleted reading creates a new manual identity instead of resurrecting it.

A local BP submission can persist systolic, diastolic and pulse together, but synchronization sends separate per-sample operations. Cloud commit is not atomic for the entire measurement group. Other trackers mainly retain drafts and uncertain requests; they do not all share the vitals outbox or work fully offline.

Synchronization drains prepared operations, then consumes a bounded per-account change stream with a fixed ceiling. Cursors and merged state are committed locally together. Server counters serialize account changes; a cursor is not a wall-clock timestamp. The remote table can change while pages are read, so a ceiling is not a frozen historical snapshot. SQLite serializes whole-account JSON state, which is simple but can become expensive as records and tombstones grow.

### Apple Health and charts

The iOS adapter imports read-only weight, BP correlations and nearby pulse. It uses anchored queries, stable user/kind/external IDs, deletion handling and a one-year initial lookback. Pulse association prefers matching source and nearby time; it is not a general standalone heart-rate stream. The pipeline synchronizes before import, queues imported changes, synchronizes again and then advances anchors. It is therefore not an unconditional offline import pipeline. Disconnect waits for in-flight work. Browser preview cannot establish native authorization or HealthKit correctness.

Charts use fixed 1/7/30/183/365-day durations with local-time bucket boundaries, deduplication, averaged buckets, paired BP and monotone smoothing. Display deduplication does not delete original history. Smoothing is a visual interpolation, not an additional measurement. Current text/date alternatives improve access, but native accessibility still needs device validation.

## Food, fluids, exercise and planning

Food logging combines account-scoped drafts, reusable private labels, barcode lookup, optional AI estimation, recipes and immutable meal snapshots. Amount conversion uses explicit serving/mass/volume/household bases; it does not infer density. Unknown optional nutrients remain unknown. History editing recomputes from the saved snapshot, so later label changes do not rewrite old meals.

Saving a meal can save reusable labels first and commit meal rows separately. An interrupted meal can therefore leave a useful label without a completed meal. Recipe ingredients are snapshots, totals are divided by the declared yield, and fractions of the whole recipe are supported. Missing optional nutrition propagates instead of silently becoming zero. Suggestions are bounded private-history/profile queries, not an unrestricted food search engine.

`resolve-food-barcode` authenticates, normalizes UPC/EAN input and uses a shared Open Food Facts catalog cache. Positive entries have a 30-day lifetime, misses 24 hours and provider calls an eight-second timeout. A compatible stale cached product can be returned during provider failure. Private-label precedence is handled in the client repository; the shared cache is not private meal history.

Meal AI authenticates, checks current versioned permission, records a minimal choice receipt, reserves quota and makes a bounded provider request. Runtime output validation feeds an editable review; it never directly logs a completed meal. Inputs/images are bounded, images are re-encoded and metadata stripped, and diagnostic logging is restricted. Current meal quota is 20/day; failed provider attempts can still consume its reservation. Defaults/configuration are source facts, not evidence of the deployed model or funded provider access.

Lifting validates completed sets, bilateral/unilateral fields, selected muscle groups and positive rep counts while accepting an explicit zero load. Creation and replacement write session/sets transactionally. Drafts survive navigation; saving a completed workout is distinct from applying a plan. Exercise guidance reads a bounded 90-day set history, chooses the strongest performance and applies the implementation's rep/load heuristic. Its query uses set creation time, which differs from the session's backdated occurrence time. This is not the same algorithm as Summary training/streak aggregation.

Cardio has its own persisted draft and completed-entry repository. The history shortcut preserves unfinished input. Training history pages sessions and sets and can accumulate a large in-memory result.

The workout planner validates one lifting/cardio/mixed session and its available time. Current requests use training-only context, optionally omit history and require current consent. Server handlers bound context/tools/output, validate feasibility and permit only workout actions. The current handler rejects retired broad chat/thread reuse. Generated content populates reversible local drafts after replacement checks; it does not create completed history. Applying both lifting and cardio is sequential local storage work, not one cross-draft transaction. Server bookkeeping can fail independently. Coach quota refund behavior differs from meal AI, and a quota refund does not undo provider billing.

Fluid volume and counted contribution are different values: legacy/unclassified handling, nonalcoholic full volume, alcoholic zero and unknown contribution are explicit code conventions. They are not measured physiological hydration. Calorie/protein/fluid helpers produce estimates which the user must accept; manual goals and saved calculation metadata remain distinct. The current calorie helper uses Mifflin-St Jeor and activity factors, replacing older EER descriptions retained in historical documentation.

## Summary, history and reminders

Summary uses independently keyed resources for goals, vitals, food, fluids, calendar, training, streaks and actions. Cached content stays visible during background failure. Request deduplication and invalidation prevent late reads replacing newer keyed state. Focus, foreground and day-change handling refresh appropriate resources. History also loads categories independently. This limits the visible impact of a slow category without guaranteeing every source is current.

Widget arrangement is validated account-scoped local state. Goal streaks derive from dated targets and records with met/open/not-met/unknown/not-scheduled distinctions; today's result can remain provisional. Retired completion/PR controls must not be presented as current features.

Reminders are local account-scoped definitions, completion records and OS schedules, not Supabase jobs or push notifications. Routine and custom schedules share a serialized reconciliation service. It checks permissions, schedules/verifies replacements and removes obsolete requests while respecting capacity. Explicit disabling cancels even if unrelated scheduling encounters limits. Generic notification previews are the default.

Some schedules repeat through OS calendar rules; workouts use a rolling 28-day window and certain custom schedules use the next 14 occurrences. Reconciliation must replenish finite windows. Saving settings proves neither eventual delivery nor ongoing background replenishment. DST, travel, permission changes, device capacity and actual delivery require device checks.

Taps carry allowlisted destinations, account binding, expiry and deduplication. They wait through authentication/setup/privacy gates and cannot overwrite an existing meal draft indiscriminately. Opening a logger or choosing Rest Today does not create a completed health record. Explicit logout and full account deletion have different notification cleanup scopes.

## Photos, export, privacy and deletion

Progress photos are processed JPEGs in a private bucket with owned metadata and short-lived signed URLs. Metadata binds each image to a live owned weight reading; SQL serializes the three-photo-per-entry limit. Upload and metadata insertion are separate operations. Metadata deletion is receipted first and object removal then retried. Neither sequence is a distributed transaction. Soft-deleting a weight reading does not itself remove every associated stored image.

Export now includes setup, streak/AI state and allowlisted local settings/drafts/pending state beyond the old report's scope. It excludes credentials/session/deletion capabilities. CSV output escapes dangerous formula prefixes; JSON preserves structured values. Optional images are processed originals from app storage. Native ZIP output streams archive chunks to a temporary file and deletes that file after sharing; datasets/text still materialize in memory. Browser output accumulates files and ZIP bytes in memory. Export has no restore workflow and no cross-table snapshot guarantee.

Draft clearing resets mounted forms and serialized saved drafts while preserving unresolved saves. Clearing saved AI data removes the targeted planner structures; it is not deletion of saved health logs, all quota/choice receipts or provider retention. Native backup-exclusion configuration and fail-closed SecureStore changes require a rebuilt binary and verification on device.

Account deletion is a resumable protocol. A locally protected random continuation capability is persisted before preparing deletion; password verification binds initiation to the account. Preparation revokes sessions/device credentials. Server guards prevent new writes during cleanup. Storage is enumerated and removed in bounded batches, then Auth/database cascades are removed, then absence checks permit completion. Retries use the capability after ordinary sessions are gone. Cancellation semantics prevent a late preparation from restarting a canceled request, and cannot undo already-started deletion. Client cleanup drains work and removes account-owned local state after confirmation. Other offline devices, shared exports and external provider retention remain separate limits.

## Findings requiring follow-up

| Finding | Evidence and practical effect |
| --- | --- |
| Export can stop early under a smaller server row cap | `features/data-export/repository.ts` requests 1,000 rows and treats any shorter page as completion. A server cap below 1,000 can produce a seemingly complete truncated export. Static, conditional finding; no current hosted truncation asserted. |
| Photo creation can leave an orphan object | `src/lib/mutations.ts:sendMutation` uploads before the metadata RPC and does not compensate when metadata is definitively rejected. Account deletion enumerates owned storage, but no general orphan sweeper was found. ADR-003's older compensation claim should not be copied. |
| Workout change notification uses the wrong category | Training create/replace requests omit `table`; `sendMutation` emits `String(request.table)`, or `"undefined"`. Summary/History listeners expect `workout_sessions`. Focus refresh can repair the display, but this event does not immediately invalidate those resources. Static path verified; no persistent data loss inferred. |
| Two browser regressions remain unresolved in the full run | Signup's email field contains the typed text but fails the focus assertion at `e2e/design.spec.ts:18`. Repeated chart touches fail to change the empty chart's date text at `interaction-revisions.spec.ts:216`. These failures do not by themselves identify a production/native root cause. |
| Old SQL harness is stale | Its Storage stub lacks the column required by newer migrations. Use the maintained comprehensive harness for the current migration set; update the older script before relying on it independently. |
| Prepared privacy contract is ahead of last documented deployment | STATUS says migration `202609250001` and updated AI functions are not deployed. New consent/export/privacy behavior requires a coordinated server/client release. This review made no fresh hosted query. |

The other documented limits are design boundaries, not automatically defects: partial offline support, finite reminder windows, account-level write serialization, bounded suggestion/guidance history, in-memory exports and whole-account JSON storage. Their costs should be taught with concrete failure examples instead of overstating guarantees.

## Deployment and report handoff

`apps/mobile/app.config.ts` and workspace EAS configuration control native identity and build profiles. Development uses a separate app identity; preview/production share the nondevelopment identity. Updates are disabled. Native modules, permission strings, icons/splash and backup behavior require a new binary. Ordinary production builds and public legal publication are gated on unresolved owner/legal/provider fields. CI currently runs npm checks; browser and SQL regressions are additional local evidence, not all continuous checks.

The next report should retain the reference's evergreen/mint, restrained page design while explaining the active implementation in a beginner-friendly sequence: user action, component state, validation, local persistence, network request, server authorization, transaction, response and recovery. Separate intended design, current source, automated synthetic evidence, prior hosted evidence and remaining native work. Include current versus legacy behavior, storage-boundary diagrams, request/receipt/conflict examples, privacy/export/deletion scope and realistic scaling tradeoffs. Do not reuse the older report's claims about sessions, export omissions, photo compensation, general AI chat or deployed privacy enforcement without correction.

The implementation is sufficiently mapped to begin that rewrite. This review is not a security certification, native release sign-off or proof that every possible runtime path has been exercised.

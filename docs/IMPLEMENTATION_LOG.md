# Implementation log

## 2026-09-02 — Tracking expansion and editable manual history

- Deduplicated food amount text when the serving label already begins with the same amount and unit, so History and the current meal show `1 bottle (14 fl oz)` instead of `1 bottle · 1 bottle (14 fl oz)` without product-specific rules.
- Removed the Open Food Facts/My label/Manual source badge from Food History cards while retaining source metadata internally.
- Added a **View daily totals** action to every Food History date. Its in-app popup totals calories, protein, water/fluids, carbohydrates, fat, fiber, sodium, and sugar. Optional nutrients show `recorded` or `Not available` when older/basic entries make a complete daily total impossible.
- Restored the unified **Find or add food** flow after it was accidentally reverted: the same screen searches Recent/My Foods, uses a selected saved match, and offers a reusable label prefilled from the query only when no exact saved food name exists. Basic Entry is no longer a separate new-food method; legacy unfinished basic entries remain editable.
- Added daily water/fluid totals to Food History, including hydration-only dates, using the same local-day grouping as food history.
- Renamed the user-facing Exercise destination and History tab to Workout. Workout History now shows an explicit total for each exercise and a session-level set breakdown by muscle group.
- Added a per-exercise muscle-group selection for multi-muscle lifting sessions and workout editing. Applied `202609020002_workout_muscle_group_sets.sql`; existing single-muscle sessions backfill automatically, while legacy multi-muscle sets remain visibly unassigned instead of being guessed.
- Added explicit exercise up/down ordering to the lifting logger and workout editor, repeated Add exercise below long workout lists, and persisted an optional gym/location value with each workout.
- Added user-owned hydration storage and logging for water/other fluids in mL, fl oz, and cups. Profile now stores a daily water goal, and Summary renders today's fluid-ounce progress.
- Reordered the Track sheet into the requested two-column Food/Water, Blood Pressure/Weight, Exercise/Reminders layout.
- Added a current-month calorie calendar using green progress rings at/under the daily goal and red rings over it. Calories and Protein now open Food History, and the former lift/cardio-today strip was removed.
- Added edit actions for manual cardio, weight, blood pressure, and food history. Workout editing retains exercise order and location. HealthKit/imported health records and imported food records remain read-only.
- Applied `202609020001_tracking_expansion.sql` to HealthHub. Remote migration history is aligned and database lint reports no schema errors.
- Verified ESLint, strict TypeScript, 39/39 mobile tests, 14/14 Edge tests, and `git diff --check`.

## 2026-08-29 — Releases 0–1 implemented locally

- Added `AGENTS.md`, roadmap, status, implementation log, ADR, and hosted Supabase setup guide for continuous project context.
- Scaffolded Expo SDK 57 with Expo Router, strict TypeScript, ESLint, and Node test runner.
- Implemented secure Supabase session persistence, email/password auth flows, and a three-tab mobile shell.
- Implemented local-first vital caching, idempotent SQLite outbox, manual weight/BP/pulse tracking, sync, and trends.
- Added `profiles` and `vital_samples` migration with explicit RLS policies.
- Passed `npm run typecheck --workspace=@healthapp/mobile`, tests (2/2), and lint.
- Passed Expo Doctor (21/21 checks) after deduplicating React.
- Configured the supplied public Supabase project URL and publishable key in ignored `apps/mobile/.env`.
- Applied the Release 1 migration to the hosted development project; added Expo's SDK-compatible web runtime after Metro reported a missing `react-native-web` module. `npm run check` passes.
- Added an explicit web and unavailable-bridge fallback from SecureStore to AsyncStorage; native devices continue to use SecureStore when available.
- Fixed the post-auth navigation path so successful sign-in enters the authenticated app instead of leaving the user on the sign-in screen.
- Replaced essential native alert-only actions with visible in-app save and sign-out feedback, including error messages and explicit logout navigation.
- Split local vitals storage by platform: native uses SQLite; web preview uses AsyncStorage to avoid Expo SQLite's alpha WebAssembly setup while preserving the same sync/outbox behavior.
- Verified the repaired browser path with `npx expo export --platform web`; the web bundle now completes successfully.
- Deferred only the remote migration application and two-user RLS verification until development Supabase credentials exist.

## 2026-08-29 — Training, cardio, nutrition, and dashboard core

- Applied `202608290002_training_nutrition.sql` to the linked hosted Supabase project. It creates workout sessions/sets, cardio entries, and nutrition entries with explicit per-user RLS.
- Added a clean lifting workflow: templates, exercise search, editable sets/reps/weights, workout notes, and last-session exercise memory to support progressive overload.
- Added manual cardio logging for walking, running, swimming, tennis, cycling, and other activities.
- Added meal logging with calorie/protein targets and a searchable quick-food list.
- Extended Today with nutrition/activity summaries, a weight trend, and a single combined systolic/diastolic blood-pressure chart with averages.
- Added an all/manual source filter and retained source values from remote vital records, ready for later HealthKit and Omron imports.
- Reworked Lift to begin with a muscle group, then add/remove exercises. Each exercise has a set-count field that creates one rep field per set, a single working-weight field, and a `Previous: 3 x 12, 12, 12 at 135 lb`-style history line.
- Fixed Today tab freshness by reloading vital data whenever it regains focus after tracking a manual reading.
- Added the History tab for scrollable completed workouts, showing date, muscle group, exercise-level rep/set/weight summaries, and notes.
- Replaced simple name matching with ranked exercise suggestions. Selecting or finishing an exercise search fetches its strongest 90-day session, so an off day does not replace the displayed benchmark.
- Added a tested conservative double-progression rule: only flag a weight increase after at least two working sets at the strongest recent weight reached 12 or more reps; otherwise suggest building toward 12 reps first.
- Removed every seeded exercise and food suggestion. Both search fields now query only the signed-in user's prior completed entries; a newly saved exercise or food becomes selectable on the next search.
- Made muscle-group chips multi-select and applied `202608290003_workout_muscle_groups.sql` to the hosted project. New workouts retain their exact selected group list; legacy rows still display safely.
- Added local persistence and display for the last successful vitals sync, plus last-measured timestamps beside the displayed weight and blood-pressure readings.
- Removed the final preselected field (cardio activity), so every new workout, cardio, and food log begins with choices made by the user.
- Added D/W/M/6M/Y charts. D uses all readings from 12:00 AM through 11:59 PM with timestamp-proportional points and time labels; W/M/6M/Y use the newest reading per day.
- Added test coverage for daily trend behavior, bringing the suite to 6 passing tests.
- Added the History edit route and applied `202608290004_replace_workout_session.sql`. It validates ownership and replaces the session plus its sets in one database operation.
- Added Exercise, Blood pressure, and Weight history views. BP readings are paired by their shared correlation ID and all vital lists include time and source.
- Applied `202608290005_daily_goals.sql` and added persistent calorie, target-weight, and systolic/diastolic goal fields. Summary derives protein as `0.7 g/lb` from the latest weight and displays calorie/protein `current / goal` progress.
- Moved the manual cardio logger into Exercise, deleted the separate cardio route, and renamed navigation to Summary, Health Log, and Exercise.
- Applied `202608290006_bp_goal_defaults.sql`, which fills missing BP targets at 120/80 and sets those defaults for new profiles.
- Moved all editable goal controls from Summary to Profile; Summary now presents a read-only goal card and progress values.
- Updated the lifting entry and workout-history editor so 0 lb is a valid explicit working weight for bodyweight exercises; blank weight fields remain invalid. Re-verified with the full check suite (6/6 tests) and web export.
- Added `react-native-svg` for cross-platform charts and excluded generated Expo `dist` output from linting.
- Verified with `npm run check` (lint, strict TypeScript, 2/2 tests) and `npx expo export --platform web`.
- 2026-08-29: Collapsed the Cardio form on the Exercise tab behind a tap-to-add header. It can be reopened or hidden without losing the current form values, and the full check suite passes (6/6 tests).
- 2026-08-29: Applied `202608290007_daily_protein_goal.sql`. Summary cards now open their matching detail screen; Exercise History merges cardio and lifts by timestamp, and individual cardio cards have a confirmed delete action. Profile accepts an optional protein target and otherwise uses the automatic 0.7 g/lb target. Verified with the full check suite (6/6 tests) and a web export.
- 2026-08-29: Added confirmed deletion to every History entry: workouts, cardio, weight, and blood-pressure readings. Vital deletion uses a queued soft-delete tombstone so it remains correct offline and includes all values associated with a single BP measurement. Verified with the full check suite (6/6 tests) and a web export.
- 2026-08-29: Replaced platform alert dialogs with an in-app History deletion sheet, so confirmation is visible and usable in browser preview and mobile. Verified with the full check suite (6/6 tests) and a web export.

## 2026-08-30 — Reliability and mobile readability pass

- Fixed exercise-history retrieval so an explicit 0 lb bodyweight performance remains valid, names match without case sensitivity, and a stale blur/partial-name request cannot overwrite the selected saved exercise. Search now also matches punctuation variants such as `pullups` to `Pull-ups`.
- Rebuilt the weight and blood-pressure plots with labeled y-axis values, inclusive non-daily date labels, larger tappable points, and an exact reading/timestamp inspector. The W/M endpoint no longer displays the next day's exclusive midnight.
- Removed the duplicate Summary goals card, kept goal context in the top metrics, and made the six-item bottom tab bar safe-area aware with compact labels.
- Replaced alert-callback-dependent signup/reset success behavior with an explicit check-email screen and in-app authentication errors, so browser preview and mobile share the same route behavior.
- Simplified goal-save feedback to `Goals saved.`; the automatic protein explanation remains beside the setting where it is relevant.
- The user observed that a second account does not display the first account's data, confirming basic read isolation. Direct cross-user update/delete policy checks remain before the RLS roadmap gate is complete.
- Verified with `npm run check` (lint, strict TypeScript, 12/12 tests), `git diff --check`, and `npx expo export --platform web`.

## 2026-08-30 — EAS and Apple signing foundation

- Linked `@jalenwang/healthapp`, installed Expo dev client, configured development/preview/production EAS profiles, and registered the app as `com.jalen.healthapp`.
- Apple Developer enrollment, the managed distribution certificate, ad hoc provisioning profile, and the physical development iPhone are active. No credentials need to be regenerated for the retry.
- Diagnosed the pre-upload failure by reproducing EAS's exact shallow local clone: the apostrophe in `Jalen's Ultimate Health App` breaks Git-for-Windows quoting for the generated `file:///` clone URL.
- Validated Expo's supported no-VCS packaging workaround with `build:inspect`; it includes the workspace root lockfile and mobile EAS configuration while excluding the ignored mobile `.env`.
- Updated runtime configuration to accept EAS's `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` while preserving support for the legacy anon-key variable name.

## 2026-08-30 — HealthKit read-only import foundation

- Standardized local and EAS Supabase variables on the canonical HealthHub project after diagnosing an accidental second-project override.
- Added `@kingstinct/react-native-healthkit` 14.1 with Nitro Modules, a read-only HealthKit entitlement, and a focused Apple privacy explanation. No HealthKit write or background-delivery access is requested.
- Added permission-gated, one-year foreground imports for body mass, paired blood pressure correlations, and supported cardio workouts. Strength workouts remain in Apple Health because they do not include the exercise/set detail required by the lifting model.
- Added local per-user HealthKit anchors, deterministic UUIDv5 record identities, imported-deletion handling, source app/device provenance, and tombstone preservation so sync is incremental and retry-safe.
- Applied `202608300001_healthkit_imports.sql` to HealthHub. It adds external IDs/source labels, HealthKit cardio support, durable cardio tombstones, and per-user uniqueness indexes under the existing RLS policies.
- Added an Apple Health card to Health Log, an Apple Health Summary filter, and source labels in History. Combined graphs deduplicate identical manual/imported readings within five minutes while source-specific history remains available.
- Pinned React 19.2.3 at both workspace levels after Expo Doctor found npm had hoisted React 19.2.8. Verification passes: lint, strict TypeScript, 16/16 tests, Expo Doctor 21/21, web export, Expo entitlement introspection, and a clean remote migration dry run.
- EAS enabled the HealthKit capability, regenerated the registered-iPhone provisioning profile, and successfully produced development build `96ed5eb2-ec55-4cc0-9c40-308e1b84d998`.
- During device validation, Metro reported a missing `NitroModules` runtime. The successful build's Xcode log confirms that `NitroModules` and `ReactNativeHealthkit` were both compiled and linked with `RCT_NEW_ARCH_ENABLED=1`, identifying an older installed client or Expo Go as the mismatch. Added a pre-import native-module guard and documented a clean installation of the exact EAS build.
- After the correct client reached HealthKit, the first Connect action terminated natively. Split permission authorization from data import so no query runs during the permission interaction, and serialized the three anchored reads instead of invoking them concurrently. This is a Metro-delivered TypeScript change and does not require another native build; a repeated native termination now has a precisely isolated Connect or Sync phase for crash-report analysis.
- The exported iOS 26.6.1 crash report localized the repeated termination to `CoreModule.requestAuthorization`, with `EXC_BREAKPOINT`/`SIGTRAP` while an Objective-C `NSException` was being raised. Verified the signed IPA contains `NSHealthShareUsageDescription`, then removed the blood-pressure correlation type from the permission set while retaining its systolic and diastolic quantity types. A regression test prevents reintroducing that interdependent authorization combination; correlation reads remain unchanged.

## 2026-08-30 — Combined sources, meal builder, and mobile navigation pass

- Removed the tab navigator's duplicate native headers and enabled automatic iOS scroll insets on the affected screens, eliminating the blank top area while preserving status-bar safety.
- Removed Summary's source selector. Weight and BP charts now always use the deduplicated combination of manual and Apple readings; History continues to expose source provenance per record.
- Split Exercise into Lifting and Cardio subsections so each logger has a focused surface without adding another bottom-navigation item.
- Replaced the single-food form with a meal-first, multi-food builder. Each row supports add/remove, search against only the current user's saved foods, and calorie/protein entry; one save gives the meal's items a shared timestamp.
- Added Food History grouped by local date and meal, including daily calorie/protein totals and confirmation-based deletion for each food item.
- Replaced timestamp-shaped fallback IDs with valid UUIDv4 generation on native and web runtimes, fixing PostgreSQL `invalid input syntax for type uuid` failures.
- Reduced Apple Health permissions and import queries to weight and paired BP only. Suppressed the bridge-only `SourceProxy` label while retaining meaningful source-app names.
- Verified lint, strict TypeScript, 18/18 tests, `git diff --check`, and a successful Expo web export.

## 2026-08-30 — Durable lifting drafts

- Added a validated, user-scoped AsyncStorage workout draft. Lifting changes save continuously, restore after tab navigation or an app restart, and are flushed again when the app becomes inactive.
- Incomplete drafts stay on the current device and do not enter Supabase or Exercise History. A successful Finish workout save clears the local draft only after the completed workout is written remotely.
- Updated every Food History entry to use the same bordered Delete button and existing in-app confirmation sheet as workout, cardio, weight, and BP history entries.
- Verified with `npm run check`, `git diff --check`, and 20/20 tests.

## 2026-08-30 — Returning-tab top inset correction

- Diagnosed the Summary and History top gap as iOS reapplying `ScrollView` automatic content insets after a tab regained focus. Both screens now explicitly use `contentInsetAdjustmentBehavior="never"` and a fixed Safe Area top inset, matching the other tabs on first load and after tab navigation without a duplicate header-sized gap.
- Set the shared tab scene background to the app surface color. This makes the safe-area/status-bar region consistent across Summary, History, Exercise, Health Log, Food, and Profile; loading data no longer changes its appearance.

## 2026-08-30 — Unified Summary and Apple Health sync

- Moved the one-time Apple Health connection and status card from Health Log to Profile. Health Log now focuses solely on manual vital entry.
- Summary now uses a single guarded sync path: on tab focus it syncs Supabase and, for a connected iPhone user, imports Apple Health weight/BP in the same operation. The existing **Sync now** control forces that identical combined operation.
- Removed the standalone Apple Health sync action so connected users do not need to run two different sync controls. A failure to import Apple Health still allows the ordinary Supabase vital sync to complete and reports a clear status.
- Verified `npm run check`, `git diff --check`, and a successful Expo web export.

## 2026-08-30 — Focused mobile creation flow

- Replaced the six-tab bar with Summary, a raised center Create control, History, and Profile. The center control presents a native Expo Router form sheet with Food, Health, Exercise, and Weight choices, then routes directly to the selected logger.
- Made Weight and Blood pressure distinct logging surfaces. Both continue to write the same user-owned `vital_samples` records and use the existing offline outbox/Supabase sync, so no new table or migration is needed.
- Verified lint, strict TypeScript, 21/21 tests, `git diff --check`, and a successful iOS bundle export.

## 2026-08-31 — Reusable nutrition and Open Food Facts barcode foundation

- Replaced the name-only nutrition form with Basic, Search saved foods, Create food label, and Scan barcode workflows while preserving meal-first multi-food logging.
- Added private brand-aware food profiles, immutable nutrition-entry snapshots, core label nutrients, exact serving/mass/volume conversion metadata, meal grouping IDs, RLS, and server-only catalog/cache tables in `202608310001_food_catalog.sql`.
- Applied the migration to HealthHub and deployed the authenticated `resolve-food-barcode` TypeScript Edge Function. It validates/canonicalizes UPC/EAN codes, caches results, identifies HealthApp to Open Food Facts, and returns editable normalized nutrition without exposing server credentials.
- Added exact g/oz/lb and US mL/fl oz/cup/tbsp/tsp calculations, runtime Zod validation, private provider corrections, brand/source badges, enhanced Food History, and user-scoped AsyncStorage meal drafts.
- Installed and configured the Expo SDK 57 camera module with a purpose-specific iOS permission message and manual barcode fallback for web.
- Added an explicit failed-lookup fallback that offers to create a private profile with the scanned barcode already attached instead of leaving the user at an error message.
- Preserved the existing uncommitted center-tab `Track` label change and its prior documentation update.
- Verified lint, strict TypeScript, 26/26 tests, Expo Doctor 21/21, `git diff --check`, web export, iOS/Hermes export, the remote migration list, and ACTIVE Edge Function deployment. A replacement EAS binary remains pending because adding the native camera module requires a new iOS development build.

## 2026-08-30 — Summary nutrition and trend refinement

- Replaced the text-only Summary calories/protein cards with compact circular progress rings that retain current and goal numbers and open Food when tapped.
- Changed the initial Summary trend range to weekly. Chart-point inspection now toggles: one tap opens the value/time panel and another tap on the same point closes it.
- Added a pure regression test for the point-selection toggle. Verified lint, strict TypeScript, 21/21 tests, and `git diff --check`.

## 2026-08-30 — Centered creation and future-care placeholders

- Reordered the five visible tabs to Summary, History, centered Create, AI Coach, and Profile. Reminders is available as a Create-sheet choice, which preserves the clean permanent navigation while keeping medication/supplement/BP prompt setup discoverable.
- Added clear Reminders and AI Coach placeholder pages. Reminders previews supplement/medication completion and BP prompts without scheduling notifications yet; AI Coach documents the future consented, wellness-only direction without connecting any AI service.
- Verified lint, strict TypeScript, 21/21 tests, `git diff --check`, and a successful iOS bundle export.

## 2026-08-31 — Cross-agent context handoff audit

- Added a root `CLAUDE.md` that loads the authoritative working agreement, current status, and roadmap; the mobile Claude file now inherits that context as well as its Expo-specific rule.
- Updated the working agreement for the current iPhone/EAS, hosted Supabase Edge Function, browser-preview, user-learned suggestion, and dirty-worktree constraints.
- Replaced the stale Releases 0–1/Expo Go README with the current HealthHub, dev-client, HealthKit, camera, and barcode workflow.
- Recorded the uncommitted nutrition/barcode feature set, already-deployed backend state, pending camera-enabled EAS binary, and current `Track` navigation label in the concise handoff.

## 2026-08-31 — Barcode nutrition and household-serving correction

- Reproduced the missing-nutrient problem against a real PopCorners UPC: Open Food Facts v3 returned the requested identity/serving fields but not the legacy `nutriments` object expected by the resolver, while its v2 endpoint returned the normalized nutrient fields.
- Moved product lookup to the documented v2 product endpoint, added kilojoule calorie fallback and US total-carbohydrate preference, sentence-cased all-uppercase provider food names, and versioned the server cache so previously broken rows refresh on their next scan.
- Removed the unsafe fallback that treated a named but unweighted package as 100 g. The provider's 100 g basis is used only when it supplies no serving description at all.
- Added generic package/piece/bar-style household conversions across catalog products, private profiles, meal drafts, immutable history snapshots, manual label editing, and amount calculations. Partial piece counts scale through the provider's serving quantity without guessing mass or density.
- Applied `202608310002_food_household_servings.sql` to HealthHub and deployed ACTIVE `resolve-food-barcode` version 3, including protection against serving a pre-fix stale cache row when the provider is unavailable. Remote schema lint reports no errors.
- Verified the full check suite (27/27 mobile tests and 5/5 provider-normalization tests), `git diff --check`, and a production web export. Live iPhone rescanning of the corrected PopCorners flow remains the active validation item.

## 2026-09-01 — Detailed package nutrition and liquid-volume correction

- Reproduced both phone findings against the live Open Food Facts records. PopCorners `0810607023346` exposes a generic 100 g serving in the flat v2 product but a distinct 240-calorie packaging serving in its structured detailed panel; Fairlife `0811620021968` imports `1 bottle (414 g)` despite an explicit 14 oz liquid package.
- Added a guarded v3 knowledge-panel lookup only for generic 100 g records whose flat serving values duplicate the per-100 g values. The resolver parses the packaging-serving column, infers the 49.6 g package basis from its calorie ratio, and returns the detailed package nutrients rather than the flattened 100 g values.
- Added a constrained liquid-container rule: an explicit package ounce quantity is treated as fluid volume only when OFF also identifies a one-container liquid product. Fairlife now returns one `14 fl oz` bottle, 414 mL, and no weight conversion; no density conversion is introduced.
- Suppressed zero-valued count/weight/volume conversions while retaining valid zero nutrient values, and clarified in the label editor that most products should use weight or volume according to the package, leaving the other blank unless both are explicitly stated.
- Applied `202609010001_food_provider_servings.sql`, which expires pre-version-3 barcode cache rows, and deployed ACTIVE `resolve-food-barcode` version 4 with JWT verification. Live normalization returns PopCorners at 49.6 g/240 calories and Fairlife at 414 mL/170 calories.
- Verified `npm run check` with 27/27 mobile tests and 7/7 provider-normalization tests, plus `git diff --check`. Registered-iPhone re-scanning and Food History confirmation remain the active validation step.

## 2026-09-01 — Open Food Facts v3.6 contract and lookup-error correction

- Audited the implementation against the official Open Food Facts API introduction and v3 OpenAPI source. The documentation now marks v2 deprecated and recommends v3; v3.6 exposes structured nutrition through `nutrition.aggregated_set` and `nutrition.input_sets` and reports lookup outcome through `result.id`.
- Replaced the v2 product request plus generated knowledge-panel parsing with one identified `GET /api/v3.6/product/{barcode}.json` request using an explicit field list. The resolver accepts `product_found`, negative-caches `product_not_found`, and treats malformed responses, non-success HTTP statuses, timeouts, and rate limits as provider failures.
- Removed the inferred PopCorners package size. Its live OFF record does not state that one serving is one package and its two packaging input sets are internally inconsistent, so the app now retains the explicit 240-calorie per-serving nutrients while leaving serving description/count/weight/volume blank for confirmation from the bag.
- Added generic structured-unit handling: a `100ml` provider basis produces volume, a `100g` basis produces mass, and a reliable serving input uses its own unit. Explicit one-container fluid quantities remain volume-only without checking a product name, brand, or barcode.
- Added typed mobile lookup errors. Confirmed not-found products open the private label editor automatically; invalid UPC/EAN values remain on the scanner with digit guidance; provider/network failures remain on the scanner with retry and manual-barcode guidance.
- Applied `202609010002_open_food_facts_v3.sql`, deployed ACTIVE `resolve-food-barcode` version 6 with JWT verification, and confirmed the linked migration list and schema lint. A generic conflict guard now also leaves conversions blank when OFF reports a 100 g aggregate for a package explicitly labeled by volume. Verification passes with 27/27 mobile tests and 10/10 Edge normalization/contract tests; live v3.6 checks cover inconsistent serving data, a 414 mL bottle, and a separate 355 mL soda serving.
- Removed the EAN-13/EAN-8/UPC-A/UPC-E selector from manual entry. Camera scans continue to use Expo's detected symbology, while manual values are detected from their digits and check digit. OFF now receives the original UPC/EAN digits for its documented leading-zero normalization; UPC-E is expanded only to validate its check digit. Deployed ACTIVE resolver version 8 and verified the full suite with 27/27 mobile tests and 14/14 Edge tests.

## 2026-09-01 — Unified food lookup and reusable-profile deduplication

- Removed Basic entry as a separate new-food path and combined it with saved-food search under **Find or add food**. Recent and reusable matches continue to open the amount editor; a non-empty name without an exact normalized match now asks whether to create a reusable label and prefills that name. Existing unfinished/basic entries remain editable through the common amount model.
- Canonicalized reusable-profile barcodes and made `saveFoodProfile` reuse an existing per-user profile by either catalog product ID or barcode. Name-only profiles are deliberately not merged because the same name can represent different brands, servings, and nutrition.
- Added and applied `202609010003_user_food_profile_barcode_dedup.sql`. It normalizes existing profile barcodes, repoints immutable nutrition-history references to a selected keeper, deletes only the redundant profile rows, and enforces `unique (user_id, barcode)`. The linked migration list is current and remote schema lint reports no errors.
- Verified lint, strict TypeScript, 29/29 mobile tests, 14/14 Edge tests, and `git diff --check`. The TypeScript UI change requires only a Metro/app restart, not another EAS build.

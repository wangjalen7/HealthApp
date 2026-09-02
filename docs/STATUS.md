# Current status

**Active release:** Release 3 — nutrition and tracking expansion
**Active item:** Validate the nutrition/barcode and expanded tracking flows on the registered iPhone
**Last updated:** 2026-09-02

## Delivered locally

- Expo Router TypeScript app with a clean five-item Summary / History / Track / AI Coach / Profile mobile shell. The raised center Track button opens a native sheet that routes to Food, Water, Blood pressure, Weight, Exercise, or Reminders without adding permanent tab-bar clutter.
- Email/password registration, an explicit check-email destination after signup/reset, login, reset request, logout, and SecureStore-backed session restoration.
- Offline SQLite cache and idempotent outbox for manual weight, systolic/diastolic BP, and optional pulse.
- Manual entry form, 30-day visual trends, dashboard snapshot, and explicit sync feedback.
- Reviewed hosted Supabase migration with per-user RLS on profiles and vital samples.
- Hosted training/nutrition migration with per-user RLS for workout sessions/sets, cardio entries, and food entries.
- Muscle-group-first lifting builder (multiple Back, Chest, Tri, Bi, Delt, Legs, Abs selections allowed) with add/remove exercises, blank set-count-driven rep fields, working-weight entry (including a deliberate 0 lb value for bodyweight work), and full prior-session memory.
- Lifting exercises can be reordered before save, the Add exercise action is repeated below the current list, and each workout can persist an optional gym/location value. Exercise order and location remain editable in History. Multi-muscle workouts associate every exercise with a selected muscle group so History can show accurate per-exercise set totals and a sets-by-muscle breakdown.
- The app intentionally has no seeded exercises or foods. New suggestions are learned only from completed workouts and saved food entries belonging to the signed-in user; new workout/cardio/nutrition logs start with no selected values.
- Manual cardio logging for walking, running, swimming, tennis, cycling, and other activity types; its form stays compact on Exercise until tapped.
- Manual workout, cardio, weight, blood-pressure, and food history entries are editable. Apple Health/imported vital and cardio records remain read-only by design, while imported food snapshots are also protected from mutation.
- Nutrition uses a multi-item meal builder: meal selection comes first, foods can be added/removed like lifting exercises, and suggestions come only from the signed-in user's saved foods.
- Food logging now combines quick entry and saved-food search under **Find or add food**. It searches the user's Recent/My Foods records; selecting a match proceeds with that saved food, while an unmatched name asks whether to create a reusable label and prefills the label name. Direct label creation and phone-camera Open Food Facts lookup remain available. Same-name foods remain distinct by profile, brand, serving, and nutrition rather than being merged by name.
- Reusable labels store calories, protein, carbohydrates, fat, fiber, sugar, sodium, and exact per-serving mass/volume conversions. Logging supports servings, g, oz, lb, mL, fl oz, cups, tbsp, and tsp only when the corresponding package conversion exists; the app never guesses food density.
- Barcode lookup runs in an authenticated TypeScript Supabase Edge Function. The camera recognizes EAN-13, EAN-8, UPC-A, and UPC-E automatically; manual entry accepts digits without asking the user to identify the symbology. The resolver validates/canonicalizes UPC/EAN values, checks a server-only positive/negative cache, calls Open Food Facts with the required app identification, and returns an editable confirmation. Corrections are stored only in the user's private profile.
- A barcode that is missing from Open Food Facts now presents an explicit **Create food profile** action, carries the scanned barcode into the private label, and learns that profile for future My Foods suggestions.
- Barcode normalization uses the current Open Food Facts v3.6 product endpoint and its structured `nutrition.aggregated_set` / `nutrition.input_sets` data. It checks the documented `result.id`, rejects malformed provider responses, and no longer scrapes knowledge-panel display text or infers a package size that OFF does not provide.
- Package/piece-style servings are first-class conversions. A label such as `1 package (28.3 g)` defaults to one package, while `12 pieces` defaults to 12 pieces and can accurately scale a partial serving. The app never substitutes 100 g for a named package serving that lacks a mass conversion.
- Provider conversions keep weight and volume separate. Structured `100ml` nutrition becomes a 100 mL volume basis, structured `100g` becomes a 100 g mass basis, and explicit bottle/can fluid quantities remain volume-only. Internally inconsistent provider serving sets keep their entered per-serving nutrients but leave serving description/count/mass/volume blank for package confirmation.
- Lookup outcomes are distinct: a documented OFF `product_not_found` response opens a private manual label with the barcode attached; an invalid UPC/EAN stays on the scanner with digit guidance; network, rate-limit, malformed-response, and provider failures stay on the scanner with retry/manual-entry guidance.
- Reusable profiles are idempotent by stable identity: provider foods reuse `user_id + catalog_product_id`, and manual/provider barcode labels reuse `user_id + canonical barcode`. Migration `202609010003_user_food_profile_barcode_dedup.sql` normalizes existing barcodes, repoints historical entries to one keeper before removing redundant profiles, and enforces per-user barcode uniqueness. Barcode-free foods are not merged by name because distinct brands, servings, and nutrition may share a name.
- Unfinished meals are persisted locally per user through navigation, backgrounding, and app restarts. Meal history retains immutable brand, amount, source, note, and nutrition snapshots, so later label edits cannot change old totals.
- New locally generated IDs are valid UUIDv4 values on every platform, including native runtimes without `crypto.randomUUID`, preventing PostgreSQL UUID insert failures.
- Combined blood-pressure line chart plus clear daily weight, nutrition, and hydration dashboard cards. Summary always combines manual and imported readings while retaining provenance on each record.
- Hydration logging accepts water or other fluids in mL, fl oz, or cups and stores a canonical mL value. Profile owns the daily water goal, and Summary shows today's fluid-ounce progress.
- Summary includes a current-month calorie calendar with green goal-progress rings for logged days at or under the target and red rings for days over it. Calories and Protein now open Food History instead of the logging form; the redundant lift/cardio-today strip is removed.
- Today reloads cached/synced vitals whenever the tab receives focus, so new manual readings appear in its metrics and trend charts.
- Workout History lists every saved session by date and muscle group, with its exercises, per-exercise set totals, sets-by-muscle breakdown, reps, working weight, and notes.
- Lift search ranks matching exercises within the chosen muscle group and shows the strongest session in the past 90 days plus a conservative double-progression cue.
- Exercise search ignores casing and punctuation differences, protects selection from blur/request races, and preserves prior performance recorded at an explicit 0 lb.
- Today shows the precise local time each displayed weight/BP metric was measured and retains the last successful vital sync timestamp across app restarts.
- Today has D/W/M/6M/Y controls for both weight and blood pressure. The D range keeps each intra-day reading and plots it on a midnight-to-11:59 PM time axis; longer ranges use daily readings.
- Summary charts have labeled horizontal and vertical scales, default to the weekly view, label the inclusive current date instead of the next exclusive midnight, and reveal the exact value/time when a point is tapped; tapping that same point again closes the inspector.
- History cards open an editable workout view. Saving uses an authenticated Supabase function to atomically replace only the current user's workout and sets.
- History has internal Workout, Blood pressure, Weight, and Food views. Workout combines lift sessions and cardio chronologically; Food groups entries by local date and meal with daily calorie, protein, and water/fluid totals plus individual food deletion. Hydration-only days also appear. Every day opens a full totals popup for calories, protein, water/fluids, carbohydrates, fat, fiber, sodium, and sugar; nutrients missing from any entry are labeled as incomplete instead of silently counted as zero.
- Every visible History card now opens an in-app, cross-platform deletion sheet. Workout and cardio rows are deleted remotely under RLS; BP/weight records are tombstoned locally and queued for safe remote sync, so they remain deleted when offline.
- Profile is the sole place to set calorie, protein, hydration, weight, and BP targets. A blank protein target automatically uses `0.7 × latest body weight in lb`; Summary displays calorie/protein/water current and goal values inside tappable circular progress rings.
- BP targets default to 120/80 mmHg for existing profiles that had no saved BP target and for future profiles.
- Exercise has dedicated Lifting and Cardio subsections. Weight and Blood pressure now have separate designated logging pages, while their existing readings remain in the shared, user-owned `vital_samples` timeline for graphs, offline sync, and Apple Health provenance.
- Reminders is a non-scheduling placeholder for future supplement/medication daily completion and blood-pressure prompts. AI Coach is a non-connected placeholder for future consented, wellness-only data-informed suggestions.
- An unfinished lifting workout is continuously saved as a user-scoped local draft. It restores after navigation, app restart, or backgrounding and clears only after a successful Finish workout save.
- Food History uses the same bordered Delete button and in-app confirmation sheet as the other History sections.
- Summary Weight, Blood pressure, Calories, and Protein cards open their corresponding History view; Water opens hydration logging.
- The Track sheet is a fixed two-column grid ordered Food/Water, Blood Pressure/Weight, and Workout/Reminders.
- Summary no longer repeats a separate goals card; each top metric retains the relevant goal context, while Profile remains the editing surface.
- Expo dev client and EAS are configured for `@jalenwang/healthapp`; the Apple bundle identifier, signing certificate, ad hoc provisioning profile, and development iPhone registration are active.
- Supabase configuration accepts the current `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` name while retaining compatibility with the legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY` name.
- Expo local and EAS Development/Preview/Production environments consistently target the canonical HealthHub Supabase project (`lztqnyejimzuvdxgtext`).
- Read-only Apple Health integration is intentionally limited to one year of weight and paired blood-pressure readings through a permission-gated iOS adapter.
- Apple Health connection lives in Profile. Once connected, Summary automatically includes Apple Health in its foreground sync whenever the tab opens; Summary's single Sync now control forces the same combined sync on demand.
- HealthKit imports use per-user deterministic IDs and locally persisted anchors for idempotent incremental sync; imported deletions and user-hidden records are reconciled safely.
- HealthKit source app/device names flow through Supabase and History; meaningless bridge labels such as `SourceProxy` are suppressed. Summary deduplicates an identical manual/imported reading within five minutes for combined charts and averages, while History retains both source records.
- Authenticated tab screens no longer reserve an empty native header. Summary and History explicitly opt out of iOS automatic ScrollView inset adjustment, then apply a stable safe-area top inset so they align with the other tabs without a header-sized gap returning after navigation. The shared tab scene uses the same background as every page, including the status-bar area.

## Environment

| Item                                 | State                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Node.js / npm / Git                  | Installed and verified                                                                                                     |
| Docker / WSL2                        | Intentionally deferred                                                                                                     |
| Supabase project and app credentials | Configured locally in ignored `apps/mobile/.env`                                                                           |
| EAS / Apple signing                  | Camera/HealthKit development client is installed on the registered iPhone; live barcode scanning is confirmed              |
| Local checks                         | Lint, strict TypeScript, 39/39 mobile tests, 14/14 Edge tests, and the production web export pass                         |
| Hosted migrations                    | All migrations through `202609020002_workout_muscle_group_sets.sql` are applied to HealthHub                              |
| Food lookup Edge Function            | `resolve-food-barcode` version 8 is deployed and ACTIVE in HealthHub with JWT verification                                  |
| Remote RLS check                     | Basic read isolation observed with a second account; direct cross-user update/delete verification remains                  |

## Context handoff

- The nutrition/barcode and expanded-tracking implementations are currently uncommitted working-tree changes. Preserve them; do not reset or replace them when starting a new context.
- The database migrations through `202609020002_workout_muscle_group_sets.sql` and `resolve-food-barcode` version 8 are deployed to the canonical HealthHub project. Do not re-create a second Supabase project.
- The camera-enabled iOS development binary is installed and scanning works. These resolver, SQL, and TypeScript fixes do not require another EAS build; restart Metro/the app to load them.
- Root `AGENTS.md` defines the working rules. Root `CLAUDE.md` and `apps/mobile/CLAUDE.md` load those rules plus this status/roadmap for Claude Code sessions.

## Next exact action

Restart Metro/the app and test both feature sets. Recheck that **Find or add food** searches Recent/My Foods and offers a prefilled reusable label only when no exact name exists, along with the saved-food/barcode cases already listed. Verify Food History's daily water/fluid total and full daily-totals popup, then test workout reordering/location/set breakdown, the Track grid, hydration goal/progress, Summary navigation, the calorie calendar, and manual History editing. Confirm imported Apple Health records do not show an Edit action.

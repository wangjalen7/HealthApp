# HealthApp roadmap

Status key: `[ ]` planned, `[-]` in progress, `[x]` complete.

## Release 0 — Foundation

- [x] Define repository working agreement, decisions, status tracking, and implementation log.
- [x] Create the Expo Router TypeScript workspace and development scripts.
- [x] Add accessible navigation shell, linting, formatting, and test baseline.
- [x] Add hosted-Supabase configuration, reviewed migrations, RLS policies, and remote verification guidance.
- [x] Add CI for static checks.

## Release 1 — Daily vitals loop

- [x] Implement email/password account creation, verification-friendly login, reset, logout, and session restore.
- [x] Implement offline-first manual weight and blood-pressure entry with an idempotent local outbox.
- [x] Implement authenticated syncing, retry feedback, and secure local session storage.
- [x] Implement today dashboard and 30-day weight and blood-pressure trends.
- [x] Configure a hosted development project and apply the reviewed vitals migration.
- [ ] Verify cross-user RLS behavior with two test accounts.

## Release 2 — iPhone development build and HealthKit foundation

- [x] Enroll in the Apple Developer Program and link the Expo/EAS project.
- [x] Install Expo dev client, configure EAS profiles, register the iPhone, and generate managed Apple signing credentials.
- [x] Produce and install the baseline iOS development build; the repository path no longer contains the apostrophe that triggered Windows Git clone failures.
- [x] Implement source-aware, read-only HealthKit import for weight and paired blood pressure with incremental reconciliation.
- [x] Move Apple Health connection to Profile and consolidate foreground Apple Health import into Summary's automatic and manual sync path.
- [ ] Validate HealthKit permissions, imports, duplicate prevention, and deletion handling on the registered iPhone using the replacement development build.

## Release 3 â€” Training, cardio, and nutrition core

- [x] Add secure remote tables and RLS policies for workouts, workout sets, cardio, and nutrition entries.
- [x] Implement muscle-group-first lifting, add/remove exercises, set-count-driven rep fields, working weight, search, and full last-session exercise memory.
- [x] Add scrollable workout history and a tested 90-day strongest-performance progressive-overload cue.
- [x] Remove seeded exercise and food data; learn future suggestions only from the user's saved history.
- [x] Support multiple selected muscle groups per workout and persist them to hosted Supabase.
- [x] Show last measured vital times and the last successful vitals sync time.
- [x] Add D/W/M/6M/Y vital charts with a true midnight-to-midnight daily time axis.
- [x] Add secure workout-history editing for muscle groups, exercises, sets, reps, weight, and notes.
- [x] Treat an explicit 0 lb working weight as valid for bodyweight exercises while keeping an empty weight field invalid.
- [x] Add Exercise, Blood pressure, and Weight history views with timestamps and source labels.
- [x] Add user-owned calorie, weight, and blood-pressure goals plus automatic 0.7 g/lb protein progress.
- [x] Make 120/80 the persisted default BP goal and move all goal editing to Profile.
- [x] Consolidate cardio into Exercise and rename Today/Track/Lift to Summary/Health Log/Exercise.
- [x] Implement manual cardio for walks, runs, swimming, tennis, cycling, and other activities.
- [x] Implement calorie/protein targets, quick food search, and meal logging.
- [x] Extend the Today dashboard with daily activity/nutrition summaries, combined BP charting, and all/manual source filtering.
- [x] Collapse the manual cardio form on Exercise until the user chooses to expand it.
- [x] Link Summary metrics to their detailed screens, combine lift/cardio history, and add a configurable protein-goal override.
- [x] Add confirmation-based deletion for every visible History entry type.
- [x] Make the History deletion confirmation visible and reliable in browser preview and mobile.
- [x] Harden 90-day exercise memory against suggestion-selection races, case/punctuation differences, and explicit 0 lb bodyweight sessions.
- [x] Add readable chart scales, inclusive date labels, and tap-to-inspect weight/BP readings.
- [x] Add explicit post-signup/reset confirmation routing and make the six-tab mobile bar safe-area aware.
- [x] Remove the redundant Summary goals section while retaining goal context in its top metrics.
- [x] Split Exercise into dedicated Lifting and Cardio subsections.
- [x] Persist unfinished lifting-workout drafts locally per signed-in user, restoring them after navigation or app restart and clearing them after completion.
- [x] Replace single-food logging with a multi-item meal builder, user-history suggestions, valid cross-platform UUIDs, and date/meal-grouped Food History with deletion.
- [x] Use the standard History deletion button and confirmation sheet for every individual food entry.
- [x] Remove Summary source filters: combined charts always include manual and Apple readings while preserving record-level provenance in History.
- [x] Remove duplicate mobile screen headers and retain safe-area-aware scroll content.
- [x] Simplify the mobile shell to Summary / History / Track / AI Coach / Profile, with a raised Track action sheet containing Reminders, placeholders for future reminders/coach work, and separate Weight/Blood pressure pages backed by the existing vital timeline.
- [x] Add Summary calorie/protein circular progress visuals, a weekly trend default, and tap-again-to-dismiss trend inspection.
- [x] Add reusable, brand-aware food profiles with immutable meal snapshots, exact serving/mass/volume calculations, and user-scoped unfinished meal drafts.
- [x] Combine Basic entry with saved-food search, offer prefilled reusable-label creation only when no exact saved name exists, and deduplicate reusable profiles by catalog product or canonical per-user barcode.
- [x] Deploy an authenticated, cached Open Food Facts barcode resolver as a TypeScript Supabase Edge Function.
- [-] Validate the unified nutrition/barcode flow and the tracking expansion on the camera-enabled iPhone client, including hydration, workout ordering/location, Summary navigation/calendar, and manual-history editing.
- [x] Add reorderable/location-aware exercise logging, hydration tracking and goals, calorie-calendar summaries, corrected Summary navigation, and editing for all history categories.
- [x] Rename the user-facing Exercise area to Workout and persist per-exercise muscle groups for per-exercise and per-muscle set totals in Workout History.
- [x] Include daily water/fluid totals in Food History and restore the unified saved-food search/new-label flow after an accidental UI regression.
- [x] Add a per-day Food History totals popup for calories, protein, water/fluids, carbohydrates, fat, fiber, sodium, and sugar with incomplete-data labeling.
- [ ] Add Strava import after its platform/API setup.

## Later releases

- [ ] Release 4: progress pictures, Strava import, USDA external food search/fallback, and richer source filters.
- [ ] Release 5: progress photos, medication/supplement reminders, notifications.
- [ ] Release 6: consented, wellness-only AI daily coach and evaluation suite.
- [ ] Release 7: multi-user operational hardening, observability, cost controls, and web companion.

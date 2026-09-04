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
- [x] Add fixed-duration rolling D/W/M/6M/Y vital viewports with hourly D averages, daily W/M averages, weekly 6M averages, monthly Y averages, range-specific time divisions, stable dataset-wide vertical scales, and enlarged near-edge plots.
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
- [-] Validate the native Face ID, progress-photo, unified nutrition/barcode, and expanded tracking flows on the registered iPhone, including hydration, workout ordering/location, Summary navigation/calendar, and manual-history editing.
- [x] Add drag-reorderable/location-aware exercise logging, arrow-based Workout History reordering, hydration tracking and goals, calorie-calendar summaries, corrected Summary navigation, and editing for all history categories.
- [x] Rename the user-facing Exercise area to Workout and persist per-exercise muscle groups for per-exercise and per-muscle set totals in Workout History.
- [x] Include daily water/fluid totals in Food History and restore the unified saved-food search/new-label flow after an accidental UI regression.
- [x] Add a per-day Food History totals popup for calories, protein, water/fluids, carbohydrates, fat, fiber, sodium, and sugar with incomplete-data labeling.
- [x] Refine History ordering, timestamps, muscle labels, post-edit navigation, and serving-based food-amount editing while retaining read-only imported health data.
- [x] Add paired-average blood-pressure categories plus Omron-inspired solid/outlined points and a direction-locked D/W/M/6M/Y timeline whose actual bounds and edge-connected data update continuously under the finger without paging or snapping.
- [x] Add historical month navigation to the Summary calorie calendar and keep wrapped Workout History muscle badges aligned.
- [x] Add edit/archive actions with an in-place confirmation overlay for saved food labels, a 40 fl oz hydration shortcut, matching Food History water-total styling, and resilient right-aligned Workout History set totals.
- [x] Require and persist first/last names at signup, reject duplicate-email fake successes, complete native password recovery, personalize Summary, quiet no-op Apple Health syncs, and display Weight range averages consistently.
- [x] Let existing users add or update their first and last name from the Profile Account card and synchronize it to both profile storage and Auth metadata.
- [x] Persist all edited scanned-food serving conversions, prefer private corrections on later scans, and clarify the optional display label versus structured item/weight/volume logging fields.
- [x] Convert the entered serving weight or volume value immediately when its unit is changed in the food-label editor.
- [x] Automatically create or reuse a private My Foods label for every scanned or tracked food, including legacy drafts and unprofiled Recent entries, without merging distinct same-name foods.
- [x] Restrict unfinished-meal food editing to amount/unit/note, add a dedicated Food-screen label manager, reuse the current private label before provider lookup on repeat scans, and remove food-source badges from logging surfaces.
- [x] Remove the duplicate editable serving-label field and redundant read-only preview; generate display text internally from structured item, weight, and volume conversions with a legacy/provider fallback.
- [x] Require every new or edited food label to define a reproducible serving by weight, volume, or a countable physical item; block generic `1 serving` and unresolved scans until confirmed from the package.
- [x] Make Profile name persistence unmistakable with saved, unsaved, required, saving, and failure states plus a change-aware Save name action.
- [x] Add opt-in iPhone Face ID protection and password-free post-logout login using a server-revocable random device credential held behind device-only biometric Keychain access, process-only active sessions, remembered-account controls, password-change revocation, retry, password fallback, and legacy-password cleanup.
- [x] Refine login, Profile, and privacy-gate Face ID controls with Apple's native Face ID SF Symbol and compact iOS-style presentation.
- [x] Reduce redundant page subtext, move Face ID enrollment behind a minimal Profile-row password prompt, and show goal-save success inline.
- [x] Add private, storage-efficient progress photos from camera or library during Weight logging and from every Weight History entry, with a swipeable archive, deletion, and a three-photo daily limit.
- [x] Import read-only HealthKit pulse only when it can be safely associated with a paired Blood Pressure record, and display it in History.
- [x] Add device-local medication, supplement, custom, blood-pressure, and weight reminders with native scheduled notifications, repeat timing including multiple daily times, and daily completion.
- [ ] Add Strava import after its platform/API setup.

## Later releases

- [ ] Release 4: Strava import, USDA external food search/fallback, and richer source filters.
- [ ] Release 5: cloud-synced, server-delivered reminder notifications.
- [ ] Release 6: consented, wellness-only AI daily coach and evaluation suite.
- [ ] Release 7: multi-user operational hardening, observability, cost controls, and web companion.

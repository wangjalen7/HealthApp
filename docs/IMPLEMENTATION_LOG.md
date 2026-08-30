# Implementation log

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

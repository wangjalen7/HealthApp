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
- [ ] Add location capture, barcode lookup, and Strava import after their respective platform/API setup.

## Later releases

- [ ] Release 2: real-device builds, HealthKit read access, Omron import/reconciliation, Apple developer setup.
- [ ] Release 4: progress pictures, workout locations, barcode lookup, Strava import, and richer source filters.
- [ ] Release 5: progress photos, medication/supplement reminders, notifications.
- [ ] Release 6: consented, wellness-only AI daily coach and evaluation suite.
- [ ] Release 7: multi-user operational hardening, observability, cost controls, and web companion.

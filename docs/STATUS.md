# Current status

**Active release:** Release 3 — Training, cardio, and nutrition core  
**Active item:** Verify core features in Expo Go and finish the two-account RLS check  
**Last updated:** 2026-08-29

## Delivered locally

- Expo Router TypeScript app with a clean Today / Track / Profile navigation shell.
- Email/password registration, verification messaging, login, reset request, logout, and SecureStore-backed session restoration.
- Offline SQLite cache and idempotent outbox for manual weight, systolic/diastolic BP, and optional pulse.
- Manual entry form, 30-day visual trends, dashboard snapshot, and explicit sync feedback.
- Reviewed hosted Supabase migration with per-user RLS on profiles and vital samples.
- Hosted training/nutrition migration with per-user RLS for workout sessions/sets, cardio entries, and food entries.
- Muscle-group-first lifting builder (multiple Back, Chest, Tri, Bi, Delt, Legs, Abs selections allowed) with add/remove exercises, blank set-count-driven rep fields, working-weight entry (including a deliberate 0 lb value for bodyweight work), and full prior-session memory.
- The app intentionally has no seeded exercises or foods. New suggestions are learned only from completed workouts and saved food entries belonging to the signed-in user; new workout/cardio/nutrition logs start with no selected values.
- Manual cardio logging for walking, running, swimming, tennis, cycling, and other activity types; its form stays compact on Exercise until tapped.
- Nutrition logging with calorie/protein targets, quick food search, meal labels, and daily dashboard summary.
- Combined blood-pressure line chart plus clear daily weight, nutrition, and activity dashboard cards, with all/manual source filtering ready for future imports.
- Today reloads cached/synced vitals whenever the tab receives focus, so new manual readings appear in its metrics and trend charts.
- Exercise History tab lists every saved session by date and muscle group, with its exercises, sets, reps, working weight, and notes.
- Lift search ranks matching exercises within the chosen muscle group and shows the strongest session in the past 90 days plus a conservative double-progression cue.
- Today shows the precise local time each displayed weight/BP metric was measured and retains the last successful vital sync timestamp across app restarts.
- Today has D/W/M/6M/Y controls for both weight and blood pressure. The D range keeps each intra-day reading and plots it on a midnight-to-11:59 PM time axis; longer ranges use daily readings.
- History cards open an editable workout view. Saving uses an authenticated Supabase function to atomically replace only the current user's workout and sets.
- History has internal Exercise, Blood pressure, and Weight views. Exercise combines lift sessions and cardio in one reverse-chronological timeline; vital readings show all available values, timestamps, and sources.
- Every visible History card now opens an in-app, cross-platform deletion sheet. Workout and cardio rows are deleted remotely under RLS; BP/weight records are tombstoned locally and queued for safe remote sync, so they remain deleted when offline.
- Profile is the sole place to set calorie, protein, weight, and BP targets. A blank protein target automatically uses `0.7 × latest body weight in lb`; Summary displays calorie/protein `current / goal`.
- BP targets default to 120/80 mmHg for existing profiles that had no saved BP target and for future profiles.
- Cardio is embedded directly in Exercise. Bottom navigation is now Summary, Health Log, Exercise, History, Food, and Profile.
- Summary Weight, Blood pressure, Calories, and Protein cards open their corresponding History or Food detail screen.

## Environment

| Item | State |
| --- | --- |
| Node.js / npm / Git | Installed and verified |
| Docker / WSL2 | Intentionally deferred |
| Supabase project and app credentials | Configured locally in ignored `apps/mobile/.env` |
| Local checks | `npm run check` and Expo Doctor (21/21) pass |
| Hosted migrations | Releases 1, 3, muscle-groups, workout-edit, daily-goals, BP-default, and protein-goal migrations applied |
| Remote RLS check | Pending two-account verification |

## Next exact action

Run `npm run dev`, test saving a workout, cardio entry, and food entry, then complete the two-account RLS test in [hosted Supabase setup](SUPABASE_SETUP.md). Do not commit `apps/mobile/.env`.

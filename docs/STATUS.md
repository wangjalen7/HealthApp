# Current status

**Active release:** Release 2 — iPhone development build and HealthKit foundation
**Active item:** Validate the quantity-only Apple Health permission request and weight/BP import on the registered iPhone
**Last updated:** 2026-08-30

## Delivered locally

- Expo Router TypeScript app with a clean five-item Summary / History / Create / AI Coach / Profile mobile shell. The raised center Create button opens a native sheet that routes to Food, Blood pressure, Exercise, Weight, or Reminders without adding permanent tab-bar clutter.
- Email/password registration, an explicit check-email destination after signup/reset, login, reset request, logout, and SecureStore-backed session restoration.
- Offline SQLite cache and idempotent outbox for manual weight, systolic/diastolic BP, and optional pulse.
- Manual entry form, 30-day visual trends, dashboard snapshot, and explicit sync feedback.
- Reviewed hosted Supabase migration with per-user RLS on profiles and vital samples.
- Hosted training/nutrition migration with per-user RLS for workout sessions/sets, cardio entries, and food entries.
- Muscle-group-first lifting builder (multiple Back, Chest, Tri, Bi, Delt, Legs, Abs selections allowed) with add/remove exercises, blank set-count-driven rep fields, working-weight entry (including a deliberate 0 lb value for bodyweight work), and full prior-session memory.
- The app intentionally has no seeded exercises or foods. New suggestions are learned only from completed workouts and saved food entries belonging to the signed-in user; new workout/cardio/nutrition logs start with no selected values.
- Manual cardio logging for walking, running, swimming, tennis, cycling, and other activity types; its form stays compact on Exercise until tapped.
- Nutrition uses a multi-item meal builder: meal selection comes first, foods can be added/removed like lifting exercises, and suggestions come only from the signed-in user's saved foods.
- New locally generated IDs are valid UUIDv4 values on every platform, including native runtimes without `crypto.randomUUID`, preventing PostgreSQL UUID insert failures.
- Combined blood-pressure line chart plus clear daily weight, nutrition, and activity dashboard cards. Summary always combines manual and imported readings while retaining provenance on each record.
- Today reloads cached/synced vitals whenever the tab receives focus, so new manual readings appear in its metrics and trend charts.
- Exercise History tab lists every saved session by date and muscle group, with its exercises, sets, reps, working weight, and notes.
- Lift search ranks matching exercises within the chosen muscle group and shows the strongest session in the past 90 days plus a conservative double-progression cue.
- Exercise search ignores casing and punctuation differences, protects selection from blur/request races, and preserves prior performance recorded at an explicit 0 lb.
- Today shows the precise local time each displayed weight/BP metric was measured and retains the last successful vital sync timestamp across app restarts.
- Today has D/W/M/6M/Y controls for both weight and blood pressure. The D range keeps each intra-day reading and plots it on a midnight-to-11:59 PM time axis; longer ranges use daily readings.
- Summary charts have labeled horizontal and vertical scales, default to the weekly view, label the inclusive current date instead of the next exclusive midnight, and reveal the exact value/time when a point is tapped; tapping that same point again closes the inspector.
- History cards open an editable workout view. Saving uses an authenticated Supabase function to atomically replace only the current user's workout and sets.
- History has internal Exercise, Blood pressure, Weight, and Food views. Exercise combines lift sessions and cardio chronologically; Food groups entries by local date and meal with daily totals and individual deletion.
- Every visible History card now opens an in-app, cross-platform deletion sheet. Workout and cardio rows are deleted remotely under RLS; BP/weight records are tombstoned locally and queued for safe remote sync, so they remain deleted when offline.
- Profile is the sole place to set calorie, protein, weight, and BP targets. A blank protein target automatically uses `0.7 × latest body weight in lb`; Summary displays calorie/protein current/goal values inside tappable circular progress rings.
- BP targets default to 120/80 mmHg for existing profiles that had no saved BP target and for future profiles.
- Exercise has dedicated Lifting and Cardio subsections. Weight and Blood pressure now have separate designated logging pages, while their existing readings remain in the shared, user-owned `vital_samples` timeline for graphs, offline sync, and Apple Health provenance.
- Reminders is a non-scheduling placeholder for future supplement/medication daily completion and blood-pressure prompts. AI Coach is a non-connected placeholder for future consented, wellness-only data-informed suggestions.
- An unfinished lifting workout is continuously saved as a user-scoped local draft. It restores after navigation, app restart, or backgrounding and clears only after a successful Finish workout save.
- Food History uses the same bordered Delete button and in-app confirmation sheet as the other History sections.
- Summary Weight, Blood pressure, Calories, and Protein cards open their corresponding History or Food detail screen.
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
| EAS / Apple signing                  | HealthKit-enabled development build `96ed5eb2-ec55-4cc0-9c40-308e1b84d998` finished successfully for the registered iPhone |
| Local checks                         | Lint and strict TypeScript pass; 20/20 tests pass; Expo Doctor passes 21/21; web export passes                             |
| Hosted migrations                    | All migrations through `202608300001_healthkit_imports.sql` are applied to HealthHub                                       |
| Remote RLS check                     | Basic read isolation observed with a second account; direct cross-user update/delete verification remains                  |

## Next exact action

With Metro running, open **Profile** and choose **Connect Apple Health** using the reduced authorization set: body mass plus systolic and diastolic blood-pressure quantities only. Grant the requested read permissions, then open **Summary**. It should automatically run the combined Supabase and Apple Health sync; **Sync now** there repeats the same action on demand.

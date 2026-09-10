# Implementation log

- Summary and History now keep their existing foreground refresh behavior without presenting the native pull-to-refresh control whenever a tab opens. The spinner and content shift appear only after an intentional pull down.
- Corrected the continuous W/M Blood Pressure timeline to aggregate a complete calendar-day bucket before filtering it into the visible window. An individual day therefore retains its exact averaged reading while it moves across the graph instead of changing at either viewport edge. Added the regression test; lint, strict TypeScript, 83/83 mobile tests, and `git diff --check` pass.
- Preserved the true time coordinate of the adjacent off-screen line buckets and clipped only their rendering. This keeps the continuous trend line's visible angle stable while a user drags the timeline; the regression test brings the mobile suite to 84/84 passing tests.

## 2026-09-04 — Face ID Quick Log layering

- Fixed the root-level Quick Log form sheet remaining above the Face ID privacy gate after backgrounding. The root navigator now dismisses only `/create` when biometric lock begins, retaining the user's underlying tab; a focused regression test covers that route guard.
- Simplified the privacy gate to its Face ID action and password fallback. Aligned the Progress Photos header to the app's safe-area/tab offset, and added an inexpensive metadata-only indicator for Weight History entries that already have uploaded photos.
- Corrected the Progress Photos modal on Dynamic-Island devices: its header now applies the reliable root safe-area top inset directly rather than depending on a modal-scoped SafeAreaView inset; the close target also has a larger hit area.

## 2026-09-04 — Private progress photos and wrapped muscle totals

- Added tested storage-capacity error classification for Supabase's HTTP 402 quota restriction and legacy quota/full-storage messages. Weight logging and the gallery now tell the user to delete progress photos or free Supabase Storage instead of exposing an opaque provider error.
- Kept every Workout History set count attached to its muscle label with a non-breaking space, so phrases such as `3 Shoulders` wrap as one unit.
- Added progress-photo capture to Weight logging with separate camera and system-library actions, a local preview/removal step, and upload only after the weight sample has been queued and synced.
- Added a progress-photo icon to every Weight History entry. It opens the signed-in user's private archive in a full-screen, horizontally paged gallery with camera/library upload, anchored weight association, timestamp and position, and an in-place delete confirmation.
- Optimized long-term storage by stripping EXIF through JPEG re-encoding, limiting the longest edge to 1440 px, progressively compressing toward 900 KB, enforcing a 2 MB hard ceiling, using immutable UUID paths, and lazily rendering only nearby gallery images. The app and database enforce three progress photos per local calendar day.
- Applied `202609040002_progress_photos.sql` to HealthHub. It adds user-owned metadata with RLS, a private `progress-photos` bucket restricted to JPEG and 2 MB objects, user-folder storage policies, per-day slot uniqueness, and lookup indexes. Linked database lint reports no schema errors.
- Added Expo SDK 57-compatible image picker/manipulator dependencies and iOS camera/photo-library usage descriptions. A new EAS development build is required for registered-iPhone testing.
- Verified ESLint, strict TypeScript, 74/74 mobile tests, 16/16 Edge tests, Expo public/native configuration, the production web export, and `git diff --check`.

## 2026-09-04 — Profile save feedback and Face ID protection

- Reduced Profile's Face ID control to one iOS-style Enable/Disable row. The current-password field is no longer permanently visible; tapping **Enable** presents a compact modal, keeps validation errors in place, and closes only after successful enrollment.
- Added a dedicated, accessible goal-save result directly below **Save goals** and clear it as soon as a value changes, so success and errors stay attached to the form that produced them.
- Removed self-explanatory introductory copy across login, Food, Workout, History, Water, manual vitals, workout editing, reminders, AI Coach, and the Face ID privacy gate. Retained concise text for validation, missing data, permissions, source verification, password-reset security, and destructive confirmations.
- Reworked Profile's name editor around an explicit saved-value baseline. A persistent colored status now distinguishes saved, unsaved, missing-required-field, and error states; the primary action says **Saving...** during persistence, **Name saved** when unchanged, and re-enables as **Save name** immediately after a field changes.
- Added the Expo SDK 57-compatible `expo-local-authentication` module and iOS `NSFaceIDUsageDescription` config. Profile now exposes an availability-aware Face ID switch that requires a successful system authentication before the per-user device preference is enabled.
- Added an authenticated-shell privacy gate for Face ID-enabled accounts. Leaving/backgrounding locks the shell, foreground authentication waits until iOS is active, and canceled or failed prompts offer retry or a local-device sign-out followed by password or Face ID login.
- Replaced reusable-password storage with a password-free, server-revocable biometric device credential. Enrollment revalidates the password once, creates a random 256-bit secret, stores only its SHA-256 hash in the RLS-protected/server-only `biometric_device_credentials` table, and places the secret behind Face ID in the passcode-required, device-only iPhone Keychain. The public authentication action accepts only a correctly hashed secret; enrollment and revocation still validate a Supabase user JWT internally.
- Made active Supabase sessions process-only, so force-quitting returns to the login page and Face ID creates a fresh server session. Ordinary sign-out is now scoped to the current device rather than globally signing out every device. The login screen's accessible **Remember me** checkbox retains only email/account identity; turning it off during password login revokes and removes the matching Face ID enrollment.
- Added a database trigger that revokes every biometric device credential whenever `auth.users.encrypted_password` changes, covering recovery on this or another device. The local reset flow also removes its Keychain enrollment immediately and returns with an explicit new-password/re-enrollment notice; another device detects the server revocation on its next Face ID attempt, removes the stale credential, and asks for password sign-in. Existing pre-upgrade Keychain records containing a password are deleted rather than migrated, while their non-sensitive account identity can remain remembered.
- Replaced the oversized Face ID text controls with Expo SDK 57's native `faceid` SF Symbol: login uses a compact account row, Profile uses an icon-led settings row and setup/disable action, and the privacy gate uses an icon-only 58-point unlock target with a small caption. VoiceOver labels and the existing password fallback remain intact.
- Applied `202609040001_biometric_device_credentials.sql`, deployed ACTIVE `biometric-auth` version 1 with internal JWT handling, confirmed an unknown credential receives HTTP 401, aligned remote migration history, and found no linked-schema lint errors. The full lint, strict TypeScript, 69/69 mobile-test, and 16/16 Edge-test suite passes. Expo Go cannot test iOS Face ID or the native SF Symbol presentation, so a new EAS development build and registered-iPhone validation remain required.

## 2026-09-02 — Tracking expansion and editable manual history

- Deduplicated food amount text when the serving label already begins with the same amount and unit, so History and the current meal show `1 bottle (14 fl oz)` instead of `1 bottle · 1 bottle (14 fl oz)` without product-specific rules.
- Removed the Open Food Facts/My label/Manual source badge from Food History cards while retaining source metadata internally.
- Required first and last name during account creation and stored them in both Supabase Auth metadata and `public.profiles` via applied migration `202609020003_profile_names.sql`. Hosted duplicate-signup responses with an empty identity list now show an existing-account error instead of navigating to false success.
- Completed password recovery by parsing native implicit-token and PKCE callbacks, establishing the recovery session, and adding the previously missing new-password route. Reset confirmation wording now reflects Supabase's non-enumerating response and retry interval.
- Personalized the Summary header as `Hi FirstName,` with `Your daily snapshot` beneath, and suppressed the redundant no-change Apple Health sync success message. Changed Weight's top-right trend value from the latest reading to the current displayed-range average and reduced its subtitle to the same range-average label used by Blood pressure.
- Added first- and last-name fields plus a Save name action to Profile's Account card for pre-existing accounts. The editor loads public profile values with an Auth-metadata fallback and writes both stores so Summary immediately uses the saved first name.
- Fixed reusable scanned-food corrections appearing not to save: edits now preserve every serving conversion, including weight and volume, and future scans load a matching user-corrected/private barcode profile before displaying the shared Open Food Facts result. Confirming an adjusted scan updates the existing profile instead of skipping persistence, and the corrected marker remains durable across later edits.
- Clarified the food-label form by separating the optional human-readable serving label from optional structured logging conversions. Item amount/unit powers bottle, package, bar, and piece choices; weight and volume independently expose their matching amount units and remain blank when the package does not provide them.
- Made food-label weight and volume unit chips convert the current input in place instead of merely relabeling it. Conversions use the same canonical gram/milliliter factors as nutrition calculations and produce readable values such as `113.4 g` to `4 oz` and `414 mL` to `14 fl oz`.
- Made every scanned or tracked food automatically create or reuse a private My Foods label. The amount editor now profiles unprofiled Recent foods, legacy Basic entries do the same, and final meal saving backfills any restored older draft that bypassed those paths.
- Extended label deduplication without conflating same-name products: catalog ID and canonical barcode remain the primary identities, while barcode-free labels are reused only when normalized name, brand, source, serving conversions, and every stored nutrient match. Re-tracking a deleted corrected barcode label safely restores the private correction instead of leaving it archived.
- Restricted unfinished-meal item editing to the consumed amount, unit, and note. The editor now opens every legacy/current draft item directly in **Edit amount**, uses **Save amount**, and closes directly back to the meal; Back can no longer enter label/scanner creation and overwrite the entry being edited.
- Added a dedicated **Manage labels** control beside **Add food** on the Food screen. Its focused My Foods list is the only logging surface that exposes Edit label and Delete label, keeping reusable serving/nutrition corrections separate from routine food selection.
- Changed repeat barcode scanning to query the user's normalized private barcode label before calling Open Food Facts. Any existing profile, corrected or not, is reused immediately by profile ID, preventing duplicate creation and ensuring saved accuracy corrections cannot be overwritten by provider refreshes.
- Removed Corrected, Open Food Facts, My label, Manual, and Recent source badges from the unfinished-meal cards, food suggestions, and amount editor while retaining source/correction metadata internally and keeping the package-verification notice in the scan confirmation form.
- Removed the user-editable free-text serving label and its redundant read-only preview from food-label creation and management. One structured Serving size section now supplies item, weight, and volume inputs, while the app generates labels such as `1 package (49.6 g)`, `12 pieces (28 g)`, and `1 bottle (14 fl oz)` internally wherever display text is needed. Existing/provider label text remains an internal fallback only when no structured conversion can generate a display value.
- Required every new or edited label to have a reproducible serving basis: positive weight, positive volume, or positive count with a specific physical item unit. Generic `serving`/`portion` values and mass or volume names entered in the item-unit field are rejected; scans and older saved barcode labels without a valid basis remain on confirmation with package-specific guidance.
- Existing labels infer a sensible editable measurement unit from their stored display string before converting canonical grams/milliliters for the form, preserving familiar values such as `4 oz` and `14 fl oz` instead of reopening them as long decimal base-unit values.
- Added a **View daily totals** action to every Food History date. Its in-app popup totals calories, protein, water/fluids, carbohydrates, fat, fiber, sodium, and sugar. Optional nutrients show `recorded` or `Not available` when older/basic entries make a complete daily total impossible.
- Restored the unified **Find or add food** flow after it was accidentally reverted: the same screen searches Recent/My Foods, uses a selected saved match, and offers a reusable label prefilled from the query only when no exact saved food name exists. Basic Entry is no longer a separate new-food method; legacy unfinished basic entries remain editable.
- Added daily water/fluid totals to Food History, including hydration-only dates, using the same local-day grouping as food history.
- Renamed the user-facing Exercise destination and History tab to Workout. Workout History now shows an explicit total for each exercise and a session-level set breakdown by muscle group.
- Added a per-exercise muscle-group selection for multi-muscle lifting sessions and workout editing. Applied `202609020002_workout_muscle_group_sets.sql`; existing single-muscle sessions backfill automatically, while legacy multi-muscle sets remain visibly unassigned instead of being guessed.
- Added a bounded, accessible vertical drag handle to the lifting logger, repeated Add exercise below long workout lists, and persisted an optional gym/location value with each workout. Workout History editing retains explicit accessible up/down arrow buttons for precise reordering.
- Restored compact Workout History set text such as `3 x 12, 12, 12 at 45 lb` and changed the muscle breakdown to count-first wording such as `5 Back · 3 Bicep · 3 Shoulders`.
- Replaced the per-exercise set-count badge with its muscle group, expanded the user-facing Bi/Tri/Delt labels to Bicep/Tricep/Shoulders without rewriting stored history, and ordered History as Workout/Food/Blood pressure/Weight.
- Moved each food timestamp beside its name in smaller text. Food History editing now changes the consumed amount and unit, reconstructs the historical per-serving basis, and recalculates its nutrition totals instead of exposing nutrition-fact fields.
- Made every manual History editor return explicitly to the relevant History category after save or after tapping its custom History back control, rather than falling through to Summary. Apple Health/imported records remain read-only.
- Added one tested blood-pressure classifier for Normal, Elevated, Stage 1 Hypertension, and Stage 2 Hypertension. History shows a readable colored category badge while retaining standard dark text for the reading itself; the Summary BP value and chart use the same classification.
- Updated the BP chart with category-colored paired markers, solid systolic points, outlined diastolic points, a category key, and colored range/selected readings. Both vital charts now support horizontal swipes through dated D/W/M/6M/Y windows, including empty periods; D retains intraday points, W/M use daily points, 6M uses weekly points, and Y uses monthly points.
- Hardened chart gesture arbitration by capturing only deliberate horizontal movement, refusing responder termination mid-swipe, and disabling the authenticated shell's competing iOS dismiss gesture. Vertical Summary scrolling and chart-point taps remain available.
- Replaced release-triggered chart jumps with a three-window animated timeline. The previous/current/next dates, axes, and data translate with the finger, committed drags settle into the adjacent period, short drags spring back, and the current window applies resistance toward unavailable future dates.
- Connected both chart responders to Summary's vertical `ScrollView`: recognizing a horizontal chart drag disables vertical touch-scrolling for the remainder of that gesture, and release, cancellation, or chart unmount reliably restores it. Directional locking remains enabled for ordinary vertical page gestures.
- Removed the remaining page-panel interaction from vital charts. Horizontal movement now updates the real rolling-window timestamps, axes, averages, and plotted series continuously during the gesture; release performs no transition and preserves the exact position. The live present remains the sole movement boundary.
- Reduced chart clutter by averaging both weight and paired blood-pressure readings into local hour buckets for D, calendar days for W/M, calendar weeks for 6M, and calendar months for Y. Added timestamp-proportional axis divisions every 3 hours, day, 7 days, month, and 2 months respectively, and enlarged the plot vertically and toward the card edges.
- Stabilized each chart's vertical scale from all loaded readings for that vital rather than the currently visible window. Weight uses all loaded weight values, while blood pressure shares one domain across all loaded systolic and diastolic values; scrolling therefore cannot make either Y-axis jump, and no fixed medical or product-specific values are hardcoded.
- Extended each visible weight, systolic, and diastolic stroke through the nearest averaged bucket immediately outside both window edges. The SVG clips those connection-only points to the plot, while markers, tap targets, empty-state detection, and displayed averages remain limited to readings inside the selected rolling window.
- Replaced timestamp-based matching between independently averaged BP series with one bucketed systolic/diastolic pair. Marker and selected-reading colors now classify that exact pair, even when original systolic and diastolic timestamps differ slightly.
- Changed 6M aggregation from monthly to Sunday-through-Saturday averages while retaining monthly axis divisions; Y remains monthly. Replaced the large below-chart inspector with a content-fitted box anchored above the selected point. Every range uses a balanced nine-unit horizontal margin instead of a fixed width that leaves excess whitespace or a margin that crowds the text. Its labels show an hourly span for D, a date for W/M, a week span for 6M, or a month for Y followed by AVG and the reading. Removed the systolic/diastolic legend while retaining the BP category-color legend.
- Anchored aggregate timestamps to their actual bucket boundaries instead of the mean clock time of their source readings: D to the hour, W/M to local midnight, 6M to Sunday, and Y to the first of the month. Weekly points now land exactly on their matching daily X-axis divisions, and edge-connection points exclude duplicate partial buckets.
- Moved the `mmHg` unit to the main BP average and removed it from BP point tooltips and the redundant average subtitle; weight unit presentation is unchanged.
- Removed the persistent point-tap and horizontal-drag instructional messages beneath both vital charts while preserving those interactions and the empty-period message.
- Moved Sync from the Trends heading to the Summary header's top-right corner, added an accessible refresh icon and pressed/disabled states, and kept the last-sync timestamp directly beneath the control.
- Removed the explanatory text from the calorie calendar, added deliberate spacing between its header and weekday row, and title-cased the heading as in `September 2026 Calories`.
- Standardized Summary widget targets with a `Goal:` prefix for Weight, Blood pressure, Calories, Protein, and Water while retaining available Weight/BP measurement timestamps.
- Added Edit and confirmed Delete actions to user-created food labels in Recent/My Foods. Edits update the reusable profile, while deletion archives it and leaves immutable historical meal snapshots unchanged.
- Moved saved-food label deletion confirmation out of the scroll content into a centered, dimmed overlay above the current screen. Opening it dismisses the keyboard, and Cancel or the device back action closes the confirmation without navigating away.
- Prevented long Workout History muscle summaries from pushing session set totals against or beyond the right card edge by reserving a fixed, right-aligned total column. Matched the Food History water total to the calorie/protein type treatment and added a 40 fl oz quick-water shortcut.
- Added user-owned hydration storage and logging for water/other fluids in mL, fl oz, and cups. Profile now stores a daily water goal, and Summary renders today's fluid-ounce progress.
- Reordered the Track sheet into the requested two-column Food/Water, Blood Pressure/Weight, Exercise/Reminders layout.
- Added a calorie calendar using green progress rings at/under the daily goal and red rings over it. The calendar can navigate backward and forward across historical months, reloads on Summary focus, and prevents future-month navigation. Calories and Protein open Food History, and the former lift/cardio-today strip was removed.
- Anchored Workout History muscle-group badges to the top-right of each exercise row and prevented badge shrinking, so long exercise names can wrap without displacing the identifier.
- Added edit actions for manual cardio, weight, blood pressure, and food history. Workout editing retains exercise order and location. HealthKit/imported health records and imported food records remain read-only.
- Applied `202609020001_tracking_expansion.sql` to HealthHub. Remote migration history is aligned and database lint reports no schema errors.
- Verified ESLint, strict TypeScript, 65/65 mobile tests, 14/14 Edge tests, and `git diff --check`. The production web export passed before the final live-drag refactor; its follow-up Metro export stalled while bundling and the two export-only Node processes were stopped, so the final gesture behavior remains an iPhone/Metro validation item.

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

## 2026-09-04 â€” Local iPhone reminders

- Replaced the Reminders placeholder with user-scoped on-device routines for named medications/supplements, Custom, Blood pressure, and Weight tracking.
- Added native date/time selection and one-time, daily, selected-weekday, and weekly schedules. Saving an active routine requests iOS notification permission and schedules a local system notification that shows while the app is foregrounded or closed; tapping it returns to Reminders.
- Added per-local-day completion toggles, routine editing/deletion with cancellation of old schedules, and the requested History-tab order: Workout, Food, Weight, Blood pressure.
- Installed Expo SDK 57-compatible `expo-notifications` and `@react-native-community/datetimepicker`, and configured their native app plugins. These local schedules/completion marks intentionally remain on the signed-in device for now; no health/reminder data is sent to a new backend.
- Replaced the third-party UUID call in reminder creation with the app's React Native-safe UUID helper, which falls back safely when `globalThis.crypto` is unavailable on a device.
- Added a Multiple daily repeat option with up to six distinct daily notification times, and removed the Meal and Water reminder choices in favor of a named Custom choice. Workout now suggests the current user's recent saved gym locations while filling its location field.
- Suppressed the redundant lock-screen error when an automatic Face ID request is already in progress; real Face ID errors still remain visible.
- Added HealthKit heart-rate permission plus read-only pulse import. Because HealthKit does not include pulse in the blood-pressure correlation, the import and History UI use the closest value within two minutes while preferring an identical source label; this accommodates device/source-label differences while the pulse remains non-editable and is not deleted with the BP reading. The Apple Health card resumes its original connected-state display after authorization.
- Existing HealthKit connections now do one deterministic, deduplicated one-year BP re-read on the next sync to backfill matching pulse data rather than waiting for a newly-recorded BP measurement. Verified lint, strict TypeScript, 82/82 mobile tests, production web export, and `git diff --check`.
- Replaced deprecated DateTimePicker `onChange` handlers with `onValueChange`, and migrated the remaining React Native SafeAreaViews (the Face ID gate and Food editor) to `react-native-safe-area-context`, removing both device warnings without changing their layout.
- Verified lint and strict TypeScript; `npm run test` passes 77/77 tests. The initial sandboxed test attempt was blocked by Windows `spawn EPERM`, then passed unchanged with approved local worker-process access.


## 2026-09-04 ? iOS-inspired interface refresh

- Reviewed navigation, Summary card density, History filtering, Quick Log, Profile, authentication, tracking forms, safe areas, and existing chart/photo gestures. The main problems were inconsistent styling, missing tab icons, cramped nutrition card content, static controls, and inconsistent scrolling/keyboard treatment.
- Added reusable theme, line icons, spring press feedback, segmented controls, safe-area-aware page scrolling, reduced-motion context, and motion-aware modal wrappers under `apps/mobile/src/ui`. Existing business logic, privacy boundaries, imported-data restrictions, persistence, and remote services are preserved.
- Refreshed the app shell and major screens with grouped iOS-style surfaces, white cards, system blue actions, category accents, larger headings, and less heavy typography. Quick Log has six icon tiles in a scrollable, expandable native sheet. Summary separates latest readings from daily nutrition and gives rings enough room. Profile and authentication have clearer visual identity, and sign-in handles smaller screens and the keyboard.
- Added horizontal History category gestures with distance/velocity thresholds, diagonal/vertical rejection, bounded navigation, optional buttons, scroll reset, and cancellation cleanup. Kept the existing continuous vital-chart gestures and photo paging.
- New motion respects native Reduce Motion and CSS prefers-reduced-motion; all modal wrappers honor the same preference. No package or native configuration changes were required.
- Read the repository-required Expo SDK 57 documentation at https://docs.expo.dev/versions/v57.0.0/ before implementation.
- Validation: lint and strict TypeScript pass; 87 mobile tests and 16 Edge tests pass; production web export and `git diff --check` pass. Tests initially failed to spawn workers in the sandbox, then passed unchanged with approved process access.
- Browser visual QA could not run: the Browser skill/runtime connected but reported no available browsers. Native layout, keyboard, VoiceOver, sheet dismissal, and gesture feel must be validated on the registered iPhone, especially at increased text size and with Reduce Motion enabled.

## 2026-09-08 — App review and end-to-end usability fixes

- Preserved the pre-existing uncommitted interface refresh. Read the SDK 57 reference and tested the real Expo app in isolated headless Edge after the Browser runtime reported no connected browsers.
- Reduced Quick Log height with compact icon rows; streamlined Summary, History, meal and Coach copy; fixed 320 px greeting/wrapping; added food-method and camera/library icons, selected hydration shortcuts and accessible form/control states.
- Fixed direct Quick Log sign-in protection, reset/sign-in validation, browser SVG and populated-chart event warnings, missing manual pulse in BP History, disappearing workout-save feedback and empty workout cleanup after failed set insertion. Added individual fluid rows and confirmation-based deletion in Food History.
- Browser Reminders now states that scheduling requires the iPhone instead of showing a form with no working time picker. Chart points support browser keyboard inspection without changing the native press handler.
- Added `npm run test:e2e`, a Playwright configuration that starts its own server, and a synthetic Supabase fixture. All 8 browser tests pass together across the main flows and four viewport widths. No real health data, credentials, emails or remote database changes were used.
- Verification: lint, strict TypeScript, 90 app tests, 16 Edge tests, production web export, iPhone/Hermes bundle export and whitespace checks pass. The sandbox initially blocked test-worker spawning; approved process access allowed the checks to run normally.
- Detailed changes, commands, scope and outstanding native/live-service checks are in `docs/APP_REVIEW.md`. Face ID, camera/photos, notifications, Apple Health, native accessibility/gestures and live Supabase/RLS still require a disposable account and the registered iPhone's current development build. No deployment or commit was made.
- Completion audit confirmed no connected Apple mobile device or available iOS controller and no test-account environment variables. Corrected stale status entries for the old Quick Log grid, browser verification and test totals. The full goal remains open pending live-service and native-device evidence.
- After the same access blocker persisted across three goal turns, marked the goal blocked pending external access or hands-on native results. An approved read-only Windows device query confirmed zero connected Apple mobile devices; the current Playwright result still reports passed with no failed tests. No additional app changes were needed during this audit.

## 2026-09-09 — Correct Expo workspace startup

- Investigated the reported iOS `Unable to resolve "../../App"` failure. The running port-8081 manifest identified the repository root as the Expo project; `apps/mobile/package.json` already selected `expo-router/entry`. The README and barcode guide incorrectly recommended bare `npx expo start` without selecting the mobile directory.
- Added root `start` and `web` workspace aliases and explicit argument forwarding to root `dev`, `start` and `web`. Updated both guides with the repository-root command and instructions to stop/restart an incorrectly launched server.
- Read the required Expo SDK 57 reference before editing. Verified `npm run dev -- --dev-client --offline --port 8083 --max-workers 2` selected `apps/mobile`; requested its iOS manifest and actual development bundle, which returned HTTP 200 after Metro bundled 1,750 modules. Offline mode only avoids Expo CLI network calls during this verification. Stopped the temporary server; the user's existing port-8081 process requires a restart with the corrected command.
- Validation: `npm run check` passed (lint, strict TypeScript, 90 app tests and 16 Edge tests); whitespace checks passed. The initially sandboxed Metro process could not spawn DevTools or reach Expo services, so the successful bundle verification used approved worker access and Expo's offline CLI mode.

## 2026-09-09 — Match fluids to Food History meal formatting

- Compared the previous daily Food History layout with the review's added fluid rows. Moved drinks below meals into a Fluids group within the existing daily card, using the same section title, name/time header, amount text, row dividers and compact bordered action as food entries. Removed the separate icon-led fluid row presentation; the original daily fluid total stays in the date header.
- Extended the existing water flow with a same-day meal so it checks cancel/confirm deletion, fluid-total recalculation and meal preservation. Both targeted water/meal browser flows passed. Visually reviewed synthetic-data screenshots at 320 and 390 px; `npm run check` passed lint, TypeScript, 90 app tests and 16 Edge tests. Native rendering was not exercised for this layout-only change.

## 2026-09-09 — Preserve the unlock destination and unify tracking screens

- Found that the biometric lock branch unmounted the entire tab navigator, recreating it at Summary after unlock. Added a privacy boundary that leaves navigation and draft state mounted, conceals content, disables interaction/accessibility and dismisses the keyboard. Shared native dialogs observe the same privacy state. Removed Quick Log's lock-time Summary redirect so root sheet dismissal reveals the prior tab.
- Added two React lifecycle tests using native host stand-ins: selected screen and unsaved input survive repeated locks, and open private dialogs hide immediately until unlock. Added matching React renderer/type and esbuild development dependencies for these component tests; no native runtime dependencies or configuration changed.
- Shared tracking typography, inputs, cards, selection chips and primary/secondary action styles across Food, Water, Weight, Blood pressure, Workout/Cardio, Reminders and the food editor. Removed the extra Cardio heading and Hide/expand control. Replaced duplicate lifting Add controls with one Add exercise action below the entries; moved Add food below its list. Removed numbered section labels and redundant empty-list copy, aligned food totals with grouped cards, corrected browser input fonts and narrow water-shortcut wrapping.
- Verification: all 8 browser flows pass, including Cardio screenshots at 320/390/430/1280 px and populated draft screenshots; lint, strict TypeScript, 92 app/component tests and 16 Edge tests pass. iOS/Hermes export bundled 1,695 modules successfully. Native Face ID interaction, foreground transition timing and VoiceOver still require the physical iPhone. Changes remain local; no deployment or commit.

## 2026-09-10 — Smooth exercise reordering and clearer Add buttons

- Replaced fixed-distance exercise swaps with a gesture-driven draggable list: cards follow the finger, adjacent cards slide aside, a spring settles the drop, and the list scrolls near its edges. Variable card heights and current reps/weights survive reordering; keyboard and accessibility move actions remain available. Reduce Motion suppresses the lift/settling animation.
- Made Add food and Add exercise full-width, high-contrast blue buttons with white plus icons and labels. Kept them below their lists. Removed the requested saved-exercise/history hint and corrected cramped numeric-field padding.
- Added the JavaScript-only draggable-list dependency using the existing Gesture Handler/Reanimated modules, plus a pinned, reproducible patch for browser scroll measurements and competing scroll gestures. Root E2E scripts now forward test filters.
- Verification: all 9 browser flows pass together, including pointer tracking, repeated/variable-height reordering, edge auto-scroll, keyboard movement, draft restoration and exact saved sets. Lint, TypeScript, 92 app tests, 16 Edge tests, patch application and iOS/Hermes export pass. Reviewed synthetic food/workout screenshots. Physical iPhone gesture feel, VoiceOver and Reduce Motion remain hands-on checks.

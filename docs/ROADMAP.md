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
- [x] Configure side-by-side standalone and development iPhone variants with distinct bundle identifiers, names, URL schemes, and authentication redirects.
- [x] Implement source-aware, read-only HealthKit import for weight and paired blood pressure with incremental reconciliation.
- [x] Move Apple Health connection to Profile and consolidate foreground Apple Health import into Summary's automatic and manual sync path.
- [ ] Validate HealthKit permissions, imports, duplicate prevention, and deletion handling on the registered iPhone using the replacement development build.

- [x] Harden authentication, concurrent writes, durable retries, paginated sync and account isolation; prepare migrations and regression evidence.
- [x] Verify the complete biometric exchange with a disposable hosted account and prevent a second iOS Face ID prompt when persisting a rotated credential.
- [x] After explicit approval, deploy hardening migrations 003-005 and biometric-auth v6; verify hosted schema/API readiness and SQL regressions, and keep partial History queries usable when one category fails.

- [x] Implement phone-first onboarding, same-account verified contacts, optional shared goal/fluid setup, and existing-account continuity; deploy and verify the protected setup migration and SMS enrollment branch.
- [x] Make email the primary signup/sign-in method, retain the full onboarding flow, and remove phone entry/linking and SMS enrollment from the current UI. Phone delivery is deferred at the user's request.

## Release 3 â€” Training, cardio, and nutrition core

- [x] Add secure remote tables and RLS policies for workouts, workout sets, cardio, and nutrition entries.
- [x] Implement muscle-group-first lifting, add/remove exercises, set-count-driven rep fields, working weight, search, and full last-session exercise memory.
- [x] Add scrollable workout history and a tested 90-day strongest-performance progressive-overload cue.
- [x] Remove seeded exercise and food data; learn future suggestions only from the user's saved history.
- [x] Support multiple selected muscle groups per workout and persist them to hosted Supabase.
- [x] Show last measured vital times and the last successful vitals sync time.
- [x] Add fixed-duration rolling D/W/M/6M/Y vital viewports with hourly D averages, daily W/M averages, weekly 6M averages, monthly Y averages, range-specific time divisions, stable dataset-wide vertical scales, and enlarged near-edge plots.
- [x] Add secure workout-history editing for muscle groups, exercises, sets, reps, weight, and notes.
- [x] Add automatic single-side exercise detection with separate left/right reps and weights stored as one logical set, plus controlled drag and precise reorder actions.
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
- [x] Move AI estimation into Add Food, support per-food reusable-label choices and cooking-fat assumptions, keep package servings at amount selection, smooth vital trends without bridging longer-than-window gaps, refine confirmations, add Device/Light/Dark appearance, and organize device/integration controls in Profile Settings.
- [x] Add reusable recipes built from exact food-label amounts, user-defined batch yields, per-serving nutrition, fractional whole-recipe logging, immutable history snapshots, private RLS storage, and portable export.
- [x] Add Profile calorie and fluid goal helpers with 2023 adult EER maintenance estimates, selectable weight-change planning rates and timeframe comparison, beverage-specific hydration references, explicit acceptance, and tested canonical-unit calculations.
- [x] Review calorie/fluids against Calculator.net and primary hydration research; document findings, drink categories and custom-drink/AI design in CALORIE_FLUID_REVIEW.md (review only).
- [x] Implement locally the reviewed Calculator.net calorie method and intake guard, revised fluid-goal options, and manual category-based drink logging with consistent totals and legacy preservation; exclude AI from drinks.
- [x] Obtain explicit deployment approval, apply migration 202609170002_drink_categories.sql, validate its SQL/RLS fixtures, and deploy the updated coach-chat function. Linked checks and database lint pass; Coach version 12 is active and no migrations remain pending.
- [x] Simplify fluid and drink entry, correct goal precision, and move Coach into research-informed workout planning with beginner guidance; deploy the updated planner function.
- [x] Reduce the gap between fluid-history category and delete actions.
- [x] Retain a two-line preview when workout/cardio history notes are collapsed.
- [x] Implement the customizable Summary widget editor, Training Summary, Recent PR, Quick Actions, dated streak rules/targets and reversible food-day confirmation; verify domain/storage, browser and isolated SQL/RLS behavior.
- [x] Fix Edit Summary calling browser-only window event methods on native; verify editor opening, canceling, saving and reopening with a native-style component regression and the browser flow.
- [x] Make Edit Summary a live widget preview with original-only defaults, whole-widget hold-and-drag, stable insertion feedback, Small/Large sizes and separate options without visible manual move buttons.
- [x] Verify `202609180001_summary_streaks.sql` is applied, deploy `202609180002_summary_function_permissions.sql`, and pass hosted SQL/RLS verification for Profile goal-save and streak/confirmation RPCs.
- [x] Use a workout-history consent toggle and keep exercise guidance text-only without demo/website links.
- [x] Collapse workout-history notes, simplify fluid row quantities and unify AI action button styling.
- [x] Support multiple workout goals/styles, simplify overlapping choices and fix preference validation errors.
- [x] Replace workout chat with single-session lifting/cardio draft generation and expanded custom preferences.
- [x] Fix sentence-only AI workout results, preserve complete routines when clearing unsupported weights, verify draft navigation, and deploy/live-test Coach v16.
- [x] Separate fluid entries and daily totals into their own History tab.
- [ ] Validate the revised interface, onboarding, native Face ID, progress-photo, unified nutrition/barcode, and expanded tracking flows on the registered iPhone, including hydration, workout ordering/location, Summary widgets/drag/auto-scroll/streaks, chart gesture competition, privacy-lock/resume, manual-history editing, Dynamic Type, VoiceOver, and keyboard behavior.
- [x] Complete local app review, usability/save-flow fixes, and repeatable browser regression coverage; document outstanding live-backend and iPhone checks separately.
- [x] Correct repository-root Expo startup instructions and workspace script forwarding; verify the iOS development bundle uses Expo Router.
- [x] Match Food History fluid entries to meal formatting within the daily card, retaining daily totals and confirmed deletion.
- [x] Replace jumping exercise reorder with continuous dragging and edge auto-scroll, increase Add food/exercise contrast, and remove the redundant exercise hint.
- [x] Preserve navigation/drafts during the Face ID privacy lock, share tracking form styles, keep Cardio expanded and move single Add actions below food/exercise lists; verify lifecycle tests and browser flows.
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
- [x] Add device-local medication, supplement, custom, blood-pressure, and weight reminders with native scheduled notifications, repeat timing including multiple daily times, and completion-aware suppression for daily and individual multi-daily occurrences.
- [x] Add total product servings to reusable food labels, correct narrow-screen serving-unit layout, and offer provider-basis nutrient scaling when serving size is corrected.
- [x] Add a Profile data export with per-category CSV, complete JSON, device-only records, optional original progress photos, and native sharing.
- [x] Add direct post-save Food/Workout history actions and reliable held-card edge scrolling during exercise reordering.

- [x] Refresh the interface with a shared iOS-inspired design system, responsive touch feedback, swipeable History categories, and accessible navigation.

- [x] Implement AI meal estimates from photos/text with editable separate labels, one-serving and item-count portions, per-user daily quota, duplicate suppression, secure API and setup guidance.

- [x] Implement the first private AI Coach release with consent controls, saved chat, bounded historical tools, user-option/saved-label meals, lifting/cardio/combined/rest suggestions, evidence, quotas, safety suppression, and review-before-apply local drafts.

- [ ] Fund the OpenAI API project and validate live meal estimates and Luna/Terra Coach grounding; the Coach rollout is enabled, while registered-iPhone validation remains open.

- [x] Complete the app-wide premium iOS visual redesign and verify responsive screens and existing flows.

- [x] Restore the preferred UI except Profile, fix repeated chart gestures, simplify exercise ordering and L/R rows, add water-fill feedback, and refine login/Coach plus edit/delete icons.

- [x] Keep unilateral L/R reps, labels and weights aligned in a shared scrolling set grid, including overflow focus and saved-workout editing.

- [x] Scope progress photos to their weight entry, count daily photo slots independently, and balance text actions across delete confirmations.

- [x] Replace the daily photo quota with three photos per weight entry, apply backend enforcement, and center Camera/Library controls.

- [x] Center login branding and Face ID feedback, add password visibility and a Remember toggle, and clarify Summary sync feedback.

- [x] Place Remember and Face ID together below Password, above the Sign in button.

- [x] Override native Switch self-alignment so Remember me is vertically centered with its toggle.

- [x] Add separation between Sign in and the recovery/account-creation links.

- [x] Move L/R left of Sets while keeping regular and unilateral exercise columns aligned.

- [x] Restore regular exercises to their original Sets/x/Reps alignment while preserving the unilateral L/R layout.

## Later releases

- [ ] Add scheduled weekly Coach progress reviews for adherence, strength, weight trajectory, and next focus.
- [ ] Add daily readiness check-ins for sleep, soreness, energy, stress, hunger, and reviewed workout adjustments.
- [ ] Add plateau/deload detection and exercise substitutions based on available equipment and limitations.
- [ ] Add validated four-to-twelve-week bodybuilding programs after next-workout quality is proven.
- [ ] Add remaining-macro meal combinations, reusable meal plans, and grocery-list generation.
- [ ] Expand Apple Health recovery context with sleep, steps, resting heart rate, and HRV.
- [ ] Add separately consented progress-photo comparison and body-measurement trends.
- [ ] Add reviewed Coach reminder suggestions, evidence-focused supplement research, rest timers, warmups, and post-workout ratings.
- [ ] Release 4: USDA external food search/fallback and richer source filters.
- [ ] Release 5: cloud-synced, server-delivered reminder notifications.
- [ ] Release 6: proactive wellness Coach check-ins, scheduled reviews, and multiweek programs after first-release evaluation.
- [ ] Release 7: multi-user operational hardening, observability, cost controls, and web companion.

- [x] Implement Summary design, meals, streak rules, login-first entry and secure account deletion; pass local automated verification.
- [x] Fix native streak text rendering and cover all habit/size combinations with native-host regression checks.
- [x] Deploy Summary migration 202609220001 and verify live streak initialization, retries, permissions and disposable-account cleanup.
- [x] Remove food-day completion controls/streaks, migrate saved widgets and use saved calorie totals without confirmation.
- [x] Add direct Streaks/Quick Actions edit shortcuts and clearly labeled full widget previews with fixed Save/Cancel.
- [x] Keep streak selection rows and scroll position stable by separating the full preview from configuration and retaining stable validation/reminder space.
- [x] Use matching minus/plus controls for the training consistency days-per-week slider.
- [x] Unify all streak cards around the current Monday-Sunday week with weekday initials, checks and dates; retain historical totals and detail history.
- [x] Keep goal streaks only, remove the Met/progress field and combine imported/manual reading evidence automatically.
- [x] Support today-default entry dates for weight/BP, meals, fluids, lifting, cardio and progress photos, with draft restoration and retry-safe timestamps.
- [x] Polish Entry date icons/typography, make quick fluid amounts independent of drink selection, and align lifting/cardio headers with stable tab switching.
- [x] Make Welcome first-use only, retain authenticated account setup, and add keyboard-bounded deletion dialogs with recoverable sign-out/cancellation.
- [x] Deploy account-deletion database migration 202609220002 after linked preview and isolated SQL validation.
- [x] Obtain explicit approval, deploy delete-account with --no-verify-jwt, and verify disposable hosted deletion, recovery, authorization and account isolation.
- [x] Polish calorie/fluid helpers with per-account drafts, saved-result overviews, explicit recalculation/application, calendar loss plans, consistent Gender controls and retry-safe profile metadata.
- [x] Fix the Face ID foreground handoff race that can return to login after the native prompt; verify synthetic native lifecycle, retry and privacy-lock regressions.
- [x] Restore the original History tab styling while retaining its loading, retry and navigation improvements.
- [x] Tighten the visual gap between fluid-history category and delete controls while preserving touch targets.
- [x] Show saved maintenance and standard weight-loss calorie comparisons alongside the current calorie goal.
- [x] Prepare and visually verify a branded Sustain signup verification email with intact confirmation links.
- [ ] Publish the signup email after custom SMTP or a Supabase plan upgrade is configured; the current Free/default-provider restriction blocks template changes.
- [x] Implement privacy/legal drafts and controls, specific AI permission/minimization, export coverage, native storage/backup preparation, permission cleanup and shared accessibility improvements; document applicability, providers, operations and release blockers.
- [ ] Resolve operator/contact/countries/age/monetization, consumer-health legal review, provider terms/retention, backup restoration, licenses and App Store declarations before public release.
- [ ] After separate authorization, deploy privacy migration 202609250001 and updated AI functions, release a compatible rebuilt client, and verify hosted privacy/export/deletion with disposable accounts.
- [-] **In progress** - Complete physical-iPhone validation of native privacy/backup protection, permission denial, Sustain entry/standalone splash, reminders (delivery, taps, permissions, recurrence, capacity, DST/time zones), goal-helper calendars, keyboard, dark mode, Dynamic Type, VoiceOver/Voice Control/Switch Control, privacy lock, onboarding and device cleanup.

- [x] Reorganize Profile into grouped settings with focused goal, preference, health-data and account/security destinations.

- [x] Add configurable account-scoped Routine Reminders, coordinated scheduling and authenticated notification destinations while preserving custom reminders; document physical-device checks separately.

- [x] Fix onboarding keyboard layout and align calorie/fluid setup with persistent goal helpers, preserving unrelated drafts.

- [x] Give the blank Soon tab a mysterious Coming Soon design.

- [x] Review the current application and produce a comprehensive implementation, design-tradeoff and SWE interview report.

- [x] Simplify independent reminders, add medication/supplement interval schedules and full-screen editors.

- [x] Fix Face ID enrollment restoration for email-only accounts and verify lock/sign-out behavior.

- [x] Refine Track-only reminders, grouped medication toggle, delete popup and Profile sync alignment.

- [x] Unify reminder delete spacing, center the add action and preserve the medication modal during navigation.

- [x] Animate calorie calendar rings from empty to loaded progress.

- [x] Implement Sustain branded authentication, secure entry transitions and direct reminder destinations; verify and commit/push the accumulated work.

- [x] Independently review Sustain and produce a beginner-friendly system design, implementation, deployment, scaling and interview PDF.

- [x] Apply Sustain Home Screen branding to the app name, icon and permission prompts; verify native configuration.

- [x] Coordinate independent Summary/History loading, centered secure entry, cohesive Quick Log/History presentation and cardio history navigation.

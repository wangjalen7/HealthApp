# ADR-008: Device-local Summary layout and dated streak evidence

Status: Original September 18 implementation deployed. September 22 refinements implemented locally; Summary migration 202609220001 deployed; account-deletion migration/function deployed and disposable hosted checks pass; physical-iPhone validation pending.
Date: 2026-09-18

## Presentation

Summary keeps its greeting/date header with the Edit Summary icon; manual sync and status are in Profile Settings and the existing five-tab navigation. A versioned, user-keyed AsyncStorage layout contains widget IDs, ordered types, sizes and validated configuration only. Saves serialize per account, wait for earlier writes on read, preserve intentional empty layouts and do not write defaults before loading. Unknown/corrupt versions recover to a visible default preview until explicitly saved. No health records are stored in the layout.

The registry separates schemas/data needs from rendering. Adjacent Small cards pack in order; Large cards start a row. The persisted v1 value `wide` remains compatible with existing layouts and is displayed as Large. Small displays at full width below 370 points or fontScale above 1.25 without changing the saved size. Defaults contain only the original Weight, Blood pressure, Calories, Protein, Fluids, Calorie Calendar, Weight Trend and Blood Pressure Trend widgets. Training, Today's Meals, Quick Actions and Streaks are optional gallery additions; saved custom layouts are preserved.

The editor uses the same widget frames, data renderers, exact column widths and spacing as Summary. A tap opens size/configuration/removal in a separate panel. Holding any part of a widget activates dragging; ordinary swipes scroll. A floating card and insertion placeholder preview the destination with edge scrolling. Starting slot measurements make targeting stable; the underlying view order stays fixed during the gesture to preserve pointer capture, then commits on release. Visible move buttons are removed; screen-reader ordering actions remain. Done/Cancel and confirmed restoration preserve the draft boundary. Widget navigation and chart gestures are disabled inside the editing preview. Each trend owns its W-default range selector and releases its scroll lock on unmount.

## Evidence and calendar

Daily and Monday–Sunday weekly periods use device-local calendar arithmetic, an injected evaluation clock and source timestamps. Traveling can regroup historical logs. Confirmation dates and rule effective dates remain entered date keys; food confirmation additionally stores its time zone and sorted entry ID/revision fingerprint. The UI requires reconfirmation after zone changes. There is no permanent cached streak count.

Sources are shared per Summary refresh. Source-query failure yields unknown coverage rather than zero. History uses paginated queries rather than the History screen's 100-session/500-entry limits. Summary no longer queries personal records. Training queries restrict sets to relevant session IDs; streak evidence reads complete available history. Old summary/chart behavior and centralized vital sync remain available while additional history loads. Layout and Summary component lifetimes are keyed to the authenticated user.

The pure streak engine returns period evidence, progress, state and explanation. A current open period retains the previous run, a met current period provisionally extends it, off-days/pauses are neutral and closed unqualified periods break it. Unknown gaps prevent a verified consecutive claim. Best excludes the unfinished period and is labeled since tracking activation with incomplete coverage when applicable. Recent verified results can remain visible as stale during an unavailable refresh.

Logging and target habits are distinct. Calorie qualification requires explicit food-day confirmation and an inclusive accepted range; the offered ±10% is a tracking preference. Protein/fluid require positive dated targets. Fluid credit uses the shared legacy/nonalcoholic/alcohol/pending policy. Weight/BP schedules default to manual readings and require explicit opt-in; BP uses correlated pairs (or same-source exact timestamp for legacy pairs). Reminder completion uses existing occurrence matching, dated device-local schedule revisions and conservative coverage when the 800-record retention limit is reached. One-off reminders do not form a recurring streak.

## Numerical targets and writes

Migration `202609180001_summary_streaks.sql` adds account-owned activation, rule revisions, goal snapshots and food-day completions plus a nutrition-entry revision counter. All new tables enable RLS; authenticated clients may select only their own rows. Mutations use authenticated RPCs and do not accept arbitrary ownership for health records. Source-food mutation and confirmation use the same per-user transaction lock, and a trigger clears affected confirmed days on insert/update/delete, including backdating.

Follow-up `202609180002_summary_function_permissions.sql` explicitly revokes anonymous execution inherited from hosted default privileges; revoking PUBLIC alone does not remove direct role grants. The four RPCs retain authenticated execution, while the trigger function is not directly executable by either client role. Both migrations are applied to HealthHub and hosted permission/behavior tests pass.

Profile goal saving is one RPC transaction: preserve today's snapshot, update the complete existing profile goal object, and write tomorrow's target snapshot. Rule changes also apply prospectively; training changes begin at a Monday boundary. Historical goals before activation remain unavailable. Automatic protein resolves the existing rounded 0.7 g/lb formula from the most recent eligible saved weight at evaluation of that day and stores its ID and numeric result. A future automatic target is resolved when its day arrives; previously resolved dates never use a newer weight.

The migration must be applied before using new account-backed streak/confirmation features or the revised Profile goal save path. There is no silent nontransactional fallback. Existing source logs and local layout editing are unaffected by the migration's absence; failures are visible.

## Training and personal records

Training counts completed lifting sessions only with valid saved sets and nondeleted cardio with positive duration. Distinct calendar days determine training-day targets; unilateral pairs count one logical set. Duration is explicitly Cardio minutes, with no inferred lifting duration.

PR calculation v1 compares conservative normalized exercise names (case/whitespace only), muscle group and side mode. kg/lb comparisons round canonical loads to 0.01 kg and retain display units. Left/right performances are evaluated separately. Records are highest logged load with valid reps and most reps at the same canonical load, including explicit zero-load reps. The first observation is a baseline, ties do not qualify, same-session candidates are consolidated, and equal completion timestamps share an earlier-session baseline. Recalculation after focus/sync uses the remaining source logs, so edited/deleted records cannot persist as cached badges. Equipment identity is not inferred from names.

## Verification boundaries

Pure domain, storage and browser tests use synthetic data. `scripts/check-summary-sql.mjs` runs the migration and SQL/RLS fixtures in isolated in-memory PostgreSQL with a minimal baseline; it does not establish hosted-schema compatibility or replace linked migration/RLS validation. The optional runtime is installed only under ignored `dist/summary-db-check`. No Docker or real health records are required. iOS/Hermes export verifies compilation, not native gestures, accessibility, privacy-lock/resume or Apple Health.

Linked SQL/RLS verification and database lint passed on 2026-09-18 after the permissions correction. Tests supply the hosted schema's required meal ID, exercise automatic-target stability and food confirmation/invalidation/undo, verify account isolation and function grants, and roll back all synthetic accounts and logs. A subsequent query confirmed no synthetic accounts remained; final migration preview reported up to date.

## September 22 amendments (supersede earlier rule descriptions)

- Retire only saved PR entries during layout reads, preserving all other order/sizes/options; no workout records are modified. Today's Meals is optional and uses saved local-day nutrition rows, independent of reusable-label selection.
- SettingsSheet uses intrinsic content height, a safe-area maximum and a non-growing ScrollView; no per-habit fixed height or decorative drag handle. Shared renderers appear in Summary, editor and gallery.
- On Done, initialize only absent selected habits through initialize_summary_streaks; preview reads never initialize. Preserve valid existing rules, including disabled ones. Backdate new evidence-based habits only to actual available source dates; goals cannot be invented before dated snapshots. Unavailable goal history is unknown. Reminder streaks require a selected recurring reminder and remain device-local. Removing widgets does not disable habits.
- BP now counts one valid manual/imported pair per local day regardless of old weekday/import settings. Detail copy explains the changed historical interpretation; pairing/deduplication remains.
- Training retains valid completed lifting/cardio rules and Monday-Sunday boundaries. Show days this week and consecutive qualifying weeks; future days do not break an unfinished week. New rules cover available whole-week history, while edits apply next Monday.
- New calorie settings are inclusive at-or-under / at-or-over the saved numeric target and still require a nonempty, confirmed day with complete evidence. Legacy tolerance/range revisions remain readable historically; the migration adds an under revision for the next local day (or the existing future boundary). Goal edits remain prospective.
- Reviewed migration 202609220001 is now deployed and live RPC initialization/retry/permission checks pass. Secure deletion migration 202609220002 and delete-account v1 are deployed; disposable hosted authorization, cleanup, recovery and isolation checks pass. See SUMMARY_REFINEMENTS.md for evidence and rollout.

## Subsequent September 22 removal (supersedes confirmation rules above)

The user explicitly removed food-day completion and its streak. The client no longer reads or writes confirmations; saved layouts remove only the retired habit, discard empty widgets and coalesce duplicate resulting habit sets. Retired server rules/records remain intact but are not evaluated. Calorie streaks now compare nonempty saved food totals to their dated numerical rule without confirmation, including historical days. Today is provisional; later edits/deletions recalculate evidence. Empty days fail, unavailable source coverage/targets remain unknown, and this does not claim complete intake. No backend migration is required.

## Direct configuration shortcuts - September 22

Live Streaks and Quick Actions headers expose an accessible pencil action. It opens the existing configuration UI in a standalone settings sheet with a cloned layout draft, fixed Save/Cancel, validation, and confirmed discard. Previewing never initializes habits; saving uses the existing commit/persistence path. Full Summary editing retains its original Done boundary. Edit context is supplied only to live cards, keeping previews free of nested edit actions. Widget previews are labeled, use actual responsive size width, and are no longer cropped at an arbitrary height.

The full preview is accessed through Preview widget in a separate view of the same sheet, with Back to options. Rendering a variable-height card above the selection list moved rows whenever selected habits changed. Configuration now keeps a single instruction/validation row and a persistent recurring-reminder section (disabled choices until the reminder streak is selected), avoiding content-height and scroll-offset changes while toggling.

## Current-week streak indicators - September 22

Small and Large streak cards share seven Monday-Sunday columns, with weekday initials, green checks for qualifying days and day-of-month numbers underneath. Daily habits use that date's evaluated period; training uses distinct training dates from the current week's evidence, not the weekly result for each day. Upcoming days remain neutral, unknown days show a question mark and unscheduled/pre-activation days show a dash. This changes presentation only: lifetime current/best streak counts and detail history remain. The Summary card omits the activation date; details retain the best-streak history start date, which may differ by habit because available evidence and dated goals begin on different days.

## Goal-only streaks and entry dates - September 22 (supersedes logging options above)

The selectable streaks are now calorie target, protein target, fluid target and weekly training consistency. Logging-only and reminder streaks retire from saved layouts and the picker; mixed cards retain their goal selections and IDs, empty cards disappear and duplicate resulting selections coalesce. Server records are retained, while active rule loading ignores retired habits. Current-week checks remain; daily Met/progress copy is removed. Legacy weight evaluation no longer filters imported readings using an old includeImports preference, matching the combined-source rule for BP and existing goal evidence.

Health entries accept an optional local entry day, defaulting to today at save time. Weight/BP, meal, fluid, lifting and cardio forms share a native/web date control; explicit dates persist in meal/workout/cardio drafts and survive AI appends. Repositories validate dates, reject future entries and preserve the chosen local calendar day when constructing occurrence timestamps. The selected day participates in mutation identity, while resolved timestamps stay in the persisted mutation payload for retries. Weight photos use the selected entry day; gallery uploads allow their own date. This does not change goal effective-date history, source permissions or health records already saved.


## Loading coordination refinement - 2026-09-23

Summary and History use small screen-owned resource stores on top of the existing repositories and account-scoped vital cache. Each source tracks optional data, loading and error separately. Undefined data is unknown; a successful empty result is real emptiness. Background refresh retains its prior data, and a failed refresh leaves it usable with a retry indication. Calendar and daily nutrition use separate reads, so neither blocks the other. Cached readings render before Health synchronization; without cached readings, the initial vital placeholder remains until the first synchronization settles.

Keys include account and applicable local day, timezone, month, widget configuration and editing mode. Same-key requests deduplicate. An accepted mutation during a read invalidates that result and queues one reconciliation read; obsolete results never become intermediate UI values. Old-key callbacks cannot run a reader captured for a different key. Components containing account-owned state remount on account change. Foreground/focus refresh and a focused 30-second day check handle returns and midnight. Existing synchronization remains authoritative for committing local/imported vital changes before those resources are reread.

The existing serialized layout store now keeps an account-keyed memory copy for immediate return visits. A cold process shows structured placeholders while local storage resolves; it does not claim to know an unread saved layout. Card surfaces, titles and minimum sizes persist; initial content uses shape-specific, reduced-motion-aware skeletons rather than isolated spinners. A failed layout read offers retry without overwriting the stored arrangement.

A query-framework dependency would offer generalized eviction, retries and cross-screen caching, but the current bounded feature needed independent source state and in-flight coordination without replacing the offline vital store or mutation protocol. These caches are screen-owned, process-local and keyed; they do not introduce durable nutrition caches or offline remote-write support. Long-running cache eviction and sharing overlapping history reads across screens remain future optimizations.

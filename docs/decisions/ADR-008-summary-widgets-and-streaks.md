# ADR-008: Device-local Summary layout and dated streak evidence

Status: Implemented; hosted migrations and SQL/RLS verification complete. Physical-iPhone validation pending.
Date: 2026-09-18

## Presentation

Summary keeps its greeting/date/sync controls and the existing five-tab navigation. A versioned, user-keyed AsyncStorage layout contains widget IDs, ordered types, sizes and validated configuration only. Saves serialize per account, wait for earlier writes on read, preserve intentional empty layouts and do not write defaults before loading. Unknown/corrupt versions recover to a visible default preview until explicitly saved. No health records are stored in the layout.

The registry separates schemas/data needs from rendering. Adjacent Small cards pack in order; Large cards start a row. The persisted v1 value `wide` remains compatible with existing layouts and is displayed as Large. Small displays at full width below 370 points or fontScale above 1.25 without changing the saved size. Defaults contain only the original Weight, Blood pressure, Calories, Protein, Fluids, Calorie Calendar, Weight Trend and Blood Pressure Trend widgets. Training, PR, Quick Actions and Streaks are optional gallery additions; saved custom layouts are preserved.

The editor uses the same widget frames, data renderers, exact column widths and spacing as Summary. A tap opens size/configuration/removal in a separate panel. Holding any part of a widget activates dragging; ordinary swipes scroll. A floating card and insertion placeholder preview the destination with edge scrolling. Starting slot measurements make targeting stable; the underlying view order stays fixed during the gesture to preserve pointer capture, then commits on release. Visible move buttons are removed; screen-reader ordering actions remain. Done/Cancel and confirmed restoration preserve the draft boundary. Widget navigation and chart gestures are disabled inside the editing preview. Each trend owns its W-default range selector and releases its scroll lock on unmount.

## Evidence and calendar

Daily and Monday–Sunday weekly periods use device-local calendar arithmetic, an injected evaluation clock and source timestamps. Traveling can regroup historical logs. Confirmation dates and rule effective dates remain entered date keys; food confirmation additionally stores its time zone and sorted entry ID/revision fingerprint. The UI requires reconfirmation after zone changes. There is no permanent cached streak count.

Sources are shared per Summary refresh. Source-query failure yields unknown coverage rather than zero. History uses paginated queries rather than the History screen's 100-session/500-entry limits. PR queries inspect all saved sessions and sets; current training queries restrict sets to relevant session IDs. Old summary/chart behavior and centralized vital sync remain available while additional history loads. Layout and Summary component lifetimes are keyed to the authenticated user.

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

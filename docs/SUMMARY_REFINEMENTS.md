# Summary refinements - September 22, 2026

Implemented locally for Expo 57 / React Native. Existing uncommitted work, account identity and health records were preserved. Summary migration 202609220001 was subsequently deployed on September 22 to fix the missing RPC. Its exact Data API signature, initialization, repeat-call preservation and anonymous rejection passed disposable-account verification; the fixture was removed. Account-deletion migration 202609220002 is now deployed. The user explicitly approved --no-verify-jwt; delete-account v1 is deployed and disposable hosted verification passes. No real-account deletion was performed.

## Latest follow-up: food-day completion removed

The user subsequently requested removing this feature. The completion control and streak option are gone. Saved layouts remove only the retired selection, and old server rules are ignored without deleting history. Calorie Target now uses nonempty saved food totals without confirmation, for today and historical days. Today remains provisional; edits and deletions recalculate totals. Incomplete source coverage remains unknown. No backend update is needed. Verification: 187 app / 66 Edge tests and 16 Summary browser cases pass.

## Behavior

- Defaults retain Weight/BP Small, Calories/Protein Small, then full-width Fluids, Calorie Calendar, Weight Trend and BP Trend. Existing narrow-screen/large-text fallback remains. Only retired PR entries are removed from saved layouts; other widgets retain their IDs, configuration and order.
- Header editing, shared card renderers, category vector icons, meaningful Small/Large compositions, live gallery previews, structured configuration controls and intrinsic-height sheets replace duplicate headings and nested frames. Hold/tap/scroll, insertion, edge autoscroll, accessible reorder, confirmation, save and discard remain.
- Manual sync and last-success status live in Profile > Settings > Health Data & Sync. Focus/foreground synchronization and Apple Health imports continue.
- Optional Today's Meals groups actual saved nutrition rows by meal for the current local day, shows up to five meals and totals all saved meals, and opens food history. It handles unavailable coverage separately from an empty day. It never reads unsaved AI estimates.
- In AI review, labels mean reusable My Foods records. The meal switch derives all/mixed/none from the food selections. Switching it changes all foods; individual switches remain editable. Re-estimation preserves matched food choices. Every food still contributes to saved nutrition and calorie/protein totals.
- Signed-out entry uses the requested login-first fallback. Superseded by the latest first-use request: Welcome uses a device-level seen flag and returning launches go directly to sign-in. Completed setup remains per account on the server; new accounts retain optional/resumable setup. Process-only sessions, Face ID and privacy lock remain.
- Done initializes absent selected streak habits. Preview/Cancel does not initialize them. Existing valid rules, including disabled rules, remain. Daily maintenance of dated goals continues only outside the editor. Missing reminder selection is requested in widget configuration.
- Newly enabled habits use available historical source evidence; missing dated targets remain unknown. BP counts at most one valid manual/imported pair per local day. Existing BP history is intentionally reinterpreted as daily, with explanation in details.
- Training uses an accessible integer slider from 1 to 7, distinct qualifying days, weekly progress and consecutive qualifying weeks. Current incomplete weeks stay open. Existing target changes begin next Monday.
- Calorie under/over includes equality and requires a saved positive goal plus nonempty saved food totals. Edits/deletions recalculate progress; manual confirmation has been removed. Legacy tolerance/range revisions remain historical; the migration schedules the new under default prospectively.

## Account deletion and rollout

Apply migrations in repository order, including any earlier pending migrations:

1. `202609220001_summary_refinements.sql` - deployed and live RPC verified
2. `202609220002_account_deletion.sql` - deployed September 22; function v1 also deployed after explicit approval
3. Deployed `delete-account` v1 with the gateway JWT check disabled after explicit user approval: `supabase functions deploy delete-account --no-verify-jwt`. This is required because cleanup retries must work after Auth sessions/the account have been removed. The handler independently verifies bearer identity and the current password before preparing deletion. Do not ship the client deletion feature ahead of this backend.

The client never supplies an account ID to the function and contains no administrator key. Preparation requires typed DELETE and server-side password reauthentication matching the verified bearer user. The existing email/password account system is supported; dormant phone-only accounts must not be introduced without adding a corresponding reauthentication path.

A high-entropy recovery token is saved on the device before preparation; only its SHA-256 hash is stored server-side. After preparation, that token authorizes only continuation of the bound deletion. A sealed cancellation receipt prevents a delayed preparation from starting after a failed/unstarted request is dismissed. Do not log tokens or passwords.

Preparation revokes biometric device credentials and removes sessions. Restrictive access policies and per-account write guards reject further client and background writes. Cleanup enumerates Storage objects themselves, including orphaned progress photos, removes objects through the Storage API, deletes the Auth account through the Admin API, and verifies that owned database records and objects are gone before completing the receipt. Account-owned tables include profiles/setup, goals/streaks/confirmations, nutrition/reusable labels/recipes, drinks, workouts/sets/cardio, vitals/sync history, progress-photo metadata, Coach records/quotas, device credentials and mutation receipts. Shared public food/barcode cache remains.

Completion/cancellation receipts retain no user ID. Partial cleanup returns an error and is retried idempotently. The device gates the affected account UI, respects the privacy lock, and exposes explicit recovery from sign-in after relaunch. Sign-out preserves the recovery capability; only server-confirmed cancellation/completion clears it. Keep the installation until cleanup finishes. Server cleanup is request-driven, not a scheduled worker. Operational recovery of an abandoned job requires an administrator; no automatic job worker was added.

Only after verified server completion does the device drain current sync, cancel this account's reminder notifications, clear owned cached vitals/outboxes, drafts, account-keyed storage, Face ID/remembered credentials and sessions, clear disposable native file cache, and return to login. Other accounts' persistent records remain. Apple Health and exports saved outside the app are not deleted. Native disposable cache is application-wide; it contains temporary files, not persistent account records.

## Verification

All fixtures and screenshots use synthetic data:

| Check | Result |
| --- | --- |
| `npm run check` | Lint, TypeScript, 184 app tests and 66 Edge tests pass |
| Playwright Summary, refinements, AI meals and onboarding | 30 tests pass |
| Deno check of delete-account | Pass |
| Isolated PostgreSQL | All repository migrations execute; hardening, onboarding, existing streak and new deletion/streak SQL assertions pass |
| Expo iOS/Hermes export | Pass |
| Visual review | Summary, editor, meals and narrow streak sheet inspected |

Browser coverage includes defaults/restore/custom layouts/PR retirement, mixed-size drag and ordinary touch scroll, edge scrolling, save/cancel/reopen, saved meals/history, label selections, signup/returning/interrupted setup, all 11 streak sheets, Done-only activation, moved sync and deletion retry after relaunch with account-scoped local cleanup. Domain/SQL checks cover paired imported BP, distinct training days/weeks, prospective targets, confirmed inclusive calorie directions, stale food confirmation, unknown history, initialization idempotence, write blocking, orphan storage detection, cleanup failure/retry and sealed cancellation races.

Logs: `dist/summary-refinements-check.log`, `dist/summary-refinements-sql.log`, `dist/account-deletion-deno-final.log`, `apps/mobile/dist/summary-refinements-final-browser.log`, `apps/mobile/dist/summary-refinements-ios.log`. Screenshots are copied into ignored `dist/summary-refinements/`.

The isolated database harness requires the optional PGlite installation under `dist/summary-db-check` and never connects to hosted Supabase. It simulates Auth/Storage API effects; it does not prove live Supabase integration.

## Hosted deletion verification - September 22

scripts/check-account-deletion-hosted.mjs passed against HealthHub after explicit deployment approval. It creates fresh disposable accounts, uses commit_health_mutation for fixture logs, verifies missing bearer/wrong password rejection, blocks previously valid writes after preparation, removes an orphan photo and the account, verifies absent owned records, repeats completion without a session, checks sealed cancellation and confirms the other account remains intact. All fixtures are removed in finally. No real account was targeted. Log: dist/account-deletion-hosted-final.log. The first attempt failed at a prohibited direct fixture insert; all its fixtures were removed and the script was corrected to use the normal save API.

## Remaining validation

- Hosted baseline above passes. Broader live fault injection across all populated resource types and network interruptions remains additional coverage; local SQL/browser tests cover these boundaries. No real user's account should be used for tests.
- On an actual iPhone development client: light/dark/Device appearance for every streak sheet, Dynamic Type including full-width fallback, VoiceOver reorder/slider/switch announcements and modal focus, Reduce Motion, keyboard/home-indicator safe areas, tap/hold/drag/edge scrolling and chart gesture release.
- On iPhone: automatic/manual Apple Health sync, imported BP pairing, permission failures, last-success status, force-close/reopen/login/setup continuity, Face ID/privacy lock, deletion recovery and native SQLite/SecureStore/notifications/file cleanup. An iOS export verifies compilation only. The browser adapter does not validate native dark appearance, native font scaling or VoiceOver.

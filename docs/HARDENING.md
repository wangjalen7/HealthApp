# Security, consistency, and synchronization hardening

Initially prepared on 2026-09-18 without deployment. **After explicit follow-up approval, migrations 202609180003-005 and biometric-auth v6 are now deployed to HealthHub.** Ownership preflight, hosted SQL regressions, database lint and API schema-cache probes pass. No health entries were deleted or recreated; the planned version/cursor backfill and legacy Face ID revocation were applied. Earlier Summary migrations 001/002 remain applied.

## Confirmed issues and implementation

| Confirmed issue | Implemented behavior | Main files |
| --- | --- | --- |
| Session-only Face ID enrollment | Edge independently verifies the current password against Supabase Auth, checks the verified user, and supplies the resulting recent session to a service-only enrollment function. A client reauthentication flag or bearer session alone is insufficient. | `supabase/functions/biometric-auth/index.ts`, `_shared/biometric-enrollment.ts`, migration 003 |
| Reusable, unbound device credentials | Random 256-bit secrets, SHA-256 hashes in the database, user/device binding, 90-day expiry, atomic single-use rotation, password/email-change revocation, device listing and revocation. Legacy credentials are invalidated. | migration 003, mobile `features/auth/biometric-auth.ts`, `security-settings.tsx` |
| Unconditional vital upserts and deleted-record restoration | Database-owned versions and atomic compare-and-set. A stale edit conflicts; even an edit using a tombstone's latest version cannot restore it. Recovery after deletion creates a different reading ID. | migration 004, mobile `features/vitals/store-model.ts`, `sync.ts` |
| Whole-profile goal overwrites | Only changed fields are sent with their original values. Independent fields merge under a database lock; competing changes to the same field conflict. Calculation metadata stays coupled to the relevant goal. | migration 004, mobile `features/goals/repository.ts`, Profile |
| Unversioned workout replacement and separate session/set creation | One transaction validates ownership/version and writes the session, sets, and operation receipt. Invalid sets roll back the session too. The RPC returns the authoritative session and sets. | migration 004, mobile `features/training/repository.ts` |
| New IDs on uncertain retries | A durable operation ID and frozen request precede the first attempt. Server receipts are scoped by user and ID; incompatible payload reuse is rejected. Retrying returns the original result. Separate identical entries use different operations. | migration 004, mobile `lib/mutation-model.ts`, `mutations.ts`, tracking repositories |
| Independent child ownership checks | Composite workout-set and linked progress-photo foreign keys enforce parent ownership. Photo creation also requires an active weight parent. Preflight failures abort; no automatic deletion or reassignment. Existing food-profile/recipe and Coach relationships already have owner-composite constraints. | migrations 004/005, `supabase/tests/hardening_preflight.sql` |
| Fixed history limits / API-cap truncation | Workout, set, cardio, food and fluid histories use immutable ID keysets and continue until an empty page. Daily fluid/food totals and monthly calorie totals do the same. Summary reads also tolerate a service cap smaller than requested. | mobile `lib/pagination.ts`, tracking repositories, `features/summary/data.ts` |
| Separate local cache/queue writes | Native SQLite saves cache and outbox together in an exclusive transaction; browser IndexedDB uses one account transaction. Remote pages and their cursor commit together. Failed persistence does not report a successful save. | mobile `features/vitals/sqlite-store.ts`, `storage.native.ts`, `storage.web.ts` |
| Older acknowledgment could clear newer work | Immutable queued operations retain their base versions and dependencies. An acknowledgment removes only its operation, advances dependent bases and preserves newer local edits and newer downloaded tombstones. | mobile `features/vitals/store-model.ts` |
| Session/account races | Private routes remount by user; asynchronous auth initialization and preferences cannot overwrite a newer identity. Account checks surround writes, retries and sync. Confirmed revoked sessions sign out locally without clearing another session that replaced them. | mobile AuthProvider, private layout, `lib/mutations.ts`, vitals sync |
| Unsafe older API clients | Direct health-table mutations and legacy bypass RPC grants are removed. Versions are server-owned, mutation functions explicitly verify ownership and active sessions, and remaining feature writes have active-session triggers. | migrations 003–005 |

The versioned mutation path also covers mutable cardio, nutrition, fluids, saved labels, recipes and saved drinks, plus progress-photo metadata creation/deletion. Editing a meal amount no longer rewrites its reusable label. Logging a meal no longer silently archives or overwrites other saved food profiles as a side effect.

## Resulting behavior

### Sessions and Face ID

- Normal Sign out explicitly uses local scope, leaving other device sessions usable. Sign out all devices revokes all Face ID credentials first, then requests Supabase global sign-out. Revoking one Face ID credential prevents future Face ID logins; it does not itself end an already-issued session.
- Sessions remain process-only. After a force-close, password login or online Face ID credential exchange establishes a new session. An existing in-process session can retain local work while offline. Face ID privacy locking still preserves navigation and drafts during background/resume.
- The device identifier is a persistent random installation marker, **not hardware attestation**. The credential is stored with the existing iOS device-only, passcode-required, biometric SecureStore configuration. Secrets/passwords are not logged. Expiry is measured from enrollment; successful rotation does not extend it.
- A lost Face ID exchange response consumes the old secret. The deliberate recovery is password sign-in and reenrollment, rather than accepting a replay. Password/email changes revoke existing credentials. Existing enrollments require reenrollment after migration 003.
- Writes and incremental vital reads check the actual `auth.sessions` row and explicit expiry, not just JWT validity. A confirmed revoked session also triggers local sign-out on foreground. A network failure does not erase an offline session or pending work.
- Hosted simultaneous-session settings have **not** been inspected or changed. Verify that the project's single-session restriction is disabled before release. Auth policy/timeouts are owned by the hosted project.
- Existing direct SELECT policies and Storage signed URLs may continue to authorize reads until their JWT/URL expires. This change does not promise immediate revocation of every read or remote erasure of an offline cache. See Supabase's [session documentation](https://supabase.com/docs/guides/auth/sessions) and [sign-out behavior](https://supabase.com/docs/guides/auth/signout).

### Conflicts, offline work and retries

- Vitals are durable offline writes. Their UI distinguishes local/pending from confirmed sync. SQLite rollback covers creation, editing and deletion; local BP pairs are atomic, while each reading has its own cloud operation.
- Settings → Pending readings and saves shows unresolved vital comparisons and unconfirmed online saves. A vital conflict keeps the local value; the user can accept the saved version or explicitly apply/recover the local value. Recovery checks the version actually reviewed and refuses if it changed again. A subsequent server race still produces a normal compare-and-set conflict.
- Workout, meal, cardio and fluid saves require connectivity for server confirmation. An uncertain attempt remains durable and retryable after restart. Workout/meal/cardio drafts remain local; accepted receipts remain until the durable draft-clear step completes, preventing a crash between acceptance and clearing from logging the same draft twice.
- The app will not replace an uncertain operation with a changed payload. Retry its original intent or use Settings to check it first. A rejected edit keeps the current form; reopening the latest record is required before applying a competing edit. Local drafts are not shared automatically across devices.
- Settings recovery intentionally leaves an unfinished form intact and tells the user to check History before logging again. A deliberate new save after confirmation is a separate entry, even if its values match.
- Account changes leave account-scoped queues/drafts intact. Pending work can resume only after signing back into its original account. Local reminders, reminder completions, drafts and Summary layout stay device-local; cloud health history and applicable streak configuration remain shared.
- History/Summary refresh on focus/foreground, with existing date-boundary refresh. Edit forms retain their local content. There are no new realtime subscriptions; another device's changes become visible on refresh.

### Pagination and retention

Vital sync uses a per-user database counter locked through commit, a fixed upper boundary for each traversal and ordered `(change_seq, id)` pages. Updates/deletions beyond that boundary arrive in the next pass. The JSON RPC envelope avoids PostgREST silently applying a row cap to the page contents. A cursor is persisted only with its corresponding durable page.

Vital tombstones, hard-delete ID tombstones and mutation receipts have **no garbage collection in this change**. A long-offline client can resume without a deletion-retention cutoff; a fresh cache starts at cursor zero. These tables grow until account deletion. Do not add retention cleanup without a cursor-reset/reconciliation protocol. A cursor inconsistent with an administrative database restore fails visibly; automatic repair for that operator scenario is not implemented.

History ID-keyset traversal prevents offset shifts from deletions. It is not a multi-table snapshot: a concurrent new record whose ID sorts behind the current page appears on the next full refresh. Histories persist no incremental cursor, so this does not permanently skip it. Suggestions/recent-food pickers remain intentionally bounded. Composite dated streak configuration uses offset pages; concurrent changes reconcile on a later refresh.

## Database and release order

1. Review these files and take the normal backup. Run `supabase/tests/hardening_preflight.sql` against the authorized staging environment first. It reports only violating identifiers. Resolve any legacy ownership/parent violations with owner review; migrations abort instead of silently deleting data.
2. In staging, install the updated `biometric-auth` function and then migrations, in this order:
   - `202609180003_biometric_hardening.sql`
   - `202609180004_consistent_writes.sql`
   - `202609180005_remaining_ownership.sql`
   All previous migrations, including Summary 001/002, are prerequisites. Deploying the new Edge function first intentionally makes its credential actions unavailable until its RPCs exist. Use a coordinated maintenance/release window.
3. Check Edge gateway configuration: the authenticate action must be callable before a user has a session; authenticated actions validate their bearer internally. Preserve the existing deployment's appropriate gateway setting, verify all action paths, and use existing managed secrets. No new keys or invented credentials are required.
4. Run staging SQL, real concurrent-connection checks, and real Auth/Edge/PostgREST/Storage tests before production approval. Confirm two simultaneous sessions, password reset/change/email change, single-device and all-device revocation, expired sessions and credential replay.
5. Distribute the updated native app in the coordinated window. Migration 004 deliberately blocks old clients' direct health writes and old goal/workout bypasses. Old apps cannot be made safe solely through an upgrade banner; users must update. The new client on an old backend retains pending changes and reports that an app/service update is needed; it does not fall back to unsafe writes.
6. `app.config.ts` explicitly disables OTA updates. The project has EAS native profiles but no configured OTA URL/runtime/channel policy or `expo-updates` deployment. This release uses a native build. If OTA is introduced later, first configure runtime compatibility for native dependencies and release channels; do not push incompatible JS to an older binary. See [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
7. Do not roll back just the Edge function to its legacy credential logic after new credentials have been issued, or regrant unsafe table writes as a rollback. Prefer a forward fix or a coordinated maintenance rollback that also revokes affected credentials. The coordinated rollout was subsequently applied with explicit user approval. No rollback was attempted.

## Verification and limits of the evidence

| Check | Result / scope |
| --- | --- |
| `npm run check` | Lint, TypeScript, 175 app tests and 55 Edge helper tests pass after the Face ID follow-up. Covers durable IDs, lost responses/restart, changed payload rejection, expiry/account switching, draft-clear interruption, pagination and actual AuthProvider lifecycle behavior. |
| `node scripts/check-hardening-sql.mjs` | Pass. Loads every actual repository migration into isolated PostgreSQL/PGlite, then executes `supabase/tests/hardening.sql` under actual database roles. Tests transaction rollback, permission/RLS restrictions, cross-owner FK enforcement, idempotency, version conflicts, goal merge/conflict, credential rotation/expiry/revocation, sessions and 1,208 readings paged in batches of 73. |
| SQLite integration | Pass using Node's SQLite engine, the actual transaction adapter and a disk-backed close/reopen test. Injected outbox failure rolls back cache changes; tests cover dependent edits, old acknowledgments, remote tombstones, conflict-review races, cursor rollback and account isolation. |
| Playwright | All 24 selected tracking, hardening and Summary browser flows pass across the full run (23 passed) and a focused rerun (meal flow passed 3/3). The corrected meal test waits for the edited row before opening its version-bound delete confirmation. Includes 607 fluid rows with a simulated cap of 73, lost-response recovery after reload, goal conflicts and explicit vital-conflict recovery. The browser backend is a fixture; these tests establish UI behavior, not hosted database guarantees. |
| iOS/Hermes export | Pass. Bundling is not physical-device validation. |
| Actual simultaneous PostgreSQL transactions | **Not run.** PGlite serializes calls. `scripts/check-hardening-concurrency.mjs` is prepared for separate staging connections and tests competing goals, duplicate creation, workout replacement and cursor visibility. |
| Hosted Auth/Edge/PostgREST/Storage | Follow-up deployment verified: actual hosted SQL regressions and database lint pass; synthetic users rolled back and confirmed absent. Exact sync RPC and version-column API schema-cache checks pass without reading health rows. biometric-auth v6 is ACTIVE and rejects unauthenticated device listing. A follow-up disposable-account test passes actual password proof, enrollment, device binding, two session exchanges, rotation, replay rejection and revocation; the account was cleaned up. Physical biometric UI, Storage integration and separate-connection concurrency remain unverified. Deno is unavailable here, so no full local Deno handler typecheck was performed. |
| Physical iPhone | **Not run.** Verify Face ID/SecureStore rotation, lost network response, biometric changes, force-close, privacy resume, native SQLite migrations, HealthKit anchors/deletions, camera/upload retries, VoiceOver and gestures in the iOS development client. |

The deployment follow-up also passes all five hardening browser flows, including a failed workout/food query leaving fluid history and cached readings visible. Missing schema messages now explain the pending service update. The hosted synthetic-session fixture explicitly supplies created_at because the hosted Auth table does not supply the test adapter's default.

Local evidence: `dist/backend-update-check.log`, `dist/backend-update-browser.log`, `dist/hardening-check.log`, `dist/hardening-browser-final.log`, `dist/hardening-meal-final.log`, and `apps/mobile/dist/hardening-ios.log` (ignored build/test artifacts).

To reproduce isolated SQL tests, install `@electric-sql/pglite@0.5.8` into `dist/summary-db-check` with `--no-save --package-lock=false` if that ignored test dependency is absent, then run `node scripts/check-hardening-sql.mjs`. This uses small Auth/Storage schema adapters and no network credentials; it does not replace platform testing.

For concurrency testing, install `pg` into `dist/hardening-concurrency` with `--no-save --package-lock=false`. Supply an explicitly authorized staging `HEALTHAPP_TEST_DATABASE_URL` and set `HEALTHAPP_ALLOW_STAGING_TESTS=yes`, then run `node scripts/check-hardening-concurrency.mjs`. It creates synthetic accounts and cleans them up. Never use production or real health records for this fixture.

Remaining operational limitations:

- Photo bytes and PostgreSQL metadata cannot share one transaction. Stable upload paths and operation receipts make retries safe, and metadata deletion precedes object cleanup; a definitively rejected metadata save can leave an orphan object. Staging must validate upload-409 handling, deletion retries and storage reconciliation. No automatic orphan sweep or claim of atomic Storage+database writes is included.
- All rows for a requested complete history are currently collected in memory, and native vital state is serialized per account. This removes silent truncation but is not a large-dataset performance redesign. Profile on a real long-history device before expanding retention scale.
- Per-user write serialization prioritizes correctness; real concurrent-connection testing and hosted load characteristics remain release checks. The prepared tests do not establish those checks as passed.
- No MFA/assurance-level enrollment flow has been added. If hosted MFA is enabled, validate its policy explicitly before enabling this password-backed credential flow.

## Face ID prompt follow-up

The installed expo-secure-store iOS code authenticates both a protected read and an update of an existing protected value. Rotating the device secret therefore caused two prompts. The client now removes the server-invalidated old Keychain value before creating the replacement, keeping requireAuthentication and device-only/passcode-required protection. It never establishes the new session before that write succeeds. A crash or Keychain failure in that replacement gap requires password recovery, just like a lost rotation response. The native-adapter regression verifies one protected read, creation instead of update, later-login protection and failure behavior; physical prompt confirmation remains pending.

The live script scripts/check-biometric-hosted.mjs requires explicit HEALTHAPP_ALLOW_AUTH_TEST=yes. It uses existing managed CLI keys only in memory, creates a disposable Auth account, writes no health entries and removes the account in finally. Its enrollment, password rejection, rotation, device binding, replay and revocation checks passed against deployed v6. The prepared legacy-request error-response improvement has not been deployed.

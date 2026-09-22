# Email-first onboarding

## Account continuity

Current experience: email signup and password/Face ID sign-in. Phone entry, phone linking, and SMS-based Face ID setup have been removed from the app for now. No SMS provider is required. The existing onboarding migration and biometric-auth v7 remain deployed; phone authentication stays disabled.

Existing accounts were explicitly marked complete by migration `202609210001_account_onboarding.sql`. New accounts receive a separate incomplete setup row. No user IDs, existing profile values, credentials, or health records are replaced. A missing setup row or failed read is an error, never an instruction to create an account or clear goals.

Existing users sign in with their current email and password or previously enrolled Face ID. Their completed setup status, account ID, and health history are preserved. Profile Settings offers verified email changes and preferred-name/unit preferences; no phone number is requested or shown. Old /phone links redirect to email sign-in.

Email changes use authenticated updateUser and email_change verification, with a same-user check. An email is described as verified only after the expected contact is confirmed. Code-based and confirmation-link templates are supported; changing an existing address may require confirmation of both addresses. Password recovery retains the existing native reset flow.

## Flow and saved state

Signed-out app entry now opens email/password login directly (the requested login-first fallback), without trying to infer account history before authentication. Signup remains available there, and the informational Welcome route remains explicitly accessible. New-account signup -> email confirmation -> sign-in -> preferred name and setup units -> goals -> fluids -> optional Face ID/reminder setup -> saved summary -> existing Summary. Returning accounts bypass completed setup; existing loading/error guards prevent setup flashes. There is no new device introduction-completion flag because the introduction is no longer an automatic entry gate.

Email is the primary authentication method. Optional-name signup, verification and password recovery remain available. Existing sessions remain process-only. Force-close and sign-out still require authentication; onboarding progress and completion are server-side and loaded after login.

`account_setup` has owner-only reads. Changes go through `save_account_setup`, which checks a live Auth session, locks the row, compares its version and records an operation receipt. Retrying a lost reply cannot repeat or regress an update; completion is monotonic. A completed save reads the latest row before routing. Goal writes reuse `saveDailyGoals` and the hardened mutation pipeline with field-level conflict checks and receipts. Skips do not write numeric zeroes or clear goals. Calculation inputs never create vital readings. Onboarding uses the existing calorie/fluid calculations, with a neutral maintain intent; Profile's existing defaults are preserved.

Local unfinished form values and pending setup writes are scoped by user ID and validated against server revisions. OTPs, passwords and authentication tokens are not persisted in these drafts. A setup read failure shows Retry; it cannot reopen a completed user's onboarding. Provider generation checks prevent delayed reads from another account or an older revision from replacing newer state. The privacy lock also covers onboarding.

Unit preferences apply to onboarding and goal estimation; existing logged quantities retain their explicit units. The global tracking interfaces keep their current supported units. Preferred name is optional, accepts Unicode, and is used for Summary greetings. Profile Settings can edit it later. A dismissible setup card links to Profile. No legal policy URLs were available in the repository, so no fabricated policy or terms links were added.

## Face ID and deferred phone support

Onboarding uses password reauthentication for optional Face ID enrollment. Profile retains its existing password-confirmation modal. The privacy lock falls back to email/password sign-in and preserves its return path. Existing device-bound, revocable credentials and rotating-secret sign-in remain unchanged.

The earlier server SMS enrollment support and unused phone helpers remain available for a future explicitly requested phone release, but the current app offers no SMS request or phone-linking flow. The hosted phone provider remains disabled. Do not enable it without configuring delivery and validating a future client release. No new backend deployment or migration is needed for this email-first change.

## Validation and native follow-up

- Unit/adapter tests: international phone parsing, OTP/error handling, preferred-name validation, state routing, account switching, delayed read/write responses, and server-side OTP enrollment matching.
- Isolated PostgreSQL: all migrations plus existing hardening tests and onboarding owner-only reads/writes, established-account backfill, new-account state, session revocation, version conflicts, receipts and monotonic completion. `node scripts/check-onboarding-sql.mjs` (uses the existing isolated PGlite installation).
- Browser: email signup and confirmation, returning email sign-in, all-optional skip, saved goals/fluids, interrupted drafts, retries/conflicts, existing-account bypass, email updates/collisions, absent phone options, and legacy phone-link redirection. Responses use explicit synthetic fixtures.
- Visual inspection: the email-first welcome and saved summary were inspected; prior 320-point setup captures were also inspected. The existing browser color adapter intentionally uses light tokens even with a dark device preference; native iOS uses the existing dynamic colors. Native dark appearance needs device verification.
- Physical iPhone still required: keyboard/safe areas, VoiceOver, large Dynamic Type, native password-backed Face ID enrollment/privacy lock and cancellation, email confirmation/reset deep links, and permission denial. Notifications are deferred to the existing opt-in Reminders flow; camera/photos/HealthKit permissions are not requested by onboarding. Shared reduced-motion-aware press feedback and short transitions are used; a new native haptics module was not introduced.

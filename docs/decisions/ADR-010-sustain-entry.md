# ADR-010: Sustain authentication and app entry

Date: 2026-09-23
Status: Implemented; physical-iPhone and standalone launch verification pending.

## Decision

Keep Supabase authentication, protected Face ID credentials, the privacy boundary and account setup as the authorities. A small EntryProvider coordinates presentation and destination resolution around them. It does not persist sessions, grant access, repeat biometric checks or replace the existing authentication protocol.

The supplied transparent logo board is retained with pixel-preserving symbol/wordmark crops. An exact alpha mask confines a moving mint highlight to the approved S. The wordmark stays stationary. Native launch and the first React launch cover use the same asset, centered within a 112-point square, and light/dark backgrounds. The source and crop coordinates are documented alongside the assets.

## State and access

- Initial session restoration and appearance loading use the native/React launch cover. The existing process-local session policy remains; remembered identity is not a persisted Supabase session.
- `authenticating` belongs to a numbered manual, biometric, unlock or restoration attempt. The manual form animates only while its request is pending; Face ID uses the native system prompt with a static logo. Synchronous submission guards prevent duplicate requests.
- A successful full login/unlock completes the matching attempt into `resolving`. Sending signup confirmation email does not complete it. Old callbacks cannot complete a replaced or canceled attempt.
- Resolution waits for a matching authenticated account, its device-security read, privacy unlock, critical account setup and startup notification capture. It does not wait for photos, imports, health-history refresh or synchronization.
- `entering` starts after the internal destination is selected; routing occurs behind an opaque cover. The cover fades only once the destination path is active and access checks still pass. Manual success uses a 320ms fill/pulse and 200ms fade; biometric/unlock uses 180ms plus 140ms. Session-only restoration uses only a short fade. Reduce Motion removes the motion and success haptic. Supported iPhones get at most one light haptic per attempt.
- Critical read/navigation failures expose retry and sign-out. A bounded wait also exposes recovery instead of an endless entry animation. Account change, sign-out or privacy relocking invalidates the transition.

The existing privacy boundary retains tabs and drafts underneath an opaque lock screen; entry does not reset their state. Native back/foreground behavior still uses the existing Quick Log dismissal policy. Unlock results are bound to the session that requested them, and token refreshes do not invalidate an in-flight read of the same account's security preferences.

## Reminder routing and onboarding

ReminderNotificationObserver owns destination selection for both notification taps and entry completion. The existing internal payload allowlist, account binding, 30-minute pending lifetime, deduplication and serialized storage remain. Startup capture completes before choosing an entry destination. Tap capture is serialized in receipt order so slower legacy validation cannot overwrite a later valid explicit tap.

An incomplete account enters onboarding before a pending reminder can be consumed. Finishing onboarding resolves through the same coordinator, directly to the logger if the intent is still valid. Completed users enter the intended logger without mounting Summary first. Already-unlocked users navigate directly without a login celebration. Route replacement prevents several taps from stacking logger screens. Consumption rechecks the live account/lock/foreground state and restores deferred intents when needed. Opening reminders does not create entries, change entry dates or award completion; existing meal-draft protection remains.

## Alternatives and costs

A screen-local delayed `router.replace` would be smaller, but it cannot coordinate startup taps, setup and unlock without duplicated routing and intermediate Summary frames. An independent auth state machine would risk competing with Supabase and privacy policy. This presentation coordinator uses attempt IDs and the existing authorities instead.

An approximated vector S would simplify animation but change the approved silhouette. Raster-alpha masking preserves the actual asset at the cost of a small SVG animation driven on the JS thread. Motion is confined to one logo and is stopped on cleanup. The success scale/fade use the native driver on iOS; the browser uses its supported driver.

Two Expo SDK 57 modules, splash-screen and haptics, are added. The splash configuration and native modules require a new iOS binary; reloading an older development client is insufficient. Expo documents that development clients do not fully reproduce standalone splash behavior, so final launch continuity must be checked in a standalone build. Existing bundle identifiers, auth callback schemes and deployment identity remain unchanged.

## Verification

Synthetic browser coverage checks pending animation and button geometry, duplicate-request protection, direct reminder entry without mounting Summary, critical setup failure/retry, signup confirmation, onboarding deferral, dark/compact appearance and Reduce Motion. Existing auth, onboarding, reminders, deletion recovery and hardening regressions are also run. Native-adapter tests retain credential binding, token rotation, cancellation and privacy behavior. Test counts and artifact paths are recorded in STATUS.md and IMPLEMENTATION_LOG.md.

Remaining device checks: real Keychain/Face ID cancellation and credential exchange, notification cold launch, VoiceOver/Dynamic Type, keyboard insets, haptic feel and standalone splash alignment in both appearances. Browser screenshots and iOS export do not certify these.

References: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [SplashScreen](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/), [Haptics](https://docs.expo.dev/versions/v57.0.0/sdk/haptics/).

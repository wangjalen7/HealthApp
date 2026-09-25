# Sustain App Store privacy, accessibility and user-control review

**Review date: September 25, 2026. Status: implemented locally and tested; public release remains blocked by the decisions and device/operational checks below.** This is not a legal-compliance certification or a guarantee of App Review approval.

The review started from `main` at `088f60cb8b001cfa669a21f3250426c8a0067d20`, including the existing uncommitted work. Earlier branding, entry/Face ID, History styling, loading, calorie-option and email-template changes were preserved. Findings refer to the resulting working tree rather than pretending the commit alone represents the reviewed product. No commit, push, service deployment, legal publication, App Store submission, production-user mutation or contract acceptance was performed.

Read alongside:

- [Applicability table and official sources](PRIVACY_APPLICABILITY.md).
- [Data/provider inventory, retention and operating procedures](PRIVACY_DATA_AND_OPERATIONS.md).
- [Shared draft legal content](../legal/policies.json), [unresolved release facts](../legal/release.json) and [legal publishing workflow](../legal/README.md).

## What changed

| Area | Implemented locally | Boundary / remaining work |
| --- | --- | --- |
| Privacy & Legal | Settings controls and seven shared-source document pages; available before signup and signed out; generated standalone public pages and license notices | Documents visibly remain drafts. Operator, contacts, audience, territories and effective terms not invented. Nothing hosted |
| Specific AI permission | Current disclosure/version required before provider use; server saves minimal latest receipt per purpose; meal and workout choices start off and reset after attempts; history is a separate optional choice | New migration plus both AI functions require authorized coordinated deployment. A protocol flag cannot prove a malicious client displayed a consent screen |
| AI minimization | Workout context excludes unrelated profile/history data when history is declined; structured identifiers scrubbed; tools restricted; old general-chat requests and old thread reuse rejected | Free text/photos can remain identifying. Provider terms, retention and transfers require production-account review |
| Privacy controls | Generic local notification previews by default, opt-in detailed text; clear this device's unfinished drafts; delete saved cloud planner data; links to export, permissions and account management | Provider erasure, other devices' drafts and previously saved logs are distinct. Already displayed notifications cannot be recalled |
| Native data protection | SecureStore failure no longer falls back to ordinary storage. Credentials use device-only accessibility. App-data backup-exclusion plugin runs before React, with a fail-closed startup path | Rebuild required. Swift/native behavior, restore behavior, previous installs and existing backups unverified on iPhone |
| Native permissions/network | Accurate HealthKit/photo/camera purpose strings; unused microphone declaration removed from both relevant plugins; broad ATS exception limited to development | Final archive and device permission-denial tests required. No new HealthKit types or iOS tracking prompt added |
| Photos | Strip JPEG metadata after re-encoding, including later metadata segments; best-effort deletion of app-cache intermediates; previews use prepared bytes; new uploads use short cache headers | Never deletes original library assets. Pixel content remains sensitive. Old cached objects/OS/provider copies are not retroactively erased |
| Apple Health | Explicit notice that selected imports are synced to Supabase; disconnect drains active import before persisting off | OS permission revocation and original Health data are separate; disconnect is per device |
| Export | Adds onboarding/streak state, latest AI receipts/usage and allowlisted local settings/pending data; stable per-table pagination; account checks through archive/share; stronger CSV formula guard; unique temporary archive name | Requires new server table/grants. Not a transactionally consistent snapshot or every infrastructure/security record; large exports still need scale work |
| Accessibility | Shared sheet heading focus, web focus restoration and keyboard outlines; less ambiguous modal background; darker/lighter blue contrast tokens; chart values/date navigation without gestures; visible widget move controls | Native VoiceOver restoration, largest Dynamic Type, Switch Control, Voice Control, keyboards and all color pairs need device verification |
| Release safeguards | Public legal build and production EAS config refuse unfinished release metadata/draft sections; no unfinished mandatory legal agreement added | Gates are engineering checks, not legal approval. Deliberately customized pipelines can bypass them |

## Current feature review

Authentication uses email/password, verification/recovery routes and optional revocable Face ID device credentials. Onboarding follows first authentication and permits optional goal/personalization steps. Earlier Face ID/session-entry fixes remain intact; this task adds fail-closed secure-storage behavior rather than changing the biometric exchange protocol. Sign-out is not a complete local-data wipe. Native privacy lock behavior and credential persistence need a real-device regression after rebuilding.

Logging supports manually dated vitals, food, fluid, lifting and cardio records; offline persistence is feature-specific. Vitals use a durable local outbox and cloud synchronization, while other forms use their own draft/pending mutation paths. Avoid describing the entire app as equally offline-capable. Profile includes goals, personal information, device/security controls, Apple Health, export and deletion. Reminders are local and live under Track; medication/supplement recurrence is not a cloud medication service. The blank tab remains a coming-soon screen, not a shipped feature.

Summary provides configurable widgets, goal streaks and trends. Logging streaks and food-day-completed UI were previously removed, but legacy database fields can still exist and are now included in export. Charts use aggregated windows; the new text alternative explicitly describes those same aggregates and directs users to History for individual readings. A visible BP category does not diagnose a condition, and averaging may obscure individual high values.

Goal helpers use the existing shared calculation/validation model, not a new clinical engine. Calorie options derive from saved maintenance estimates, with adult-input bounds, loss-rate constraints and checks against unsuitable low-BMI loss targets. This does not establish clinical validation or guarantee a loss rate. Manual goals remain available. Fluid and calorie estimates can be unsuitable in pregnancy, illness, medication use or other circumstances; retain concise contextual limitations and have a qualified reviewer assess claims/target ranges for the chosen audience. The separate Health & AI page does not excuse unsafe in-feature behavior.

AI meal responses are schema-validated and reviewed/edited before foods enter a meal; photo recognition cannot reliably infer hidden ingredients, allergens or cooking fats. Workout generation fills editable drafts, not completed exercise records. Existing refusal/caution handling is useful but not a medical safety certification. The supported planner no longer accepts the legacy broad-health chat route on the prepared backend. No diagnosis, emergency monitoring, clinical research, public social sharing, payment system or advertising product was added.

## Accessibility journey audit

WCAG 2.2 AA is an engineering reference, with WCAG2ICT/native guidance; it is not asserted as the exact legal standard for every market. Current browser evidence checks functional and visual behavior, not the iOS accessibility tree or actual assistive-technology usability.

| Journey | Source/automated evidence | Required physical-device evidence before claiming support |
| --- | --- | --- |
| Signup, login, recovery, Face ID fallback | Existing labeled fields/actions; specific errors; signed-out legal entry; synthetic signup and optional onboarding checks; native credential adapter regressions | VoiceOver focus after navigation/errors; password autofill; keyboard avoidance; Face ID cancel/failure/password fallback; interruption and app-lock timing |
| Onboarding and goals | Optional steps/manual alternatives; short-viewport fields/actions; shared helper validation and existing domain tests | Largest accessibility text; calendar picker announcements; no clipped multi-line options; focus when errors occur; unsupported audience/goal messaging |
| Summary widgets/charts | Existing accessibility actions plus visible Move earlier/later; chart text/date buttons outside gesture capture; web sheet focus/return tested | Move widgets with Voice Control and Switch Control; reading order after movement; data/units understandable in VoiceOver; no gesture-only range selection |
| Logging/history | Shared fields, entry dates, explicit edit/delete controls and source labels; photo/browser regression checks | Long names/units at largest text; hardware keyboard; accessible save/error/success feedback; virtualized list reading; individual photo controls |
| Reminders/medications | Generic preview default, labeled switch; full-screen editing and confirmation; compact dark/large-text browser checks | iOS notification denial, detailed/generic Lock Screen behavior, tap routing, calendar/time-picker accessibility, no duplicate modal announcements |
| AI inputs and review | Separate off-by-default processing choice and optional history; validation; cancel/late-result handling; editable output | Switch state announced, busy state clear, focus reaches error/review after request, all foods/fields usable with VoiceOver and larger text |
| Settings, legal, export/delete | Shared section/row controls, signed-out pages, keyboard focus outline and sheet heading focus; confirmed/recoverable delete; structured export checks | Native modal focus restoration and modal isolation, share sheet return, secure password re-verification, interrupted deletion/recovery announcements |
| Motion, loading and colors | Existing entry/skeleton Reduce Motion branches preserved; date/data alternatives and textual status prevent color-only meaning; improved shared blue tokens | OS Reduce Motion toggled during use, all loading/success transitions; light/dark Increase Contrast, Differentiate Without Color, button/translucent/disabled-state contrast |

No VoiceOver, Larger Text, Voice Control, Switch Control, Reduce Motion or other App Store accessibility label should be selected solely from these browser tests. Record an iPhone model/iOS version, build identifier, tester, supported text settings and pass/fail for each critical task. Because the config currently supports iPad, validate iPad layouts/interaction too or explicitly reconsider device support before submission. Native screen-reader focus restoration is a known verification gap; do not claim it was proven by browser `.focus()` assertions.

## App Store submission preparation

Draft App Privacy mapping below is based on source data flows, not an App Store Connect submission. Supabase account-linked data is linked to the user even if an OpenAI payload omits their email. Optional AI/photo features do not automatically qualify for Apple's narrow optional-disclosure exception. Final responses must cover vendor collection and actual production settings. [Apple questionnaire guidance](https://developer.apple.com/app-store/app-privacy-details/).

| Candidate questionnaire category | Repository evidence / proposed treatment |
| --- | --- |
| Name, Email Address, User ID | Optional name and account identity collected for functionality; linked |
| Health and Fitness | Cloud vitals, imported readings, goals, food/fluids and training; linked; primary functionality |
| Photos or Videos; Other User Content | Optional progress/meal images and notes/preferences/generated records; functionality; account-linked processing must be assessed end to end |
| Device ID | Random biometric enrollment device identifier stored server-side; functionality/security; linked. Not IDFA |
| Other Usage Data / Product Interaction | AI quotas and operational feature requests; choose exact current taxonomy based on records and provider logs; no marketing analytics observed |
| Diagnostics / Performance Data | Provider status/latency/request metadata and hosted logs; evaluate linkage and applicable categories with live retention/configuration |
| Phone Number | Current UI does not collect new phone signup data; historical identities/server compatibility exist. Verify release flows and retained account population before final answer |
| Sensitive Info / Customer Support / Other Data | Free-text limitations can reveal sensitive characteristics; proposed future support handling needs classification. Review actual questions and optional-content processing; no biometric template collected |
| Location, Contacts, Audio, Purchases, Advertising Data, Tracking | No dedicated collection/features observed. No location/microphone/contact permission needed. Provider IP/security logs still require assessment; do not mislabel inferred geography without evidence |

Submission checklist:

- Approve and host stable Privacy Policy, separate health notice if required, Terms, and a functioning support URL/contact. Test unauthenticated access, host logs, links, 200% text and dark/narrow layouts. Current pages are local drafts only.
- Inspect the final Xcode archive's privacy report, linked SDK manifests/signatures and required-reason APIs, especially file timestamps/storage preferences and Expo/React Native dependencies. Do not invent reason codes from dependency names. The installed AsyncStorage package includes a manifest; this alone does not verify the aggregate binary.
- Verify HealthKit entitlement/read-only purpose strings, absence of microphone permission, release ATS protection and backup exclusions in the actual installed build. No health data in iCloud backups should be assumed until tested.
- Verify account deletion/recovery using a disposable account on the deployed candidate. Supply safe review access and synthetic health records, never the owner's real account or screenshots.
- Choose intended minimum age and App Store age-rating answers separately. There is currently no approved app-wide audience decision; calculator input limits are not an age gate.
- Review descriptions/screenshots/AI claims and all medical interpretations. Do not claim clinical accuracy, guaranteed weight loss, HIPAA compliance, zero provider retention or complete accessibility without evidence.
- Review `ITSAppUsesNonExemptEncryption=false` against actual final cryptography/distribution. HTTPS/Keychain usage is not by itself a completed export-compliance determination; obtain the appropriate owner answer and Apple documentation if needed.
- Current email/password + device biometrics does not implement third-party social login. Reassess Sign in with Apple if primary-account social login is added. Purchases/subscription cancellation/restoration and public-UGC moderation are outside current scope; revisit before introducing those features.
- Generated notices cover 597 installed production/non-development package entries, with 67 entries lacking discovered license text. Resolve missing notices and inspect actual native linkage, transitive license obligations, logos, fonts/SF Symbols and image rights. Review Open Food Facts database/content attribution and share-alike obligations for caching/distribution; generated npm notices do not satisfy those rights automatically.
- Determine regional trader/business disclosures and consumer terms before adding markets. Do not infer approved global distribution from an English UI or US-hosted database.

## Evidence and limits

All functional tests used synthetic accounts/data and mocked provider responses. No paid OpenAI calls or real HealthKit/photo collection were used. Local ignored `dist/` logs/screenshots hold reproducible evidence; they are not source-controlled production audit records.

| Evidence | Result / limit |
| --- | --- |
| `dist/privacy-final-check.log` | Root lint/strict TypeScript and 256 app / 70 Edge tests passed. Includes native-storage failure, import/disconnect race, mounted-draft reset isolation, JPEG metadata, path-bounded cache cleanup, export scope/CSV, notification projection and AI consent/provider boundaries |
| `dist/privacy-sql.log` | Every migration executed in isolated PGlite PostgreSQL with existing hardening/onboarding/streak checks and new consent RLS, own-account planner cleanup, guarded late write and account cascade checks. Not a hosted two-client concurrency proof |
| `apps/mobile/dist/privacy-final-browser.log` plus `privacy-retry-browser.log` | 16 distinct privacy/AI/planner cases passed across main run and corrected retry rerun. Initial two failures were test expectations that retries still had permission; tests now explicitly require a fresh choice |
| `apps/mobile/dist/privacy-journey-browser.log` | 10 additional shared-component journeys passed: signup, short onboarding, Profile/save recovery, optional-photo export, photos, compact reminders, confirmation and medication modal continuity, Summary editing |
| `apps/mobile/dist/privacy-last-browser.log`; `privacy-draft-browser.log`; `privacy-planner-final-browser.log` | Final representative reruns passed after renewed planner permission and paired action-color updates; one additional journey verifies clearing a retained logging form cannot restore its deleted draft. Synthetic backend fixture/role selectors were corrected before the passing draft run |
| `dist/privacy-contrast.log` | Opaque shared foreground/background checks; action blue/purple pairs meet 4.5:1 in both themes. This does not certify every translucent, disabled or semantic color combination |
| Earlier `apps/mobile/dist/privacy-browser.log` / results | Deletion-recovery scenarios also passed in initial targeted run. Old planner selectors/consent assumptions were corrected and superseded by passing reruns; do not count failing runs as evidence of success |
| `dist/privacy-public-check.log` | Nine standalone pages verified: local valid links, no scripts, draft notices, 320px dark and 200% text with no horizontal overflow. Visual screenshots inspected. Publishing remains blocked |
| `apps/mobile/dist/privacy-native-config-check.log` | Introspection confirms no microphone purpose string, release/preview arbitrary loads disabled, HealthKit entitlement and AsyncStorage backup exclusion. Does not compile Swift or validate installed file attributes |
| `apps/mobile/dist/privacy-ios.log` | Local iOS/Hermes export passed. No EAS build, signing or installation performed |
| `dist/privacy-release-gate.log`; `apps/mobile/dist/privacy-production-gate.log` | Expected refusal to publish/build production with draft legal facts. Preview/development remain available |
| `dist/privacy-hosted-migrations.log`; `dist/privacy-hosted-functions.log` | Read-only hosted inventory: 36 prior migrations match through `202609220002`; `202609250001` is local only. Existing functions active: barcode v13, biometric v7, meal v16, coach v16, delete-account v1. These version numbers do not prove hosted source equivalence |

Accessibility screenshots were inspected for signed-out legal content, narrow dark layout and chart-sheet date controls. No claim is made about physical VoiceOver, real permissions, photo GPS stripping on HEIC/camera input, Swift compilation, iCloud backup/restore, actual notification delivery or live cloud deletion in this task.

## Prioritized release blockers and rollout

**P0 — owner/legal decisions.** Supply operator/legal name and location, monitored support/privacy contacts, launch countries/states, audience/minimum age and monetization. Confirm state consumer-health/California CMIA applicability, required permissions/authorization, provider roles/contracts/transfers and actual retention. Finalize terms/EULA approach and policies; current placeholders must not ship as effective legal text. No response to these questions was assumed.

**P0 — backend/client coordination.** Migration `202609250001_privacy_controls.sql` and updated `coach-chat` / `estimate-meal` functions are prepared only. Export expects new tables/grants; planner deletion expects the new RPC. Until deployed, these controls may report that the service needs updating. Existing hosted AI functions do not yet enforce this task's receipt/version rules. In a later authorized rollout: review/apply migration first; deploy both AI functions; release/rebuild updated client; test with disposable accounts. Old clients will be refused by the new AI endpoints until updated. If sequencing creates a gap, keep public AI access closed during it. This task did not make that operational change.

**P0 — native verification.** A new iOS build is required for purpose strings, ATS and the backup plugin. Verify native Swift startup and file backup attributes with seeded synthetic data, secure storage failure/fallback, Face ID persistence/lock, denied/limited HealthKit and camera access, selected-photo behavior and metadata, local notifications and complete accessibility tasks. If protection fails, diagnose the safe native startup screen; do not bypass it to release unprotected health storage.

**P0 — operations.** Establish functioning signup/recovery email, request handling, incident contacts and a tested backup/restoration/deletion plan. Previous default email-template customization remains deferred by the user; no provider/billing changes were made. Decide retention and safe purge/reconciliation jobs before claiming a schedule. A backup-restore deletion ledger and restore drill remain unimplemented.

**P1 — submission evidence.** Resolve license gaps, inspect final SDK manifests/signatures, validate archive privacy categories, support/review access, age/encryption/trader answers and health claims. Only publish and submit after the owner approves the actual reviewed documents/configuration in a separate task.

**P2 — growth and maintenance.** Improve snapshot/streaming export for large accounts; bound caches/history; design retry/tombstone expiry with an offline cutoff; rate-limit public deletion-recovery endpoints and reconcile abandoned photo uploads. Add capacity/monitoring without health-payload logging. These are practical future scaling steps, not evidence that the personal-app implementation already supports unlimited users.

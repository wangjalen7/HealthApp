# Apple Health Steps

Implemented 2026-10-11. The optional goal migration is applied to HealthHub. Step history is read and cached on this iPhone only; the optional numeric goal uses normal account synchronization.

## Use

- Summary > Edit Summary > Add widget > Steps. Small/Large, move, remove, Done and Cancel follow the existing editor. Existing default layouts are unchanged.
- Tap the entire Steps card, or open Workout > Steps even when the widget is hidden. Profile > Apple Health manages the shared connection.
- Connect Apple Health from Steps or Profile. Both use one read-only request for steps, weight/BP and paired pulse. Step totals remain device-local; the connection disclosure identifies the other readings that synchronize. Existing connected users can update access in Profile without resetting cached history.
- Add/edit/remove the optional goal in Profile > My Goals > Steps or from the detail screen. Leave the manual value blank to remove it. No default target is assigned.
- D shows the selected day's total and hourly bars; W/M show daily bars; 6M shows weekly daily averages and Y monthly daily averages. Longer windows end after the selected month. Overall averages use available completed days, including explicit zero and excluding missing days/today. Tap a bar for an on-chart popover; VoiceOver adjustable actions and browser arrow keys also select bars. Period arrows and tapping the historical date return to the current period without future navigation.
- Pull to refresh; stale cached data remains available if a query fails. Only an actual pull gesture starts the refresh indicator; range/date/bar actions keep the chart in place. Access updates and disconnect are consolidated in Profile > Apple Health. Empty results do not claim permission was denied or history never existed.

## Query, calendar and cache

See [ADR-011](decisions/ADR-011-device-local-apple-health-steps.md) for exact cumulative-query, overlapping-source, timezone, averaging and cache decisions. The store re-queries the recent eight calendar days rather than adding deltas to prior counts. Older selected periods are queried on demand. Query errors preserve the previous successful totals. Cached availability distinguishes a source-provided zero from no result. Concurrent requests serialize writes and replace rows by interval start; late responses cannot cross account/date/zone UI scope. Account deletion drains pending permission/query work before clearing device keys.

## Verification

- Pure model/cache tests: completed-day denominator, explicit zero, missing/current/future periods, Monday weeks, leap months, month/year transitions, 23/25-hour DST days, replacement/deletion, deduplication, freshness, restart/account/zone scope, concurrent refreshes, corrupt storage, failure preservation, disconnect and cleanup draining.
- Mocked native adapter verifies read-only permission keys, `cumulativeSum`, `count`, hourly/daily intervals, date filters and merged totals. Native-host lifecycle test verifies cached-first loading, foreground/pull refresh and suppression of late previous-account results. These do not access a real Health store.
- Browser journeys use synthetic cached steps. Cover discovery before connection, add/resize/reorder/remove/reopen, hidden-widget Workout navigation, correct return destinations, true over-goal count with capped progress, D/W/M/6M/Y coverage/averages, on-chart selection and stable chart bounds, historic navigation, optional goal validation/save/edit/remove/reload and light/narrow dark layouts. Existing Profile/Summary regression journeys cover other goals, exports, charts, streaks and layout behavior.
- All 38 migrations and existing hardening/onboarding/streak/privacy SQL fixtures execute in isolated PostgreSQL. The step-goal SQL fixture checks null defaults, CAS, retry receipts, old-client preservation, validation, removal, RLS and anonymous rejection. The hosted check uses one disposable account and removes it after verification; no real-user health records are read or changed.
- Local iOS/Hermes export and native config introspection verify module resolution, the HealthKit entitlement, the updated step read-purpose description, and absence of a Health write description/background-delivery entitlement. A bundle export is not a native build or device test.

Evidence is under ignored `dist/steps-*.log`; screenshots are in the focused Playwright output. Current results are recorded in STATUS.md.

## Native release and remaining checks

The installed bridge already exposes cumulative statistics, so there is no new native dependency or custom bridge. `app.json` updates `NSHealthShareUsageDescription` to explain steps. Install a rebuilt iOS client to receive that native permission copy and the other already-pending native configuration changes. A Metro reload delivers JavaScript to a compatible development client but cannot change its compiled permission description. Expo Go and web cannot read HealthKit.

From `apps/mobile`, the existing development-build command is `npx eas-cli@latest build --platform ios --profile development`; install the resulting Sustain Dev build, then start Metro from the repo root with `npm run dev -- --dev-client`. No cloud build was started by this task.

Physical-iPhone verification remains open:

1. Compare today's and several historical totals and hourly bars against Apple Health, including days when both phone and Watch recorded overlapping steps, a phone-only period, late Watch sync, a manually corrected/deleted step record, and source-priority changes. Confirm refreshed totals replace prior values.
2. Connect for the first time; allow, decline, revoke and restore Steps access. Confirm unavailable/empty/limited history stays neutral. Test a locked device and recovery after unlock. Confirm the unified request lists only steps, weight/BP and paired-pulse read access, with no write access. Verify existing vitals-only connections can add steps and that unified disconnect stops both readers.
3. Verify offline launch from cache, foreground refresh, midnight rollover, device-zone travel, Monday/week/month boundaries and DST changes against the device Health store.
4. Save/edit/remove the goal, kill/reopen, sign out/in and switch accounts. Confirm counts stay on the device, other goals/records/streak progress remain intact, and explicit account deletion cannot be followed by an old queued cache write.
5. Check VoiceOver adjustable actions/popover announcements, large Dynamic Type, Reduce Motion, narrow-screen layout and physical chart touches in light/dark appearance. Automated browser/native-host checks do not certify native accessibility or touch behavior.

There is no connected physical iPhone/Watch in this execution environment, so none of these device comparisons or native permission flows is claimed as passed.

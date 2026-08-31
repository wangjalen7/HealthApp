# ADR-002: Read-only, source-aware HealthKit imports

**Status:** Accepted — 2026-08-30

## Decision

Use a native iOS adapter backed by `@kingstinct/react-native-healthkit`. Request read access only when the signed-in user taps **Connect Apple Health** in Profile. For the initial integration, import only the latest year of weight and blood-pressure correlations during Summary foreground sync.

Persist HealthKit anchors locally per app user because anchors belong to a specific device Health store. Generate stable database IDs from the Supabase user ID, record kind, and HealthKit UUID. Store HealthKit UUIDs and source names in HealthHub for provenance and reconciliation.

Keep manual and imported records as separate source records. Combined charts collapse an identical value/kind within five minutes, preferring the manual record, so averages are not double weighted. Full History retains both records and their provenance. Summary does not make users choose a source view.

Defer all HealthKit workout import. Manual cardio remains available, and generic strength workouts cannot satisfy the app's exercise/set/rep/weight model.

## Consequences

- Health data remains available offline after a successful import through the existing vital cache, while remote data is isolated by existing Supabase RLS.
- Repeated imports and retries are idempotent; HealthKit deletions are reflected without duplicating records.
- After a successful connection, Summary imports Apple Health automatically when the tab receives focus. Its single **Sync now** control runs the same combined Supabase and Apple Health sync manually; there is no separate Apple Health sync button.
- The app cannot distinguish a denied HealthKit read permission from an authorized type with no data, matching Apple's privacy model.
- Any native HealthKit package/configuration change requires a new EAS iOS build. TypeScript and UI-only changes continue through Metro from Windows.
- Web and non-iOS builds use the same Supabase/manual features and can display Apple-origin records already synced by an iPhone, but they cannot request Apple Health access or read the device Health store directly.
- Background HealthKit delivery and writing data back to Apple Health are deliberately deferred until their value and privacy impact justify the extra capability surface.

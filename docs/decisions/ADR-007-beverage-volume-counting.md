# ADR-007: Beverage-volume goals and manual drink categories

Status: Accepted and deployed to the linked backend after explicit user approval, 2026-09-17.

## Decision

Use a beverage-volume goal, not a physiological hydration score. The user explicitly excluded AI from drink logging. Categories, optional custom names, private reusable drinks, recent drinks, and unknown-drink classification work without AI or attachments.

For new logs, `beverage_volume_v1` counts nonalcoholic beverages at their consumed liquid volume. Alcohol contributes zero toward the goal while its raw volume stays in history. Other/fermented drinks require an explicit alcohol answer; Unsure remains pending with null goal contribution. Category identity and alcohol status must agree in Zod and database constraints.

Keep `volume_ml` unchanged. The additive migration adds category, alcohol status, policy version and generated `counted_ml`. Existing rows and older clients default to `legacy_volume_v1`, preserving historic totals without guessing drink names. Explicit reclassification moves only the selected entry to the new policy. Saved-drink changes never rewrite previous logs.

Shared pure counting logic serves the mobile app and Coach. Water, Summary, History, daily totals and Coach separate counted, pending and alcoholic volume. Export includes raw metadata and private saved drinks. The new `saved_drinks` table uses ownership RLS, same-user/name uniqueness and archive behavior. Preset retries reuse the existing ID; saving a preset before a log prevents a failed preset save from silently creating duplicate logs.

Goal assumptions are stored in profile JSON objects. Custom goals bypass recommendation inputs. Accepting a recommendation requires a user action; no job automatically changes a saved goal. The app does not import food moisture or automatically create calorie entries from a drink category.

## Deployment and checks

Applied migration `202609170002_drink_categories.sql` and successfully ran `supabase/tests/drink_categories.sql` against the linked database. The test uses temporary synthetic tables and rolls back; it checks generated credit, category constraints, legacy preservation, reclassification and the installed ownership-policy expression. Linked database lint reports no schema errors. The final migration dry-run reports up to date.

The user explicitly approved migration application and Coach deployment, resolving the earlier automatic approval rejection. Deployed `coach-chat` through the Supabase API after the schema update; version 12 is ACTIVE with JWT verification enabled. Endpoint smoke checks return OPTIONS 200 and unauthenticated POST 401. These checks did not invoke the model or modify real health records; authenticated live chat and physical-iPhone verification remain open.


## 2026-09-17: Simpler fluid and drink flow

At the user's request, the full drink catalog now opens in a popup from Water; common and recent choices remain inline. My Drinks creation and management were removed from that screen without deleting stored presets or historical records. The fluid recommendation uses a sex/activity questionnaire and custom bypass; measured sweat loss and exercise-duration inputs were removed. Exact activity increments are transparent product planning assumptions, documented in [goal-helper evidence](../GOAL_HELPER_EVIDENCE.md).


## 2026-09-22: Persisted helper estimates and input drafts

Calorie/fluid profile JSON now retains a versioned latestCalculation snapshot independently of top-level applied-goal provenance. Calculating never changes numeric goals. Per-account local drafts hold unfinished edits; explicit recalculation and Use This Goal are distinct actions. Manual goals preserve the prior estimate. Existing beverage formulas and canonical mL remain unchanged. Loss planning uses local-calendar deadlines with exact supported rates, retaining optional comparisons. No new table or migration; see [goal-helper evidence](../GOAL_HELPER_EVIDENCE.md).

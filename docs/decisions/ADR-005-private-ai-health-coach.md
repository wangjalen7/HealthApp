# ADR-005: Private AI health coach with reviewed draft actions

- **Status:** Accepted
- **Date:** 2026-09-11

## Context

HealthApp already stores private meals, hydration, weight, BP/pulse, workouts, cardio, goals, and progress-photo metadata. A useful coach needs historical grounding without sending an unbounded raw history to a model, exposing another user's data, or writing model output directly into health history. Interactive cost must remain predictable.

## Decision

Store Coach profiles, threads, messages, pending actions, and atomic daily usage in user-owned Supabase tables. Enforce RLS and same-owner foreign keys. Authenticate `coach-chat`, query personal data through a bearer-token user client, and inject the authenticated identity server-side. Keep conversations in HealthApp and call OpenAI Responses with `store: false`.

Build a compact deterministic snapshot and expose only bounded, read-only tools. Re-check category consent for each tool call. Send at most 12 recent messages that fit the request budget plus a bounded rolling summary; allow at most three tool rounds. Treat saved notes and chat text as untrusted data. The model receives no mutation tools.

Use Luna at low reasoning for standard chat and Terra at medium reasoning for workout plans, deep reviews, and explicit current-evidence research. Keep model IDs and `AI_COACH_ENABLED` in server secrets. Enforce 30 standard and 3 deep requests per user per UTC day, output caps, conservative input budgets, no paid retries, and a provider project spending limit.

Model actions are proposals. Validate saved-food ownership and exercise history, recalculate meal nutrition in application code, show editable review, and write only to device-local Food/Workout drafts after explicit Apply/Append/Replace. Completed history continues through existing tracker controls.

Exclude raw progress photos and medication/reminder names. Suppress actions for urgent symptoms, eating-disorder risk, unsafe training, diagnosis, or medication requests. External research runs only when explicitly requested and returns clickable sources.

## Consequences

Coach can answer across long histories with controlled cost and saved cross-device context. Suggestions remain auditable and reversible before becoming a local draft. Live quality depends on funded model access and must be evaluated before enabling the rollout. Scheduled reports, multiweek programs, direct image coaching, and additional Apple Health recovery signals remain later work.


## 2026-09-17: Workout-only product entry point

The user replaced the general Coach tab with a blank placeholder and moved planning into Workout. The current app offers a three-step workout questionnaire with Science based selected by default. New requests carry validated workoutPreferences; the handler exposes only training tools, rejects non-workout actions, and applies explicit effort/rest/technique checks before producing an actionable plan. Legacy requests remain compatible for older installed clients; legacy conversations remain stored.

The planner context uses dated primary-group set counts from the past 7/28 days plus bounded recent sets/sessions and cardio. Other health categories are excluded from these requests regardless of older broader profile permissions. New plan generation uses the deep tier with a 4,000-token output cap; ordinary follow-ups retain standard routing and existing quotas. No database migration is required. Per-exercise RIR/rest/technique are persisted in local workout drafts, alongside a bounded note summary; completed workouts still require explicit logging.

See [workout evidence and design](../WORKOUT_PLANNER_EVIDENCE.md) for researched defaults, uncertainty around optimal volume, novice guidance, and verified external exercise links.

## 2026-09-18: Single-session generation into editable tracker drafts

The user replaced the remaining planner chat with direct generation into local Lifting/Cardio drafts. Generate authorizes this reversible population; existing affected drafts require explicit replacement. Completed logging still requires the tracker's save controls. There is no chat composer, conversation history selector, or separate action-review step in the current planner UI. Existing backend storage and legacy clients remain supported.

Preferences now specify one lifting, cardio or mixed session, total available time, expanded goals/styles and validated Other text. No-equipment selection is exclusive in the current client. Weekly frequency is omitted; its legacy profile field is retained only for storage compatibility. Shared guards verify section completeness and a conservative joint time budget. The backend still receives bounded training-only history and preserves effort/technique checks. Updated coach-chat version 14 is active with JWT verification; no migration is required.

## 2026-09-18: Multi-select preferences and legacy validation compatibility

Goals/styles use validated arrays and shared option catalogs. A boundary normalizer upgrades legacy singular fields and merged aliases; empty/unknown selections remain explicit errors. The single-session planner blends all selected preferences within the existing total-time and effort limits. The removed weekly-frequency profile field defaults only for legacy storage compatibility and does not return to the form. Named field validation replaces raw schema errors, before paid model requests where applicable. Version 15 is deployed without a migration.

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

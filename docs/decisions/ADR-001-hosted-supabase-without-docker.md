# ADR-001: Start with hosted Supabase and no local containers

**Status:** Accepted — 2026-08-29

## Decision

Use a dedicated hosted Supabase development project during Releases 0–1. Schema changes are reviewed SQL migrations in `supabase/migrations`; apply and validate them remotely with the Supabase CLI. Do not require Docker, WSL2, `supabase start`, or `supabase db diff`.

## Consequences

- The early project works on the existing Windows setup.
- Remote migrations and two-account RLS checks are required before using real health data.
- Add Docker/WSL2 later if local Postgres testing or edge-function emulation becomes valuable.

# HealthApp agent guide

## Start and finish every task

1. Read this file, `docs/STATUS.md`, the active release in `docs/ROADMAP.md`, and relevant ADRs.
2. Keep one roadmap item marked **In progress** at a time.
3. Before handing work off, update `docs/STATUS.md`, check off completed roadmap items, and append a dated note to `docs/IMPLEMENTATION_LOG.md`.

## Engineering rules

- Mobile is an Expo Router / React Native TypeScript app. Web is intentionally deferred.
- Use strict TypeScript, small feature-focused modules, Zod for runtime validation, and tests for pure domain logic.
- Supabase is hosted/remote during Releases 0–1: write reviewed SQL migrations and RLS policies. Do not require Docker or generate schema drift with ad-hoc dashboard changes.
- Never commit `.env`, Supabase keys beyond documented public placeholders, health data exports, screenshots containing private health data, or credentials.
- Every user-owned database record must contain `user_id` and be protected with RLS.
- Treat health features as wellness tracking, not diagnosis or medical advice.
- Prefer accessible labels, large tap targets, readable units, and reduced-motion-friendly UI.

## Verification

- Run the narrowest relevant checks first, then `npm run check` before completing a release when dependencies are available.
- Clearly record checks not run and why (for example, remote Supabase credentials are absent).

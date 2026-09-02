# HealthApp agent guide

## Start and finish every task

1. Read this file, `docs/STATUS.md`, the active release in `docs/ROADMAP.md`, and relevant ADRs. Treat `docs/STATUS.md` as the concise handoff and `docs/IMPLEMENTATION_LOG.md` as the historical record.
2. Keep one roadmap item marked **In progress** at a time.
3. Before handing work off, update `docs/STATUS.md`, check off completed roadmap items, and append a dated note to `docs/IMPLEMENTATION_LOG.md`.
4. Preserve the user's uncommitted work. Check `git status` before editing and never discard or overwrite unrelated changes.

## Engineering rules

- The product is iPhone-first. It is an Expo Router / React Native TypeScript app with a useful browser preview, but native Apple Health and camera behavior must be validated in the EAS iOS development client.
- Use strict TypeScript, small feature-focused modules, Zod for runtime validation, and tests for pure domain logic.
- Supabase HealthHub is the hosted backend. Write reviewed SQL migrations and RLS policies, and keep Edge Functions in `supabase/functions`. Do not require Docker or generate schema drift with ad-hoc dashboard changes.
- Never commit `.env`, Supabase keys beyond documented public placeholders, health data exports, screenshots containing private health data, or credentials.
- Every user-owned database record must contain `user_id` and be protected with RLS.
- Do not seed personal exercises or foods. Suggestions must come from records/profiles owned by the signed-in user unless a clearly labeled external provider is being queried.
- Treat health features as wellness tracking, not diagnosis or medical advice.
- Prefer accessible labels, large tap targets, readable units, and reduced-motion-friendly UI.

## Verification

- Run the narrowest relevant checks first, then `npm run check` before completing a release when dependencies are available.
- Clearly record checks not run and why (for example, remote Supabase credentials are absent).

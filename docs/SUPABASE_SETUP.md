# Hosted Supabase setup — Releases 0–1

1. Create a new **development** project in Supabase. Do not use production data while learning.
2. In Authentication → URL Configuration, add `healthapp://sign-in`, `healthapp://reset-password`, `healthapp-dev://sign-in`, and `healthapp-dev://reset-password` as redirect URLs. Leave email confirmation enabled. The `healthapp-dev` entries let the separately installed development client receive its own confirmation and recovery links.
3. Copy the project URL and **anon** key from Settings → API into `apps/mobile/.env` (copied from `.env.example`). Never use the service-role key in the app.
4. From the repository root, run `npx supabase login`, then `npx supabase link --project-ref YOUR_PROJECT_REF` and `npx supabase db push --dry-run`. Review it, then run `npx supabase db push`.
5. Create two test accounts. With account A, create a measurement. With account B, confirm the dashboard cannot read, update, or delete account A's row. This is the Release 1 remote RLS gate.

The project deliberately does not run `supabase start` or `db diff`: those require Docker. All schema changes must be new migration files in `supabase/migrations`.

After pulling the September 15 workout/food-label update, apply the new schema and barcode normalizer from the repository root:

```powershell
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy resolve-food-barcode
```

The two new migrations add unilateral right-side set values and servings-per-container fields. Apply them before opening a build with this app code because its workout-history and saved-food-profile queries select those columns.

# HealthApp

An iPhone-first personal wellness tracker for vitals, lifting, cardio, nutrition, goals, and Apple Health weight/blood-pressure imports. Food logging supports reusable private labels, exact serving conversions, and cached Open Food Facts barcode lookup. It is a wellness tool, not medical advice or a diagnostic device.

## Run the current app

1. Copy `apps/mobile/.env.example` to the ignored `apps/mobile/.env` and use the canonical HealthHub Supabase public URL/key.
2. Run `npm install` and `npm run check`.
3. From this repository directory (`HealthApp`), run `npm run dev -- --dev-client` and open the installed HealthApp development client on the registered iPhone. For the browser preview, run `npm run web`.

The root startup scripts select the `apps/mobile` workspace and forward Expo flags. For example, `npm run dev -- --dev-client --clear` clears the bundler cache. Run bare `npx expo start` only inside `apps/mobile`; running it at the repository root selects Expo's default `AppEntry.js` and fails to resolve `../../App` because this app uses Expo Router.

If that error is already showing, stop the old Metro server with **Ctrl+C**, then run the workspace command above and reopen the development client using the new QR code.

Expo Go and the browser preview cannot load Apple Health. The camera-enabled development client is now installed on the registered iPhone; UI and TypeScript changes normally update through Metro without a new native build. Docker, WSL2, and a Mac are not required for the current hosted-Supabase/EAS workflow.

The Supabase migrations and barcode Edge Function are already deployed to the canonical HealthHub development project. Follow [the Supabase setup guide](docs/SUPABASE_SETUP.md) only when configuring a new environment, and use [the barcode setup guide](docs/FOOD_BARCODE_SETUP.md) for deployment/validation details. The persistent [status](docs/STATUS.md), [roadmap](docs/ROADMAP.md), and [implementation log](docs/IMPLEMENTATION_LOG.md) provide the cross-session handoff.

## Project map

- `apps/mobile` — Expo Router React Native app
- `supabase/migrations` — reviewed database schema and RLS policies
- `supabase/functions` — hosted TypeScript Edge Functions
- `docs` — roadmap, decisions, status, setup, and handoff context

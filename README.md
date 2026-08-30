# HealthApp

An iPhone-first personal wellness tracker. Releases 0–1 deliver secure accounts, offline manual weight and blood-pressure tracking, cloud sync, and readable trends. It is a wellness tool, not medical advice or a diagnostic device.

## Run the first working release

1. Create a free Supabase **development** project and follow [the setup guide](docs/SUPABASE_SETUP.md).
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env`; add the project URL and anonymous key only.
3. Run `npm install` and `npm run check`.
4. Run `npm run dev`; scan the QR code with Expo Go on an iPhone.

Docker, WSL2, the Apple Developer Program, and a Mac are intentionally not prerequisites for Releases 0–1. The persistent [status](docs/STATUS.md) and [roadmap](docs/ROADMAP.md) are updated as implementation progresses.

## Project map

- `apps/mobile` — Expo Router React Native app
- `supabase/migrations` — reviewed database schema and RLS policies
- `docs` — roadmap, decisions, status, and setup context

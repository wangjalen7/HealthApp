# Food barcode setup

The barcode resolver is a TypeScript Supabase Edge Function, not a separate FastAPI deployment. The mobile app invokes it with the current user's Supabase access token; the function owns Open Food Facts requests and the server-only product cache.

## Hosted setup

Apply and deploy from the repository root:

```powershell
npx supabase db push
npx supabase secrets set "OPEN_FOOD_FACTS_USER_AGENT=HealthApp/1.0 (contact@example.com)"
npx supabase functions deploy resolve-food-barcode
```

Use a real monitored contact address in the Open Food Facts User-Agent. Do not commit credentials or local `.env` files. Supabase supplies its URL, publishable keys, secret keys, and JWKS to hosted Edge Functions automatically.

## iPhone build

`expo-camera` changes the native application binary. After installing it or changing its config plugin, create and install a new development build:

```powershell
npx eas-cli@latest build --platform ios --profile development
```

After installation, start Metro with `npx expo start --dev-client`, open Food, choose Add food, and select Scan barcode. Camera permission is remembered by iOS and can later be changed in Settings.

## Current provider boundary

- Barcode resolution: the current Open Food Facts v3.6 `GET /api/v3.6/product/{barcode}.json` endpoint through `resolve-food-barcode`, with an explicit `fields` list including the structured `nutrition` object. The resolver accepts only `result.id = product_found`, handles `product_not_found` separately, and treats any other/malformed response as a provider failure.
- Name search: **Find or add food** searches only the signed-in user's Recent and My Foods records. An unmatched non-empty name offers a prefilled reusable label; every scanned or tracked food creates or reuses a private My Foods label. Barcode/catalog identities deduplicate first, while barcode-free foods reuse a label only when all brand, serving, and nutrition content matches.
- Label management: the Food screen's **Manage labels** action is the sole place in the logging flow for editing/deleting reusable nutrition and serving data. Editing a food already added to a meal changes only amount, unit, and note.
- Repeat scan: the app checks the signed-in user's normalized barcode profiles first. A match loads that current private label without requesting or reapplying provider data, so saved corrections are preserved and no second label is created.
- Barcode input: the camera recognizes EAN-13, EAN-8, UPC-A, and UPC-E and supplies the detected type automatically. Manual entry accepts only the digits and does not require a format selector. The resolver preserves the scanned/manual value for OFF's documented leading-zero normalization, while validating UPC-E through its expanded UPC-A check digit.
- Missing barcode: OFF `product_not_found` opens an editable private label with the barcode attached. Invalid UPC/EAN input and provider/API failures remain on the scanner with different guidance; they do not create a label automatically.
- Profile identity: a user has at most one reusable profile per catalog product and per canonical non-null barcode. Barcode-free labels remain distinct by profile rather than being merged by name.
- Serving behavior: users edit structured item, weight, and volume values rather than a duplicate free-text label. A new or edited label must define a positive weight, positive volume, or positive count with a specific physical item unit such as package, piece, bar, or slice; generic `1 serving` is not a valid basis. The app generates displayed serving text from those conversions, while old/provider text remains only as an internal display fallback for legacy data. Structured `100g` and `100ml` bases map to mass and volume respectively; unresolved or conflicting provider input stays on confirmation until the user supplies a reproducible size from the package.
- USDA name search and barcode fallback: intentionally deferred to a later release.

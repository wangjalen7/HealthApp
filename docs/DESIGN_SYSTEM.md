# Interface direction

The user's preferred pre-redesign interface is the default: the existing raised Track navigation, separate Summary metrics, grouped backgrounds, outlined cards, tracker styles, and original sheet/press behavior. Do not propagate Profile's newer styles across the app.

## Focused refinements

- Profile keeps its September 16 redesign. Its semantic palette, typography and surfaces live in src/ui/profile-theme.ts. Login and Coach intentionally reuse that palette without changing the global theme.
- Login uses a compact navy brand mark, clear field labels, a white canvas, prominent sign-in action, and a separate account-creation link. Signup, password recovery and Face ID keep their existing behavior.
- Coach uses a compact toolbar, clear introductory heading, stacked suggested actions, a quiet composer and grouped setup sections. Consent, evidence, quotas and draft approval remain intact.
- IconButton provides labeled 44-point pencil, trash and arrow actions. Destructive operations retain confirmation where it previously existed. ConfirmationActions uses equal-width Cancel/Delete text buttons; trash icons belong only on the entry points that open those confirmations.
- Workout uses arrow ordering only. Regular and unilateral rows align their sets, reps and weight columns; L/R replaces the multiplication separator and additional reps scroll horizontally.
- Water's glass fills after saved totals refresh against the user's Profile goal, caps at full and animates without bounce. Reduce Motion updates immediately. No goal means no invented target.
- Protein uses a food/protein outline instead of Coach sparkles.

## Verification

Use the isolated Playwright fixture with synthetic records for screenshots and flow checks. Check repeated diagonal touch gestures including re-grips, scroll release, arrow ordering and persistence, both-side sets, failed/successful hydration saves, changed/unset goals, and edit/delete confirmations. Native iPhone gesture arbitration, tap inspection, keyboards, larger text, VoiceOver and existing integrations require a device check.

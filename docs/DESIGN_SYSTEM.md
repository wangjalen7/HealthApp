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
- Profile has Profile and Settings tabs. Settings owns Appearance, Face ID, Apple Health, and data export so identity and goal editing remain focused in Profile.
- Appearance offers Device, Light and Dark choices. iOS surfaces use semantic adaptive colors, Device follows and resynchronizes with the phone setting on foreground, and the selected preference persists locally. Accent-filled actions retain white foreground content in every mode.
- Visible interactive controls require an accessible name, selection controls expose their checked or selected state, changing status text uses a polite live region, and screen/card titles use heading semantics. Native font scaling remains enabled and Reduce Motion is honored by animated shared UI.
- ConfirmationActions uses a quiet bordered Cancel action and a soft-danger Delete action instead of two heavy elementary buttons.
- Weight and blood-pressure trends use monotone cubic paths that pass through measured points without overshooting their values.
- Food Recipes use the existing sheet, card, amount-selector and confirmation language. Creation happens within the Recipes sheet and maintains a recipe-only ingredient list, with add/edit/remove controls for exact label amounts. Saved cards show yield, ingredient count/names and per-serving nutrition; only a completed recipe is added to the meal, and logging clearly distinguishes servings from a fraction of the whole recipe.
- Find or add food displays matching saved recipes in a dedicated Recipes group before Recent and My Foods, keeping recipe provenance visible without presenting recipes as editable food labels.
- Profile goal helpers use a focused page sheet with short input groups, switchable US/metric units, selectable radio cards, one prominent preview, and an explicit Use this target/goal action. Activity is framed as a whole-day pattern rather than workout frequency, and results provide a compact tappable comparison across all four equation categories. Scientific detail stays behind How this is calculated; warnings use text as well as color, and calculated previews never silently overwrite saved goals or round unrelated canonical goals.

## Verification

Use the isolated Playwright fixture with synthetic records for screenshots and flow checks. Check repeated diagonal touch gestures including re-grips, scroll release, arrow ordering and persistence, both-side sets, failed/successful hydration saves, changed/unset goals, Settings and appearance selection, edit/delete confirmations, and accessible names for visible controls. Native iPhone light/dark rendering, gesture arbitration, tap inspection, keyboards, larger text, VoiceOver and existing integrations require a device check.

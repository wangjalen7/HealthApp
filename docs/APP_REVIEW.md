# App review — September 8, 2026

The local review covers the current app, including the uncommitted interface refresh that was already present. Testing uses the real Expo app in an isolated Edge browser with a synthetic account and intercepted Supabase responses. No personal health records were created, changed, or captured.

September 11 Coach follow-up: AI Coach now provides multi-goal consent/profile setup, saved chats, structured-history evidence, quota/retry/cancel states, and editable meal/training action reviews. The Coach home uses a compact three-action layout, hides history until requested, simplifies message surfaces, and keeps quota and meal estimation secondary. Seven synthetic Coach flows cover the 320 px layout, setup, PostgreSQL offset timestamps, exact saved-food recalculation, approval-time creation of user-requested labels, workout completion and Cancel/Append conflicts, cardio draft routing, restoration, and permanent deletion. Together with six AI meal and nine existing review flows, all 22 browser tests pass. See [AI Coach setup](AI_COACH_SETUP.md), [AI meal setup](AI_MEAL_SETUP.md), and current status for live/native checks.

## Changes made

September 10 follow-up: exercise cards now follow the pointer/finger using a measured draggable list with spring displacement, edge scrolling, reduced-motion support and accessible ordering actions. Add food and Add exercise use matching high-contrast blue buttons with white plus icons; the requested saved-exercise hint is removed. Reordering preserves edited sets and draft restoration. The pinned dependency patch and its browser-only rationale are documented in `patches/README.md`.

September 9 follow-up: corrected the repository startup instructions and added root `start`/`web` aliases with Expo flag forwarding. The old bare `npx expo start` instruction selected the repository root, causing `expo/AppEntry.js` to fail on `../../App`. Start from `HealthApp` with `npm run dev -- --dev-client` after stopping the old server. Verified the corrected server's iOS manifest selects `apps/mobile` and Expo Router, and its development bundle returns HTTP 200 (1,750 modules).

| Area              | Finding and change                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quick Log         | Replaced six tall tiles with compact icon rows and shortened the heading. Direct access now observes sign-in and biometric protection. Closing also has a safe destination when there is no prior screen.                                                                                                                                                            |
| Summary           | Kept the greeting on one line at 320 px, shortened sync text, and removed the redundant automatic “Sync complete” line.                                                                                                                                                                                                                                              |
| Icons and charts  | Fixed native accessibility/event properties leaking onto browser SVG elements and animated SVG warnings. These warnings covered the browser navigation bar. Chart points now also support Enter/Space activation. Native chart touch handling remains available.                                                                                                     |
| Accessibility     | Added a default button role, explicit browser selected/checked/expanded/busy states, and labels for auth, vitals, cardio, profile and history-edit inputs.                                                                                                                                                                                                           |
| Authentication    | Password reset validates email without requesting a password. Sign-in accepts existing passwords without applying the signup minimum. Signup retains its eight-character minimum. Password entry supports keyboard submission.                                                                                                                                       |
| Meals             | Meal choices remain at the top while foods can be added before selection; Save explains when a meal is still required. Removed the redundant meal-selection empty box, added the food icon to Add food, and retained concise draft/save feedback and wrapping action rows.                                                                                           |
| Workouts          | Save feedback remains visible after the completed draft clears. Failed set insertion removes the newly created empty session; if cleanup fails, the error explains how to recover.                                                                                                                                                                                   |
| Blood pressure    | Manually logged pulse now appears with its exact correlated reading. Matching respects user ownership and excludes deleted samples.                                                                                                                                                                                                                                  |
| Fluids            | Quick amounts show icons and selected state, with consistent three-column wrapping and 44-point targets. Following the September 9 feedback, Food History groups drinks below meals in the same daily card, reusing meal headings, row layout, timestamps and Delete styling. Daily fluid totals remain in the header; individual entries retain confirmed deletion. |
| History           | Removed redundant subtitle/swipe instructions, added a direct logging action to empty states, and corrected singular set counts.                                                                                                                                                                                                                                     |
| Browser Reminders | Replaced the unusable native time-picker form with concise iPhone guidance. Native scheduling behavior is unchanged.                                                                                                                                                                                                                                                 |
| Coach and photos  | Shortened the unavailable-coach screen and added recognizable camera/library fallback icons.                                                                                                                                                                                                                                                                         |

## Automated browser coverage

September 9 navigation/style follow-up: the Face ID gate now covers the existing navigator instead of replacing it. An app background/foreground cycle therefore retains the selected route and unsaved screen state; private dialogs hide during the lock. Two component regression tests cover repeated lock/unlock cycles and dialog concealment with native host stand-ins. These do not simulate the iPhone's biometric prompt. Quick Log also dismisses to the underlying route without forcing Summary.

Tracking screens and the food editor now share title, label, input, card, chip and action styles. Cardio has no Hide/expand control. Lifting and Food each have one Add action below the list. Browser visual coverage includes Cardio at all four widths, populated food/lifting drafts, narrow water shortcuts and consistent system-font inputs.

The suite exercises these flows through visible controls:

1. Protected Quick Log → sign-in screen → invalid reset input → reset confirmation.
2. Summary, Food, Water, Blood pressure, Weight, Workout, Reminders, History, Coach and Profile at 320, 390, 430 and 1280 px. Screenshots use reduced motion to avoid capturing transitions.
3. Water validation → quick amount → failed save → retry → Food History → cancel deletion → confirm deletion.
4. Weight and blood-pressure saves → History → pulse display → edit pulse → delete the BP group while retaining the weight.
5. New food label → serving amount → meal draft restored through navigation → edit amount → save meal → History → edit consumed amount and verify recalculated calories → delete food while preserving its reusable label.
6. Lifting with an explicit zero working weight → failed set save and cleanup → retry → cardio save → History → edit workout location → delete cardio.
7. Profile name and goal updates → browser reminder guidance → sign out.
8. Populated Summary → Quick Log dismissal → calendar back/forward boundaries → monthly chart range → keyboard point inspection → matching Food History destination.

9. Hold an exercise card → verify continuous pointer movement → drop across different-height cards → keyboard reorder → repeated drag with edge auto-scroll → restore the draft through navigation → save and verify every exercise order, rep count and weight.

The fixtures model the REST operations used by these flows. They do **not** verify the hosted database, SQL function implementation, RLS, email delivery, or provider availability.

## Running the checks

From the repository root:

```powershell
npm run check
npm run test:e2e
```

Playwright starts an isolated Expo web server on port 8082 with placeholder configuration, or reuses an existing local server. Windows uses installed Edge; other platforms use Playwright Chromium (`npx playwright install chromium`). `E2E_BROWSER_CHANNEL` can override the browser channel. The fixture intercepts Supabase traffic in either case.

Screenshots and failure artifacts are ignored under `apps/mobile/dist/e2e-results`. Production exports are ignored under `apps/mobile/dist/web-review` and `apps/mobile/dist/ios-review`.

## Verification record

- Lint and strict TypeScript: pass.
- App/domain/component tests: 100 pass.
- Edge Function tests: 35 pass.
- Production web export: passed the September 8 review; the current September 10 changes are covered by the live Expo browser suite.
- iPhone JavaScript/Hermes export: pass. This is a bundle check, not a native device test.
- Browser suite: all 19 tests pass together, including 4 Coach flows and 6 AI meal flows, with automatic startup of a fresh test server.
- Dependency patch application and whitespace check: pass.

## Remaining device and live-service checks

No signed-in disposable live test account or controllable iPhone was available. These checks remain open:

Access recheck on September 8: Windows reported no connected iPhone/iPad device; the available tools include no iOS device controller; no test-account environment variables were present. Browser mocks and bundle exports cannot close the following checks.

- Live Supabase saves, reloads, email recovery, two-account RLS, and barcode-provider responses.
- Face ID enrollment, background lock, cancellation, sign-out/sign-in and revocation on the current iPhone development build.
- Camera barcode scanning, photo selection/upload/deletion, and photo-storage restrictions.
- Notification permission, scheduling, delivery and deep-link behavior.
- Apple Health permissions, imports, duplicate prevention, deletion reconciliation and imported pulse association.
- Native keyboard/safe-area layout, Dynamic Type, VoiceOver, Reduce Motion, Quick Log detents/dismissal, chart dragging, exercise reorder/edge scrolling and photo paging.

The app changes were kept local; no deployment, schema change, or commit was made.

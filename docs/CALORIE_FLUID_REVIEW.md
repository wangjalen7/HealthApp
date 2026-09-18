# Calorie and fluid calculator review and proposal

Reviewed 2026-09-17. Status: proposal only, as requested. No application code, saved goals, schema, or hosted services changed.

Follow-up: the user subsequently authorized implementation **excluding all AI in drink logging**. This document preserves the original review; current decisions are in [ADR-007](decisions/ADR-007-beverage-volume-counting.md) and [GOAL_HELPER_EVIDENCE.md](GOAL_HELPER_EVIDENCE.md). Its optional AI proposal is not being implemented.

## Findings in the current implementation

1. **High: calorie estimates do not use the requested method.** `apps/mobile/src/features/goals/calculator.ts:81` implements the 2023 DRI adult EER equations. These are legitimate population equations, but are different from Calculator.net's default Mifflin–St Jeor resting-energy equation multiplied by an activity factor. The four DRI activity categories also have different definitions from Calculator.net's six maintenance categories; do not map them by name. For the existing test fixture (male, age 22, 187 lb, 5 ft 10 in), current inactive maintenance is 2,866.50 kcal; Mifflin with sedentary factor 1.2 gives 2,225.36 kcal. This approximately 641 kcal difference is a method mismatch, not a pounds-to-kilograms bug. The current conversions are correct. [Current equation source](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html), [requested calculator](https://www.calculator.net/calorie-calculator.html).

2. **High: aggressive loss scenarios can produce very low selectable goals.** `calculator.ts:135` subtracts up to 1,000 kcal without a minimum-intake check. `goal-helper.tsx:778` only warns for a deficit over 20%; it does not disable acceptance. Example: female, age 70, 160 cm, 55 kg, goal 50 kg. Current and goal BMI both exceed 18.5, but the current inactive EER is 1,653.45 and the 2 lb/week option rounds to **650 kcal/day**. BMI validation does not prevent this. Proposed minimum: reject app-generated targets below 1,000 kcal/day, consistent with the NIDDK planner's absolute lower boundary, and explicitly avoid describing this boundary as a sufficient or safe intake for everyone. Preserve the existing adult/BMI exclusions and review aggressive deficits separately. Do not silently clamp a low target while keeping the original weight-loss rate. [NIDDK planner](https://www.niddk.nih.gov/bwp).

3. **Medium: fluid recommendation is a lookup, not personalized calculation.** `calculator.ts:233` returns 3,000 mL or 2,200 mL by sex. Weight, exercise duration, and activity do not affect it. The beverage-versus-total-water distinction is correct. Calling this a population starting point is accurate; calling it an individualized hydration requirement is not.

4. **Medium: every logged fluid receives full credit, including alcohol.** `features/hydration/repository.ts:24` sums raw `volume_ml`. Records only store name, volume, and timestamps. Coffee counting by volume is reasonable for a beverage-intake tracker; the lack of categories means the app cannot distinguish alcohol, unknown drinks, or show caffeine/nutrition context. Water, Summary, History, daily totals, and Coach must use the same future counting policy.

5. **Low: custom goals unnecessarily require a sex selection.** `goal-helper.tsx:352` checks `fluidCategory` before accepting even a manual goal. Custom mode should bypass all recommendation inputs. Also distinguish a blank manual field from malformed nonblank input; the current parsing collapses both to `undefined` and may fall back to the population reference.

6. **Low: volume validation is unit dependent.** `features/hydration/model.ts:8` limits the entered number to 20,000 before conversion, whereas the database limits canonical volume to 20,000 mL. For example, 1,000 fl oz passes client input validation but exceeds the database limit. Validate canonical milliliters after conversion. This is a storage-validation issue, not a daily recommendation.

## Calorie implementation proposal

Default to Mifflin–St Jeor:

```text
W = kg; H = cm; A = years
male BMR   = 10W + 6.25H - 5A + 5
female BMR = 10W + 6.25H - 5A - 161
maintenance = BMR * activity factor
```

The following exact option values were verified in Calculator.net's public HTML form on the review date. Its selected default formula is Mifflin–St Jeor. [Source](https://www.calculator.net/calorie-calculator.html).

| Activity choice | Factor |
| --- | ---: |
| Sedentary; little or no exercise | 1.2 |
| Light; exercise 1–3 times/week | 1.375 |
| Moderate; exercise 4–5 times/week | 1.465 |
| Active; daily exercise or intense exercise 3–4 times/week | 1.55 |
| Very active; intense exercise 6–7 times/week | 1.725 |
| Extra active; very intense daily exercise or physical job | 1.9 |

The site also has a BMR-only factor of 1; show BMR separately rather than offering it as a maintenance goal. Its exercise definitions are 15–30 minutes elevated heart rate, 45–120 minutes for intense exercise, and 2+ hours for very intense exercise.

Retain exact internal units, round only the final displayed calories to a whole kcal for comparison, label the result an estimate, and never automatically add workout calories again. Keep a saved goal unchanged until the user selects Use this target. Save method/version and input assumptions with an accepted recommendation so future explanations can reproduce it.

For the male default example in the pasted reference (age 25, 187 lb, 5 ft 10 in), calculated BMR is 1,839.47 kcal and moderate maintenance is **2,695 kcal/day**. This is our arithmetic using the verified equation/options; no personal profile was submitted to the website. At age 22 the corresponding moderate figure is **2,717 kcal/day**. Comparisons between DRI inactive and Mifflin sedentary illustrate the product difference, not equivalence of study activity categories.

Loss options can retain transparent 250/500/750/1,000 kcal daily deficits, with unsupported targets disabled. Keep timeframe results explicitly approximate. Current gain options of +5%/+10% are a separate product rule, not a claim of complete Calculator.net parity. Advanced revised Harris–Benedict and Katch–McArdle methods are optional later work; if added, use body fat as a fraction (`percent / 100`) in Katch–McArdle.

## Fluid-goal decision

**Recommended first version: an editable beverage starting goal, optional exercise allowance, and a separate custom-goal mode.** Do not present a fabricated sex × weight × activity formula as established science.

The National Academies gives adult total-water references of 3.7 L for men and 2.7 L for women, including food; the approximate beverage portions are 3.0 L and 2.2 L. These are population adequate-intake references, not individual minimums. Preserve these as the initial baseline and explain that food water is already accounted for. Do not add food moisture to progress against a beverage-only goal. [National Academies](https://www.nationalacademies.org/read/10925/chapter/6).

Exercise losses vary substantially; measured sweat rate is more defensible than assuming that one activity label determines everyone's needs. Body size matters, but current weight alone does not establish a precise drinking target. A large isotope study associates turnover with body composition, activity and environment; water turnover is not interchangeable with beverage intake. [NATA position statement](https://www.nata.org/sites/default/files/2025-08/fluid_replacement_for_the_physically_active.pdf), [Yamada et al., 2022](https://pubmed.ncbi.nlm.nih.gov/36423296/).

Concrete product behavior:

- **Custom:** accept the entered mL or US fl oz exactly; no sex, weight, or activity requirement and no automatic exercise additions. This also accommodates prescribed limits without inventing a new medical calculator.
- **Suggested:** start with the chosen adult beverage reference. No climate input or weather integration.
- **Exercise adjustment:** offer an optional, visible allowance for additional sweating exercise, based on minutes rather than the calorie activity factor. For a simple first version, an editable **400 mL per exercise hour** can be a product planning default, rounded to 50 mL. Explicitly label this number as a rough app assumption, not a validated daily-requirement equation, a measured sweat rate, or a compulsory drinking schedule. Default the adjustment off; do not extend it automatically to prolonged endurance sessions or hot conditions.
- **Weight personalization:** use optional before/after exercise weights to estimate sweat losses, not an arbitrary multiplier on baseline body weight. Estimate liters lost as `preKg - postKg + drinksDuringLiters - urineDuringLiters`, then divide by hours. Require comparable measurements and a valid positive duration; reject implausible or negative results rather than silently converting them into recommendations. A measured rate can replace the rough exercise allowance for similar sessions. [NATA sweat-rate method](https://www.nata.org/sites/default/files/2025-08/fluid_replacement_for_the_physically_active.pdf).
- Never add an exercise allowance twice through both a usual-activity preset and a logged workout. Workout beverages already contribute to daily progress; they are not an extra credit. The baseline-plus-exercise rule remains an adjustable product estimate because the population baseline already reflects ordinary activity.
- A manual accepted goal stays fixed. Offer recalculation rather than changing saved goals silently as weight or workouts change.

Example of the proposed heuristic: 2,200 mL baseline plus a selected 60-minute exercise allowance of 400 mL gives **2,600 mL, about 88 US fl oz**. The allowance is optional. Without sweat data, do not infer that an 85 kg user needs an exact additional amount compared with a 70 kg user.

If a requirement later insists that baseline weight must always change the displayed estimate, make that a separately labeled weight-based heuristic requiring clinical review. Rules such as 30–35 mL/kg are not a validated universal sex/weight/activity beverage calculator and vary in whether they describe total fluid, beverages, or clinical maintenance. Do not combine such a rule with the full sex baseline or subtract a food allowance twice. The preferred initial design does not require baseline weight solely to give an impression of personalization.

## What drink percentages can and cannot mean

Three quantities differ: beverage volume, actual water content, and physiological fluid retention. A daily tracker should not label one as another. A beverage hydration index (BHI) compares short-term urine response with water under study conditions; it is not a universal percentage of a drink that hydrates the user.

The 2016 randomized study tested 13 beverages in 72 already-hydrated men. Four-hour urine output following coffee, cola, diet cola, tea and several other drinks was not significantly different from water. Milk and oral rehydration solution had greater short-term retention. These findings neither prove identical effects for all users nor justify fixed 60% coffee/80% soda penalties or >100% daily credit for milk. [Maughan et al.](https://pubmed.ncbi.nlm.nih.gov/26702122/).

A separate controlled crossover study found similar hydration measures for moderate coffee and water in habitual male coffee drinkers. It does not cover every caffeine dose or population. An energy-drink study found caffeine-related diuresis under its test conditions; it does not establish a universal 55% factor. [Coffee study](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0084154), [energy-drink study](https://pubmed.ncbi.nlm.nih.gov/16847703/).

Alcohol responses depend on dose, concentration and circumstances. A trial in older men found short-lived diuretic effects for wine/spirits but does not establish a universal negative percentage; it also had beer-industry affiliations. Exclude alcohol from the wellness goal as an explicit product policy, while recording volume. Do not claim alcohol contains no water or that 150 mL wine removes 142.5 mL from the body. [Alcohol crossover trial](https://pubmed.ncbi.nlm.nih.gov/28657601/).

Waterllama's public site confirms custom drinks, hydration ratios and a calculator using body measurements, sex, activity and weather. It does not publish a validated derivation for the specific percentages supplied by the user; those values should be treated as reported app behavior. [Waterllama](https://waterllama.com/).

## Comprehensive proposed category catalog

The column below is **credit toward a beverage-volume goal**, not measured hydration efficiency or water composition. `100%` means log 250 mL and add 250 mL to beverage progress. Categories not tested directly use an explicit counting convention; no clinical percentage is asserted. Store calories, sugar, caffeine and alcohol separately when known. A fluid contribution is not a nutritional endorsement.

| Category | Goal credit | Basis or handling |
| --- | ---: | --- |
| Still/tap/mineral water | 100% | Reference drink |
| Sparkling water/seltzer | 100% | Sparkling water tested; carbonation is not a deduction |
| Flavored/infused water | 100% | Beverage-volume convention |
| Electrolyte water/tablet drinks | 100% | Prepared volume; no bonus multiplier |
| Sports/isotonic drinks | 100% | A sports drink tested; nutrition separate |
| Oral rehydration solution | 100% | Tested; count prepared volume without BHI bonus |
| Brewed/instant/decaf coffee | 100% | Moderate coffee supported; variants use volume convention |
| Espresso/Americano/cold brew | 100% | Actual consumed liquid; strength does not establish a ratio |
| Latte/cappuccino/other milk coffee | 100% | Combined beverage once; avoid counting milk twice |
| Black/green/white/oolong tea | 100% | Black tea tested; other varieties use convention |
| Herbal/fruit/decaf tea | 100% | Beverage-volume convention |
| Iced/sweet tea | 100% | Iced tea tested; sugar separate |
| Matcha/yerba mate/chai | 100% | Convention; caffeine if known |
| Regular soda/cola | 100% | Cola tested; sugar separate |
| Diet/zero-sugar soda | 100% | Diet cola tested |
| Energy drinks | 100% | Volume convention, not a claim of equal retention; caffeine separate |
| Energy shots/pre-workout drinks | 100% | Actual small shot or prepared drink volume; no dry-powder volume |
| Dairy milk/flavored milk | 100% | Plain milk tested; flavored variants use convention |
| Plant-based milk | 100% | Convention; formulation-specific |
| Drinkable yogurt/kefir | 100% | Convention; log consumed beverage, nutrition separately |
| Fruit/vegetable juice | 100% | Orange juice tested; other juices use convention |
| Juice drinks/lemonade/cordials | 100% | Final diluted beverage volume |
| Coconut water | 100% | Convention; no universal superiority claim |
| Hot chocolate/cocoa | 100% | Prepared beverage volume |
| Protein/recovery/meal-replacement shakes | 100% | Prepared drink once; no bonus for protein |
| Smoothies/milkshakes | 100% | Volume convention; not a claim that these are 100% water |
| Bubble tea | 100% of liquid | Exclude pearls/jellies/uneaten ice from fluid amount |
| Kombucha/fermented drinks | Conditional | Confirm alcohol status; never infer it from name alone |
| 0.0% beer/wine/mocktails | 100% | Verified alcohol-free formulation, volume convention |
| Beer/cider/hard seltzer | Excluded | Record volume/alcohol; goal contribution 0 by policy |
| Red/white/rosé/sparkling wine | Excluded | Same policy; no negative credit |
| Spirits/liqueurs | Excluded | Same policy |
| Cocktails/alcoholic mixed drinks | Excluded | Entire mixed drink excluded under simple v1 policy |
| Broth/clear soup | Optional 100% of liquid | Explicitly choose beverage tracking; prevent duplicate credit |
| Other, confirmed nonalcoholic beverage | 100% | Unclassified volume convention |
| Other, alcohol status unknown | Pending | Save volume; leave contribution unresolved until classified |

A pending amount is unknown, not physiologically zero. Show, for example, `1,500 mL counted · 250 mL needs classification`. Historic unclassified entries should retain their old counting behavior with a legacy-policy marker; do not retroactively classify private drink names using AI.

Do not use hydration categories to automatically estimate calories. Sweetened coffee, protein shakes and alcohol can materially affect calorie totals, but category alone is not enough to assign their nutrition. An optional linked food entry should be explicit and deduplicated.

## Logging and custom-drink design

**Category first for ordinary logging; name optional.** Show favorites and recent drinks above a searchable category grid. Tap Coffee, select the amount, then Save. Keep the existing quick-water buttons. Users should not have to type "Water" each time.

**Custom drink:** name, required category (including Other), amount/unit, and optional Save to My Drinks. Example: `Morning oat latte → Milk coffee → 350 mL`. Save its default serving for one-tap reuse. Categorizing it is enough; asking the user to invent a hydration percentage adds work without reliable information.

**Other:** accept the name and volume immediately, then ask whether it contains alcohol: No / Yes / Unsure. No counts by the nonalcoholic convention; Yes is tracked separately; Unsure stays pending. Allow later reclassification and recalculate that entry. A failed classification never loses the log.

**Optional Identify from label/photo:** offer on any custom drink, not only Other. AI may suggest an existing category and extract readable serving size, alcohol content and caffeine, with user review. It must return unknown when those facts are not visible. A cup photo cannot reliably establish volume, sugar or alcohol. AI must not invent a hydration factor or change the saved goal. Manual logging must work without AI. Reuse the existing explicitly consented attachment/review pattern in ADR-004 if this is implemented.

Example presentation: `350 mL consumed · Counts 350 mL toward your fluid goal`. For alcohol: `150 mL wine logged · Alcohol is tracked separately`. Keep the primary progress label **Daily fluids**, rather than claiming the user is "87% hydrated."

## Implementation boundaries and verification plan

- Add stable category IDs and a versioned counting policy. Keep `volume_ml` as raw intake. Store a per-entry category snapshot, policy version, contribution status and credited milliliters, with null for unresolved credit. Do not overwrite raw volume. Avoid calling the field `hydration_percent` if it represents an app rule.
- Add optional private saved drinks with `user_id`, RLS and archive behavior. Editing a saved drink must not rewrite previous logs. Explicitly reclassifying one log can recalculate that log with provenance.
- Preserve existing records under `legacy_volume_v1`; new entries use the chosen policy. Explain any mixed-policy historic view. Use a shared calculation/read model for Summary, Water, Food History, daily totals, Coach and export; do not update only the Water screen.
- Store goal source (`custom` or `suggested`), formula/policy version, accepted assumptions and timestamp. If daily exercise-adjusted goals are introduced, snapshot the daily denominator so past progress does not change with today's workout or profile.
- Test Mifflin for both sex coefficients, all six factors, US/metric equivalence, display rounding, loss limits and no double exercise additions. Use independent numeric fixtures, including the 25-year-old example above.
- Test custom-goal bypass, malformed versus blank input, exercise adjustment on/off, canonical units and preserved goals. Test sweat-rate arithmetic independently if the advanced flow ships.
- Test raw/credited/unknown totals, alcohol policy, legacy preservation, category edits, no food/fluid double logging, normalization before volume limits, RLS and all aggregation surfaces. Verify quick water, custom drink, Other and optional AI review on a narrow phone screen and on the native device.

Review validation: the 10 existing goal-calculator and hydration conversion tests pass. They validate the current method, not Calculator.net parity or the proposed categories. Independent arithmetic reproduced the 641 kcal method difference and 650 kcal loss-target example. Browser connection was unavailable; the exact Calculator.net form options were instead read from its public HTML. No new app tests, migration, release build or deployment were warranted for this documentation-only review.

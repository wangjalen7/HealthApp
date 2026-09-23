# Calorie and fluid goal methods

Updated 2026-09-22. Calculations run locally. Drink logging has no AI, photos, attachments or provider calls.

## Calories

The method follows [Calculator.net](https://www.calculator.net/calorie-calculator.html): Mifflin-St Jeor BMR (10 * kg + 6.25 * cm - 5 * years + 5 for the male equation, -161 for the female equation), multiplied by 1.2, 1.375, 1.465, 1.55, 1.725 or 1.9. The site's public form confirmed these values on 2026-09-17. This replaces DRI EER at the user's request; DRI was a different population estimate, not a unit-conversion defect.

Use canonical kg/cm and exact US conversions, retain unrounded calculations and display/save whole kcal. Display BMR separately. Never add workout calories a second time. The existing adult 19+ scope and exclusions for unsupported medical/pregnancy/breastfeeding scenarios remain.

The primary loss plan uses a selected local-calendar target date. Calendar-day duration must be 7-3,640 days (1-520 weeks), with exact required loss of 0.1-2 lb/week and a daily deficit of rate times 500 kcal. Invalid dates/rates/intakes produce errors; there is no fallback to a standard rate. Calendar ordinals avoid DST drift. Standard 250/500/750/1,000 kcal deficits remain under Compare Other Options. Current/goal BMI checks remain. Disable generated targets below 1,000 kcal/day, keep the previous saved result clearly separate from edited/invalid inputs, and warn for large deficits. The [NIDDK lower boundary](https://www.niddk.nih.gov/bwp) is not a recommendation that 1,000 kcal is adequate. Gain options remain the app's +5%/+10% convention, not complete Calculator.net parity.

Successful estimates persist before acceptance as helperVersion 2 / latestCalculation in the existing profile calculation JSON. Snapshots include inputs, canonical units, target, maintenance, assumptions and calculation/start/target dates as applicable. Top-level provenance and numeric goals change only on explicit acceptance. Account-scoped local drafts are separate. Manual goal changes retain the latest estimate with custom applied provenance. Reopening preserves the snapshot; explicit recalculation uses the current date. Imported weight is opt-in. Durable retries reuse their original operation and timestamps.

## Fluids

Suggested mode uses about 3.0 L of beverages for adult men and 2.2 L for adult women. Total-water references of 3.7/2.7 L include food and are not drinking goals. These are flexible population references, not individual minimums. [National Academies](https://www.nationalacademies.org/read/10925/chapter/6).

The shared Gender selector maps Male/Female labels to the same sex-based reference categories; optional explanatory text distinguishes this from gender identity and retains manual goals. The questionnaire also asks usual activity. Mostly sitting adds 0 mL, Lightly active 250 mL, Moderately active 500 mL and Very active 750 mL to the beverage reference. These are transparent, modest app planning allowances, not validated individual fluid-loss estimates. No sweat measurements, workout minutes, climate questions or weight multiplier. Weight alone does not justify a more precise drinking requirement. The user can adjust the result or use Custom. [NHS hydration guidance](https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/water-drinks-nutrition/) supports adjusting intake for sustained physical activity without establishing these exact increments.

Custom mode needs no sex, weight or exercise inputs, preserves canonical mL across unit switches and never adds exercise. Goals stay fixed until explicit acceptance; there is no automatically changing historical denominator.

## Drink counting

Nonalcoholic beverages count consumed liquid volume, including coffee, tea, soda and shakes. This is beverage intake, not a claim of 100% water composition or identical physiological effects. Alcohol volume is recorded separately with zero goal credit by policy, never negative credit. Unknown alcohol status is saved with pending contribution. [ADR-007](decisions/ADR-007-beverage-volume-counting.md).

Research does not establish universal 60% coffee, 55% energy-drink or -95% wine ratios. Beverage hydration index studies measure short-term retention under particular conditions. Sources: [beverage trial](https://pubmed.ncbi.nlm.nih.gov/26702122/), [coffee trial](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0084154), [energy-drink trial](https://pubmed.ncbi.nlm.nih.gov/16847703/), [alcohol trial](https://pubmed.ncbi.nlm.nih.gov/28657601/).

Log nutrition separately in Food; categories do not invent calories. Exclude toppings and uneaten ice from liquid portions. Preserve legacy history unless the user explicitly reclassifies a particular entry.

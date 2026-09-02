-- Preserve package/piece-style serving units and force old barcode cache rows
-- through the corrected Open Food Facts v2 normalizer.

alter table public.food_catalog_products
  add column household_quantity_per_serving numeric(12, 4)
    check (household_quantity_per_serving > 0),
  add column household_unit text
    check (char_length(household_unit) between 1 and 40),
  add column normalization_version integer not null default 1
    check (normalization_version > 0),
  add constraint food_catalog_household_serving_pair_check
    check (
      (household_quantity_per_serving is null and household_unit is null)
      or
      (household_quantity_per_serving is not null and household_unit is not null)
    );

alter table public.user_food_profiles
  add column household_quantity_per_serving numeric(12, 4)
    check (household_quantity_per_serving > 0),
  add column household_unit text
    check (char_length(household_unit) between 1 and 40),
  add constraint user_food_profiles_household_serving_pair_check
    check (
      (household_quantity_per_serving is null and household_unit is null)
      or
      (household_quantity_per_serving is not null and household_unit is not null)
    );

alter table public.nutrition_entries
  drop constraint nutrition_entries_quantity_unit_check,
  add constraint nutrition_entries_quantity_unit_check
    check (
      quantity_unit in (
        'serving', 'household', 'g', 'oz', 'lb',
        'ml', 'fl_oz', 'cup', 'tbsp', 'tsp'
      )
    ),
  add column household_quantity_per_serving numeric(12, 4)
    check (household_quantity_per_serving > 0),
  add column household_unit text
    check (char_length(household_unit) between 1 and 40),
  add constraint nutrition_entries_household_serving_pair_check
    check (
      (household_quantity_per_serving is null and household_unit is null)
      or
      (household_quantity_per_serving is not null and household_unit is not null)
    );

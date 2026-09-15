-- Keep package quantity separate from serving size and consumption amount.

alter table public.food_catalog_products
  add column servings_per_container numeric(12, 4)
    check (servings_per_container > 0);

alter table public.user_food_profiles
  add column servings_per_container numeric(12, 4)
    check (servings_per_container > 0);

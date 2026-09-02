-- Release 3: reusable foods, immutable nutrition snapshots, and a server-owned
-- Open Food Facts cache for barcode lookup.

create table public.food_catalog_products (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('open_food_facts')),
  provider_id text not null,
  barcode text not null,
  food_name text not null check (char_length(food_name) between 1 and 160),
  brand text,
  serving_label text,
  serving_weight_grams numeric(12, 4) check (serving_weight_grams > 0),
  serving_volume_ml numeric(12, 4) check (serving_volume_ml > 0),
  calories_per_serving numeric(12, 3) check (calories_per_serving >= 0),
  protein_grams_per_serving numeric(12, 3) check (protein_grams_per_serving >= 0),
  carbohydrate_grams_per_serving numeric(12, 3) check (carbohydrate_grams_per_serving >= 0),
  fat_grams_per_serving numeric(12, 3) check (fat_grams_per_serving >= 0),
  fiber_grams_per_serving numeric(12, 3) check (fiber_grams_per_serving >= 0),
  sugar_grams_per_serving numeric(12, 3) check (sugar_grams_per_serving >= 0),
  sodium_mg_per_serving numeric(12, 3) check (sodium_mg_per_serving >= 0),
  source_url text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_id)
);

create unique index food_catalog_products_barcode_idx
  on public.food_catalog_products (provider, barcode);

create table public.food_barcode_lookups (
  barcode text primary key,
  product_id uuid references public.food_catalog_products(id) on delete set null,
  status text not null check (status in ('found', 'not_found')),
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.user_food_profiles (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_product_id uuid references public.food_catalog_products(id),
  food_name text not null check (char_length(food_name) between 1 and 160),
  brand text,
  barcode text,
  source text not null check (source in ('manual_label', 'open_food_facts')),
  is_user_corrected boolean not null default false,
  serving_label text,
  serving_weight_grams numeric(12, 4) check (serving_weight_grams > 0),
  serving_volume_ml numeric(12, 4) check (serving_volume_ml > 0),
  calories_per_serving numeric(12, 3) not null check (calories_per_serving >= 0),
  protein_grams_per_serving numeric(12, 3) not null check (protein_grams_per_serving >= 0),
  carbohydrate_grams_per_serving numeric(12, 3) check (carbohydrate_grams_per_serving >= 0),
  fat_grams_per_serving numeric(12, 3) check (fat_grams_per_serving >= 0),
  fiber_grams_per_serving numeric(12, 3) check (fiber_grams_per_serving >= 0),
  sugar_grams_per_serving numeric(12, 3) check (sugar_grams_per_serving >= 0),
  sodium_mg_per_serving numeric(12, 3) check (sodium_mg_per_serving >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, catalog_product_id),
  unique (user_id, id)
);

create index user_food_profiles_user_name_idx
  on public.user_food_profiles (user_id, lower(food_name));
create index user_food_profiles_user_brand_idx
  on public.user_food_profiles (user_id, lower(brand));

alter table public.nutrition_entries
  add column meal_log_id uuid,
  add column food_profile_id uuid,
  add column brand text,
  add column barcode text,
  add column serving_label text,
  add column quantity numeric(12, 3) not null default 1 check (quantity > 0),
  add column quantity_unit text not null default 'serving'
    check (quantity_unit in ('serving', 'g', 'oz', 'lb', 'ml', 'fl_oz', 'cup', 'tbsp', 'tsp')),
  add column serving_count numeric(12, 4) check (serving_count > 0),
  add column consumed_weight_grams numeric(12, 4) check (consumed_weight_grams > 0),
  add column consumed_volume_ml numeric(12, 4) check (consumed_volume_ml > 0),
  add column carbohydrate_grams numeric(12, 3) check (carbohydrate_grams >= 0),
  add column fat_grams numeric(12, 3) check (fat_grams >= 0),
  add column fiber_grams numeric(12, 3) check (fiber_grams >= 0),
  add column sugar_grams numeric(12, 3) check (sugar_grams >= 0),
  add column sodium_mg numeric(12, 3) check (sodium_mg >= 0),
  add column note text check (char_length(note) <= 1000),
  add column entry_method text not null default 'basic'
    check (entry_method in ('basic', 'history', 'profile', 'label', 'barcode', 'import')),
  add column nutrition_source text not null default 'manual'
    check (nutrition_source in ('manual', 'open_food_facts', 'import'));

update public.nutrition_entries
set meal_log_id = id,
    serving_count = 1
where meal_log_id is null;

alter table public.nutrition_entries
  alter column meal_log_id set not null,
  add constraint nutrition_entries_own_food_profile_fk
    foreign key (user_id, food_profile_id)
    references public.user_food_profiles(user_id, id);

create index nutrition_entries_user_meal_log_idx
  on public.nutrition_entries (user_id, meal_log_id);
create index nutrition_entries_user_profile_idx
  on public.nutrition_entries (user_id, food_profile_id)
  where food_profile_id is not null;

alter table public.food_catalog_products enable row level security;
alter table public.food_barcode_lookups enable row level security;
alter table public.user_food_profiles enable row level security;

revoke all on public.food_catalog_products from anon, authenticated;
revoke all on public.food_barcode_lookups from anon, authenticated;

grant select, insert, update, delete on public.user_food_profiles to authenticated;

create policy "user_food_profiles_own"
  on public.user_food_profiles
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

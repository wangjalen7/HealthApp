-- Preserve historic totals and snapshot beverage-goal credit separately from volume.
create function public.valid_drink_category(p_category text, p_alcohol text)
returns boolean language sql immutable set search_path = '' as $$
  select p_category in ('water', 'sparkling_water', 'flavored_water', 'electrolytes', 'sports_drink', 'rehydration_solution', 'coffee', 'espresso', 'milk_coffee', 'tea', 'herbal_tea', 'iced_tea', 'matcha_chai', 'soda', 'diet_soda', 'energy_drink', 'energy_shot', 'milk', 'plant_milk', 'yogurt', 'cocoa', 'protein_shake', 'smoothie', 'juice', 'lemonade', 'coconut_water', 'bubble_tea', 'kombucha', 'alcohol_free', 'broth', 'beer', 'wine', 'spirits', 'cocktail', 'other') and p_alcohol in ('nonalcoholic', 'alcoholic', 'unknown')
    and case
      when p_category in ('beer', 'wine', 'spirits', 'cocktail') then p_alcohol = 'alcoholic'
      when p_category in ('other', 'kombucha') then true
      else p_alcohol = 'nonalcoholic'
    end;
$$;
alter table public.hydration_entries
  add column category_id text not null default 'legacy',
  add column alcohol_status text,
  add column counting_policy text not null default 'legacy_volume_v1',
  add column counted_ml numeric(10,2) generated always as (
    case when counting_policy = 'legacy_volume_v1' then volume_ml
      when alcohol_status = 'nonalcoholic' then volume_ml
      when alcohol_status = 'alcoholic' then 0
      else null end
  ) stored,
  add constraint hydration_category_policy check (
    (counting_policy = 'legacy_volume_v1' and category_id = 'legacy' and alcohol_status is null)
    or (counting_policy = 'beverage_volume_v1' and alcohol_status is not null
      and public.valid_drink_category(category_id, alcohol_status))
  );
create table public.saved_drinks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category_id text not null,
  alcohol_status text not null,
  default_volume_ml numeric(10,2) not null check (default_volume_ml > 0 and default_volume_ml <= 20000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  check (public.valid_drink_category(category_id, alcohol_status))
);
alter table public.saved_drinks enable row level security;
grant select, insert, update, delete on public.saved_drinks to authenticated;
create policy saved_drinks_own on public.saved_drinks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter table public.profiles
  add column calorie_goal_calculation jsonb check (calorie_goal_calculation is null or jsonb_typeof(calorie_goal_calculation) = 'object'),
  add column fluid_goal_calculation jsonb check (fluid_goal_calculation is null or jsonb_typeof(fluid_goal_calculation) = 'object');

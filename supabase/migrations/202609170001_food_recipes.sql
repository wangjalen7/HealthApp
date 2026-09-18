-- Reusable recipes retain exact ingredient snapshots and a user-defined yield.

create table public.food_recipes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text check (char_length(description) <= 600),
  yield_servings numeric(12, 4) not null
    check (yield_servings > 0 and yield_servings <= 10000),
  ingredients jsonb not null
    check (
      jsonb_typeof(ingredients) = 'array'
      and jsonb_array_length(ingredients) between 1 and 100
    ),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create index food_recipes_user_updated_idx
  on public.food_recipes (user_id, updated_at desc)
  where archived_at is null;

alter table public.food_recipes enable row level security;

grant select, insert, update, delete on public.food_recipes to authenticated;

create policy "food_recipes_own"
  on public.food_recipes
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.nutrition_entries
  add column recipe_id uuid,
  drop constraint nutrition_entries_entry_method_check,
  add constraint nutrition_entries_entry_method_check
    check (entry_method in ('basic', 'history', 'profile', 'label', 'barcode', 'import', 'ai', 'recipe')),
  add constraint nutrition_entries_own_recipe_fk
    foreign key (user_id, recipe_id)
    references public.food_recipes(user_id, id);

create index nutrition_entries_user_recipe_idx
  on public.nutrition_entries (user_id, recipe_id)
  where recipe_id is not null;

-- Accelerated Releases 3–4: user-owned lifting, cardio, and nutrition data.

create table public.workout_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  template_name text,
  notes text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.workout_sets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_name text not null check (char_length(exercise_name) between 1 and 120),
  set_number integer not null check (set_number > 0 and set_number <= 50),
  weight numeric(10, 2) not null check (weight >= 0),
  weight_unit text not null default 'lb' check (weight_unit in ('lb', 'kg')),
  reps integer not null check (reps > 0 and reps <= 500),
  created_at timestamptz not null default now(),
  unique (session_id, exercise_name, set_number)
);

create table public.cardio_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null check (activity_type in ('walk', 'run', 'swim', 'tennis', 'cycle', 'other')),
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  distance_miles numeric(10, 2) check (distance_miles >= 0),
  notes text,
  occurred_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'strava')),
  created_at timestamptz not null default now()
);

create table public.nutrition_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_name text not null check (char_length(food_name) between 1 and 160),
  meal_type text not null default 'meal' check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'meal')),
  calories integer not null check (calories >= 0 and calories <= 20000),
  protein_grams numeric(8, 1) not null default 0 check (protein_grams >= 0 and protein_grams <= 1000),
  occurred_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'barcode', 'import')),
  created_at timestamptz not null default now()
);

create index workout_sessions_user_completed_at_idx on public.workout_sessions (user_id, completed_at desc);
create index workout_sets_user_exercise_created_at_idx on public.workout_sets (user_id, exercise_name, created_at desc);
create index cardio_entries_user_occurred_at_idx on public.cardio_entries (user_id, occurred_at desc);
create index nutrition_entries_user_occurred_at_idx on public.nutrition_entries (user_id, occurred_at desc);

alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.cardio_entries enable row level security;
alter table public.nutrition_entries enable row level security;

grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.workout_sets to authenticated;
grant select, insert, update, delete on public.cardio_entries to authenticated;
grant select, insert, update, delete on public.nutrition_entries to authenticated;

create policy "workout_sessions_own" on public.workout_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workout_sets_own" on public.workout_sets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cardio_entries_own" on public.cardio_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "nutrition_entries_own" on public.nutrition_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

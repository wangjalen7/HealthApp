-- Exercise order/location plus user-owned hydration tracking and goals.

alter table public.workout_sessions
  add column location text,
  add constraint workout_sessions_location_length_check
    check (location is null or char_length(location) <= 160);

alter table public.workout_sets
  add column exercise_order integer not null default 1
    check (exercise_order > 0 and exercise_order <= 100);

with distinct_exercises as (
  select
    session_id,
    exercise_name,
    min(created_at) as first_created_at,
    min(id::text) as first_id
  from public.workout_sets
  group by session_id, exercise_name
), ordered_exercises as (
  select
    session_id,
    exercise_name,
    row_number() over (
      partition by session_id
      order by first_created_at, first_id
    ) as exercise_order
  from distinct_exercises
)
update public.workout_sets as workout_set
set exercise_order = ordered.exercise_order
from ordered_exercises as ordered
where workout_set.session_id = ordered.session_id
  and workout_set.exercise_name = ordered.exercise_name;

alter table public.profiles
  add column daily_water_goal_ml numeric(10, 2)
    check (daily_water_goal_ml is null or daily_water_goal_ml > 0);

create table public.hydration_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  fluid_name text not null default 'Water'
    check (char_length(fluid_name) between 1 and 80),
  volume_ml numeric(10, 2) not null
    check (volume_ml > 0 and volume_ml <= 20000),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index hydration_entries_user_occurred_at_idx
  on public.hydration_entries (user_id, occurred_at desc);

alter table public.hydration_entries enable row level security;
grant select, insert, update, delete on public.hydration_entries to authenticated;
create policy "hydration_entries_own"
  on public.hydration_entries
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.replace_workout_session(
  p_session_id uuid,
  p_title text,
  p_muscle_groups text[],
  p_location text,
  p_notes text,
  p_sets jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if not exists (select 1 from public.workout_sessions where id = p_session_id and user_id = auth.uid()) then raise exception 'Workout not found'; end if;
  if char_length(trim(p_title)) not between 1 and 100 then raise exception 'Invalid workout title'; end if;
  if char_length(trim(p_location)) > 160 then raise exception 'Invalid workout location'; end if;
  if coalesce(array_length(p_muscle_groups, 1), 0) = 0 then raise exception 'Choose at least one muscle group'; end if;
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) = 0 then raise exception 'Add at least one set'; end if;

  update public.workout_sessions
  set
    title = trim(p_title),
    muscle_groups = p_muscle_groups,
    location = nullif(trim(p_location), ''),
    notes = nullif(trim(p_notes), '')
  where id = p_session_id and user_id = auth.uid();

  delete from public.workout_sets
  where session_id = p_session_id and user_id = auth.uid();

  insert into public.workout_sets (
    id,
    user_id,
    session_id,
    exercise_name,
    exercise_order,
    set_number,
    weight,
    weight_unit,
    reps
  )
  select
    (set_data ->> 'id')::uuid,
    auth.uid(),
    p_session_id,
    trim(set_data ->> 'exercise_name'),
    (set_data ->> 'exercise_order')::integer,
    (set_data ->> 'set_number')::integer,
    (set_data ->> 'weight')::numeric,
    coalesce(nullif(set_data ->> 'weight_unit', ''), 'lb'),
    (set_data ->> 'reps')::integer
  from jsonb_array_elements(p_sets) as set_data;
end;
$$;

grant execute on function public.replace_workout_session(
  uuid,
  text,
  text[],
  text,
  text,
  jsonb
) to authenticated;

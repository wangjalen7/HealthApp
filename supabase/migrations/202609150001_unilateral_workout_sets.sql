-- Store both sides of a unilateral set without doubling workout set counts.

alter table public.workout_sets
  add column side_mode text not null default 'bilateral'
    check (side_mode in ('bilateral', 'unilateral')),
  add column right_weight numeric(10, 2) check (right_weight >= 0),
  add column right_reps integer check (right_reps > 0 and right_reps <= 500),
  add constraint workout_sets_unilateral_pair_check check (
    (side_mode = 'bilateral' and right_weight is null and right_reps is null)
    or
    (side_mode = 'unilateral' and right_weight is not null and right_reps is not null)
  );

create or replace function public.replace_workout_session(
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
  if exists (
    select 1 from jsonb_array_elements(p_sets) as set_data
    where coalesce(set_data ->> 'muscle_group', '') = ''
      or not ((set_data ->> 'muscle_group') = any(p_muscle_groups))
  ) then raise exception 'Choose a selected muscle group for every exercise'; end if;

  update public.workout_sessions
  set title = trim(p_title),
      muscle_groups = p_muscle_groups,
      location = nullif(trim(p_location), ''),
      notes = nullif(trim(p_notes), '')
  where id = p_session_id and user_id = auth.uid();

  delete from public.workout_sets
  where session_id = p_session_id and user_id = auth.uid();

  insert into public.workout_sets (
    id, user_id, session_id, exercise_name, exercise_order, muscle_group,
    set_number, weight, weight_unit, reps, side_mode, right_weight, right_reps
  )
  select
    (set_data ->> 'id')::uuid,
    auth.uid(),
    p_session_id,
    trim(set_data ->> 'exercise_name'),
    (set_data ->> 'exercise_order')::integer,
    set_data ->> 'muscle_group',
    (set_data ->> 'set_number')::integer,
    (set_data ->> 'weight')::numeric,
    coalesce(nullif(set_data ->> 'weight_unit', ''), 'lb'),
    (set_data ->> 'reps')::integer,
    coalesce(nullif(set_data ->> 'side_mode', ''), 'bilateral'),
    (set_data ->> 'right_weight')::numeric,
    (set_data ->> 'right_reps')::integer
  from jsonb_array_elements(p_sets) as set_data;
end;
$$;

grant execute on function public.replace_workout_session(
  uuid, text, text[], text, text, jsonb
) to authenticated;

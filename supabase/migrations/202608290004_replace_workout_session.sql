-- Atomically replace an owned workout's session details and sets for History editing.

create or replace function public.replace_workout_session(
  p_session_id uuid,
  p_title text,
  p_muscle_groups text[],
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
  if coalesce(array_length(p_muscle_groups, 1), 0) = 0 then raise exception 'Choose at least one muscle group'; end if;
  if jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) = 0 then raise exception 'Add at least one set'; end if;

  update public.workout_sessions
  set title = trim(p_title), muscle_groups = p_muscle_groups, notes = nullif(trim(p_notes), '')
  where id = p_session_id and user_id = auth.uid();

  delete from public.workout_sets where session_id = p_session_id and user_id = auth.uid();

  insert into public.workout_sets (id, user_id, session_id, exercise_name, set_number, weight, weight_unit, reps)
  select
    (set_data ->> 'id')::uuid,
    auth.uid(),
    p_session_id,
    trim(set_data ->> 'exercise_name'),
    (set_data ->> 'set_number')::integer,
    (set_data ->> 'weight')::numeric,
    coalesce(nullif(set_data ->> 'weight_unit', ''), 'lb'),
    (set_data ->> 'reps')::integer
  from jsonb_array_elements(p_sets) as set_data;
end;
$$;

grant execute on function public.replace_workout_session(uuid, text, text[], text, jsonb) to authenticated;

-- Save a complete Coach turn atomically. The authenticated identity is checked
-- inside the security-definer function before any user-owned rows are written.

create or replace function public.save_coach_turn(
  p_user_id uuid,
  p_thread_id uuid,
  p_thread_title text,
  p_thread_summary text,
  p_user_message_id uuid,
  p_assistant_message_id uuid,
  p_user_message text,
  p_answer text,
  p_evidence jsonb,
  p_sources jsonb,
  p_model_tier text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_actions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  action jsonb;
begin
  if (select auth.uid()) is null or (select auth.uid()) <> p_user_id then
    raise insufficient_privilege using message = 'Coach turn owner mismatch';
  end if;

  if jsonb_typeof(coalesce(p_actions, '[]'::jsonb)) <> 'array' then
    raise invalid_parameter_value using message = 'Coach actions must be an array';
  end if;

  insert into public.coach_threads as existing (
    id,
    user_id,
    title,
    summary,
    updated_at
  ) values (
    p_thread_id,
    p_user_id,
    p_thread_title,
    p_thread_summary,
    now()
  )
  on conflict (id) do update set
    title = excluded.title,
    summary = excluded.summary,
    updated_at = excluded.updated_at
  where existing.user_id = p_user_id;

  if not found then
    raise insufficient_privilege using message = 'Coach thread owner mismatch';
  end if;

  insert into public.coach_messages (
    id,
    user_id,
    thread_id,
    role,
    content,
    evidence,
    sources,
    model_tier,
    input_tokens,
    output_tokens
  ) values
    (
      p_user_message_id,
      p_user_id,
      p_thread_id,
      'user',
      p_user_message,
      '[]'::jsonb,
      '[]'::jsonb,
      null,
      0,
      0
    ),
    (
      p_assistant_message_id,
      p_user_id,
      p_thread_id,
      'assistant',
      p_answer,
      coalesce(p_evidence, '[]'::jsonb),
      coalesce(p_sources, '[]'::jsonb),
      p_model_tier,
      greatest(coalesce(p_input_tokens, 0), 0),
      greatest(coalesce(p_output_tokens, 0), 0)
    );

  for action in
    select value from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb))
  loop
    insert into public.coach_actions (
      id,
      user_id,
      thread_id,
      message_id,
      kind,
      payload
    ) values (
      (action ->> 'id')::uuid,
      p_user_id,
      p_thread_id,
      p_assistant_message_id,
      action -> 'payload' ->> 'kind',
      action -> 'payload'
    );
  end loop;
end;
$$;

revoke all on function public.save_coach_turn(
  uuid, uuid, text, text, uuid, uuid, text, text, jsonb, jsonb, text,
  integer, integer, jsonb
) from public, anon, service_role;

grant execute on function public.save_coach_turn(
  uuid, uuid, text, text, uuid, uuid, text, text, jsonb, jsonb, text,
  integer, integer, jsonb
) to authenticated;

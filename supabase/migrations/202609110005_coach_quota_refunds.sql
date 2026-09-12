-- Failed Coach requests release their atomic quota reservation. Reconcile the
-- current rollout day's counters with turns that were actually saved.

create or replace function public.refund_coach_quota(
  p_user_id uuid,
  p_tier text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_tier = 'standard' then
    update public.coach_daily_usage
    set standard_requests = greatest(standard_requests - 1, 0)
    where user_id = p_user_id
      and usage_day = (now() at time zone 'utc')::date;
  elsif p_tier = 'deep' then
    update public.coach_daily_usage
    set deep_requests = greatest(deep_requests - 1, 0)
    where user_id = p_user_id
      and usage_day = (now() at time zone 'utc')::date;
  else
    raise invalid_parameter_value using message = 'Invalid coach tier';
  end if;
end;
$$;

revoke all on function public.refund_coach_quota(uuid, text)
  from public, anon, authenticated;
grant execute on function public.refund_coach_quota(uuid, text)
  to service_role;

update public.coach_daily_usage as usage
set
  standard_requests = least(
    usage.standard_requests,
    (
      select count(*)::smallint
      from public.coach_messages as message
      where message.user_id = usage.user_id
        and message.role = 'assistant'
        and message.model_tier = 'standard'
        and message.created_at >=
          (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
    )
  ),
  deep_requests = least(
    usage.deep_requests,
    (
      select count(*)::smallint
      from public.coach_messages as message
      where message.user_id = usage.user_id
        and message.role = 'assistant'
        and message.model_tier = 'deep'
        and message.created_at >=
          (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
    )
  )
where usage.usage_day = (now() at time zone 'utc')::date;

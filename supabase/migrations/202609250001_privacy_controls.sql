-- Prepared only. Deploy with updated AI functions, then updated client.
begin;
create table public.ai_processing_choices (
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('meal','workout')),
  notice_version text not null,
  history_allowed boolean not null default false,
  chosen_at timestamptz not null default now(),
  primary key(user_id,purpose)
);
alter table public.ai_processing_choices enable row level security;
revoke all on public.ai_processing_choices from anon, authenticated;
grant select on public.ai_processing_choices to authenticated;
grant all on public.ai_processing_choices to service_role;
create policy own_read on public.ai_processing_choices for select to authenticated using (user_id=(select auth.uid()));
create policy account_not_deleting on public.ai_processing_choices as restrictive for all to authenticated using ((select public.account_access_allowed())) with check ((select public.account_access_allowed()));
create trigger account_deletion_guard before insert or update on public.ai_processing_choices for each row execute function public.guard_deleting_account();

-- Operational counts are personal information too; never export credential hashes.
grant select on public.coach_daily_usage, public.meal_estimate_usage to authenticated;
create policy own_read on public.coach_daily_usage for select to authenticated using (user_id=(select auth.uid()));
create policy own_read on public.meal_estimate_usage for select to authenticated using (user_id=(select auth.uid()));

-- Atomic deletion of legacy conversations/plans and saved planner preferences.
-- Retain quota/consent evidence separately; do not imply provider erasure.
create function public.clear_saved_ai_data() returns void language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or not public.account_access_allowed() then raise exception 'Sign in again'; end if;
  delete from public.coach_threads where user_id=auth.uid();
  delete from public.coach_profiles where user_id=auth.uid();
end $$;
revoke all on function public.clear_saved_ai_data() from public,anon;
grant execute on function public.clear_saved_ai_data() to authenticated;
commit;

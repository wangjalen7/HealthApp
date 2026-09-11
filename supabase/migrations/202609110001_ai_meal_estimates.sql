-- Preserve AI provenance and editable label descriptions using existing user RLS.
alter table public.user_food_profiles
  drop constraint user_food_profiles_source_check,
  add constraint user_food_profiles_source_check check (source in ('manual_label', 'open_food_facts', 'ai')),
  add column description text check (char_length(description) <= 600);
alter table public.nutrition_entries
  drop constraint nutrition_entries_nutrition_source_check,
  add constraint nutrition_entries_nutrition_source_check check (nutrition_source in ('manual', 'open_food_facts', 'import', 'ai')),
  drop constraint nutrition_entries_entry_method_check,
  add constraint nutrition_entries_entry_method_check check (entry_method in ('basic', 'history', 'profile', 'label', 'barcode', 'import', 'ai'));

-- One bounded counter per user; no meal text or images are stored by the service.
create table public.meal_estimate_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  usage_day date not null,
  requests integer not null check (requests between 1 and 20)
);
alter table public.meal_estimate_usage enable row level security;
revoke all on public.meal_estimate_usage from anon, authenticated;

create function public.consume_meal_estimate_quota(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare accepted uuid;
begin
  insert into public.meal_estimate_usage as usage (user_id, usage_day, requests)
  values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id) do update set
    usage_day = excluded.usage_day,
    requests = case when usage.usage_day = excluded.usage_day then usage.requests + 1 else 1 end
  where usage.usage_day <> excluded.usage_day or usage.requests < 20
  returning user_id into accepted;
  return accepted is not null;
end;
$$;
revoke all on function public.consume_meal_estimate_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_meal_estimate_quota(uuid) to service_role;

-- Release 1: authenticated, user-isolated vitals storage.
-- Apply only to the dedicated hosted Supabase development project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vital_samples (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('weight', 'systolic_bp', 'diastolic_bp', 'pulse')),
  value numeric(10, 2) not null check (value > 0),
  unit text not null check (unit in ('lb', 'kg', 'mmHg', 'bpm')),
  occurred_at timestamptz not null,
  correlation_id uuid,
  source text not null default 'manual' check (source in ('manual', 'healthkit', 'omron_import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists vital_samples_user_occurred_at_idx on public.vital_samples (user_id, occurred_at desc);
create index if not exists vital_samples_user_correlation_idx on public.vital_samples (user_id, correlation_id) where correlation_id is not null;

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.raw_user_meta_data ->> 'display_name') on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.vital_samples enable row level security;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.vital_samples to authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "vitals_select_own" on public.vital_samples for select to authenticated using ((select auth.uid()) = user_id);
create policy "vitals_insert_own" on public.vital_samples for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "vitals_update_own" on public.vital_samples for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "vitals_delete_own" on public.vital_samples for delete to authenticated using ((select auth.uid()) = user_id);

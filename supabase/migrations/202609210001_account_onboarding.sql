-- Established accounts explicitly bypass setup; absence of a row is an error,
-- never evidence that an existing user should enter a blank questionnaire.
create table public.account_setup (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_name text check (char_length(preferred_name) between 1 and 80),
  unit_system text not null default 'us' check (unit_system in ('us','metric')),
  fluid_unit text not null default 'fl_oz' check (fluid_unit in ('fl_oz','ml')),
  step text not null default 'name' check (step in ('name','goals','fluids','convenience','summary')),
  completed_at timestamptz,
  dismissed_setup boolean not null default false,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.account_setup(user_id, completed_at)
select id, now() from auth.users;
alter table public.account_setup enable row level security;
create policy account_setup_read_own on public.account_setup for select to authenticated using (auth.uid() = user_id);
revoke all on public.account_setup from anon, authenticated;
grant select on public.account_setup to authenticated;
create function public.create_account_setup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.account_setup(user_id) values(new.id) on conflict do nothing;
 return new;
end $$;
create trigger after_auth_account_setup after insert on auth.users for each row execute function public.create_account_setup();
revoke all on function public.create_account_setup() from public, anon, authenticated;

-- A receipt makes a lost-response retry safe even after a later settings edit.
create table public.account_setup_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null, request jsonb not null, result jsonb not null,
 primary key(user_id,operation_id)
);
alter table public.account_setup_receipts enable row level security;
revoke all on public.account_setup_receipts from public,anon,authenticated;
create function public.save_account_setup(p_user_id uuid,p_operation_id uuid,p_version bigint,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_row public.account_setup; receipt public.account_setup_receipts; result jsonb;
begin
 perform public.require_active_session(p_user_id);
 select * into current_row from public.account_setup where user_id=p_user_id for update;
 if not found then raise exception 'Account setup unavailable. Try again.'; end if;
 select * into receipt from public.account_setup_receipts where user_id=p_user_id and operation_id=p_operation_id;
 if found then
  if receipt.request <> jsonb_build_object('version',p_version,'changes',p_changes) then raise exception 'Operation ID reused'; end if;
  return receipt.result;
 end if;
 if current_row.version <> p_version then return jsonb_build_object('status','conflict','data',to_jsonb(current_row)); end if;
 if jsonb_typeof(p_changes) <> 'object' or exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('preferred_name','unit_system','fluid_unit','step','complete','dismissed_setup')) then raise exception 'Invalid setup changes'; end if;
 update public.account_setup set
 preferred_name=case when p_changes ? 'preferred_name' then nullif(btrim(p_changes->>'preferred_name'),'') else preferred_name end,
 unit_system=coalesce(p_changes->>'unit_system',unit_system),
 fluid_unit=coalesce(p_changes->>'fluid_unit',fluid_unit),
 step=coalesce(p_changes->>'step',step),
 completed_at=case when p_changes->>'complete'='true' then coalesce(completed_at,now()) else completed_at end,
 dismissed_setup=coalesce((p_changes->>'dismissed_setup')::boolean,dismissed_setup),
 version=version+1, updated_at=now()
 where user_id=p_user_id returning * into current_row;
 result=jsonb_build_object('status','accepted','data',to_jsonb(current_row));
 insert into public.account_setup_receipts values(p_user_id,p_operation_id,jsonb_build_object('version',p_version,'changes',p_changes),result);
 return result;
end $$;
revoke all on function public.save_account_setup(uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.save_account_setup(uuid,uuid,bigint,jsonb) to authenticated;

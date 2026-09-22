-- Recovery tokens are hashed, never exposed through the Data API. Completed
-- receipts retain no account identity; clients can verify a lost final response.
create table public.account_deletion_jobs (
 token_hash text primary key check(length(token_hash)=64),
 user_id uuid unique,
 completed boolean not null default false,
 cancelled boolean not null default false,
 created_at timestamptz not null default now(),
 check ((completed <> cancelled and user_id is null) or (not completed and not cancelled and user_id is not null))
);
alter table public.account_deletion_jobs enable row level security;
revoke all on public.account_deletion_jobs from public,anon,authenticated;
grant all on public.account_deletion_jobs to service_role;

create function public.account_access_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=auth.uid()) and not exists(select 1 from public.account_deletion_jobs where user_id=auth.uid());
$$;
revoke all on function public.account_access_allowed() from public,anon;
grant execute on function public.account_access_allowed() to authenticated;
do $$ declare t record; begin
 for t in select distinct table_name from information_schema.columns where table_schema='public' and column_name='user_id' and table_name<>'account_deletion_jobs' loop
  execute format('create policy account_not_deleting on public.%I as restrictive for all to authenticated using ((select public.account_access_allowed())) with check ((select public.account_access_allowed()))',t.table_name);
 end loop;
end $$;
create policy account_not_deleting on public.profiles as restrictive for all to authenticated using ((select public.account_access_allowed())) with check ((select public.account_access_allowed()));
create policy account_not_deleting on storage.objects as restrictive for all to authenticated using ((select public.account_access_allowed())) with check ((select public.account_access_allowed()));

-- Serialize write admission with deletion initiation. This also covers service
-- writers such as Coach and orphan photo uploads, not just client RPCs.
create function public.guard_deleting_account() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid; begin
 if tg_table_schema='storage' then
   if new.bucket_id <> 'progress-photos' then return new; end if;
   u:=split_part(new.name,'/',1)::uuid;
 elsif tg_table_name='profiles' then u:=new.id;
 else u:=new.user_id; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,22));
 if exists(select 1 from public.account_deletion_jobs where user_id=u) then
   raise exception 'Account deletion is in progress' using errcode='28000';
 end if;
 return new;
end $$;
revoke all on function public.guard_deleting_account() from public,anon,authenticated;
do $$ declare t record; begin
 for t in select distinct table_name from information_schema.columns where table_schema='public' and column_name='user_id' and table_name<>'account_deletion_jobs' loop
  execute format('create trigger account_deletion_guard before insert or update on public.%I for each row execute function public.guard_deleting_account()',t.table_name);
 end loop;
end $$;
create trigger account_deletion_guard before insert or update on public.profiles for each row execute function public.guard_deleting_account();
create trigger account_deletion_guard before insert or update on storage.objects for each row execute function public.guard_deleting_account();

create function public.prepare_account_deletion(p_user_id uuid,p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_hash,23));
 if exists(select 1 from public.account_deletion_jobs where token_hash=p_hash and cancelled) then raise exception 'Deletion request was cancelled'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,22));
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Account not found'; end if;
 -- Revoke device credentials before installing the write guard's marker.
 update public.biometric_device_credentials set revoked_at=coalesce(revoked_at,now()) where user_id=p_user_id;
 insert into public.account_deletion_jobs(token_hash,user_id) values(p_hash,p_user_id) on conflict(token_hash) do nothing;
 if not exists(select 1 from public.account_deletion_jobs where token_hash=p_hash and user_id=p_user_id) then raise exception 'Deletion identity mismatch'; end if;
 delete from auth.sessions where user_id=p_user_id;
end $$;

-- Seal an unstarted request before clearing a device recovery marker. A delayed
-- prepare can then never start deletion after the client believes it was cancelled.
create function public.cancel_unstarted_deletion(p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_hash,23));
 insert into public.account_deletion_jobs(token_hash,cancelled) values(p_hash,true) on conflict do nothing;
 return exists(select 1 from public.account_deletion_jobs where token_hash=p_hash and cancelled);
end $$;
revoke all on function public.cancel_unstarted_deletion(text) from public,anon,authenticated;
grant execute on function public.cancel_unstarted_deletion(text) to service_role;

-- Enumerate storage objects themselves so failed metadata saves cannot orphan files.
create function public.account_deletion_objects(p_user_id uuid) returns table(bucket_id text,name text)
language sql security definer set search_path='' as $$
 select o.bucket_id,o.name from storage.objects o where o.owner_id=p_user_id::text
 or (o.bucket_id='progress-photos' and split_part(o.name,'/',1)=p_user_id::text)
 order by o.bucket_id,o.name limit 100;
$$;
create function public.finish_account_deletion(p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid; t record; n bigint; begin
 select user_id into u from public.account_deletion_jobs where token_hash=p_hash for update;
 if u is null then return; end if;
 if exists(select 1 from auth.users where id=u) then raise exception 'Auth deletion incomplete'; end if;
 if exists(select 1 from public.account_deletion_objects(u)) then raise exception 'Storage deletion incomplete'; end if;
 for t in select distinct table_name from information_schema.columns where table_schema='public' and column_name='user_id' and table_name<>'account_deletion_jobs' loop
  execute format('select count(*) from public.%I where user_id=$1',t.table_name) into n using u;
  if n<>0 then raise exception 'Account data deletion incomplete'; end if;
 end loop;
 if exists(select 1 from public.profiles where id=u) then raise exception 'Profile deletion incomplete'; end if;
 update public.account_deletion_jobs set completed=true,user_id=null where token_hash=p_hash;
end $$;
revoke all on function public.prepare_account_deletion(uuid,text),public.account_deletion_objects(uuid),public.finish_account_deletion(text) from public,anon,authenticated;
grant execute on function public.prepare_account_deletion(uuid,text),public.account_deletion_objects(uuid),public.finish_account_deletion(text) to service_role;

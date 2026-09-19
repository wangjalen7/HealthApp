-- Prepared for review only. Legacy device secrets are deliberately invalidated.
create or replace function public.require_active_session(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is distinct from p_user_id or not exists (
    select 1 from auth.sessions s where s.id = nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id = p_user_id and (s.not_after is null or s.not_after > now())
  ) then
    raise exception using errcode = '28000', message = 'Your session has ended. Sign in again; your pending changes are retained.';
  end if;
end $$;
revoke all on function public.require_active_session(uuid) from public, anon;
grant execute on function public.require_active_session(uuid) to authenticated;

alter table public.biometric_device_credentials
  add column device_id uuid,
  add column device_name text not null default 'iPhone' check (char_length(device_name) between 1 and 80),
  add column expires_at timestamptz not null default (now() + interval '90 days');
update public.biometric_device_credentials set revoked_at = coalesce(revoked_at,now());
alter table public.biometric_device_credentials add constraint biometric_device_binding_required check (revoked_at is not null or device_id is not null);
create unique index biometric_active_device on public.biometric_device_credentials(user_id,device_id) where revoked_at is null;

-- Only the Edge Function's service role may call these. Enrollment requires the
-- short-lived session produced by its independent password verification.
create function public.enroll_biometric_device(p_user_id uuid,p_device_id uuid,p_name text,p_hash text,p_verified_session uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  perform 1 from auth.users where id=p_user_id for update;
  if p_device_id is null or not exists(select 1 from auth.sessions where id=p_verified_session and user_id=p_user_id
    and created_at > now()-interval '2 minutes' and (not_after is null or not_after>now())) then
    raise exception 'Recent password verification required' using errcode='28000';
  end if;
  update public.biometric_device_credentials set revoked_at=now() where user_id=p_user_id and device_id=p_device_id and revoked_at is null;
  insert into public.biometric_device_credentials(user_id,device_id,device_name,token_hash)
    values(p_user_id,p_device_id,p_name,p_hash) returning id into result;
  return result;
end $$;

create function public.consume_biometric_device(p_id uuid,p_device_id uuid,p_hash text,p_next_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if p_hash=p_next_hash then raise exception 'Credential must rotate'; end if;
  update public.biometric_device_credentials set token_hash=p_next_hash,last_used_at=now()
    where id=p_id and device_id=p_device_id and token_hash=p_hash and revoked_at is null and expires_at>now()
    returning user_id into result;
  return result;
end $$;
revoke all on function public.enroll_biometric_device(uuid,uuid,text,text,uuid),public.consume_biometric_device(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.enroll_biometric_device(uuid,uuid,text,text,uuid),public.consume_biometric_device(uuid,uuid,text,text) to service_role;

create or replace function public.revoke_biometric_credentials_on_password_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password or old.email is distinct from new.email then
    update public.biometric_device_credentials set revoked_at=coalesce(revoked_at,now()) where user_id=new.id and revoked_at is null;
  end if;
  return new;
end $$;
drop trigger revoke_biometric_credentials_after_password_change on auth.users;
create trigger revoke_biometric_credentials_after_password_change after update of encrypted_password,email on auth.users
for each row execute function public.revoke_biometric_credentials_on_password_change();

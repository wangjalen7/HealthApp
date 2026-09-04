create table if not exists public.biometric_device_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint biometric_device_credentials_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$')
);

alter table public.biometric_device_credentials enable row level security;

comment on table public.biometric_device_credentials is
  'Server-only hashes of revocable device credentials used for biometric sign-in.';
comment on column public.biometric_device_credentials.token_hash is
  'SHA-256 hash of a random secret returned once and stored behind device biometrics.';

revoke all on table public.biometric_device_credentials from anon, authenticated;

create or replace function public.revoke_biometric_credentials_on_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password then
    update public.biometric_device_credentials
    set revoked_at = coalesce(revoked_at, now())
    where user_id = new.id
      and revoked_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.revoke_biometric_credentials_on_password_change()
  from public, anon, authenticated;

drop trigger if exists revoke_biometric_credentials_after_password_change
  on auth.users;
create trigger revoke_biometric_credentials_after_password_change
after update of encrypted_password on auth.users
for each row
execute function public.revoke_biometric_credentials_on_password_change();

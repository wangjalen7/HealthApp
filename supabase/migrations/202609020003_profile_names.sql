-- Store the required signup name in the user-owned public profile as well as Auth metadata.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.profiles
  add constraint profiles_first_name_length
    check (first_name is null or char_length(btrim(first_name)) between 1 and 80),
  add constraint profiles_last_name_length
    check (last_name is null or char_length(btrim(last_name)) between 1 and 80);

update public.profiles as profile
set
  first_name = nullif(btrim(account.raw_user_meta_data ->> 'first_name'), ''),
  last_name = nullif(btrim(account.raw_user_meta_data ->> 'last_name'), '')
from auth.users as account
where account.id = profile.id
  and (profile.first_name is null or profile.last_name is null);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, first_name, last_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      concat_ws(
        ' ',
        nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '')
      )
    ),
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Replace the local-day quota with three attachments per weight entry.
-- Existing photos, including unlinked/over-limit legacy entries, are preserved.
alter table public.progress_photos
  drop constraint progress_photos_user_id_local_day_daily_slot_key;

-- Retain this legacy metadata column for older clients and exported archives.
-- It no longer allocates upload capacity.
alter table public.progress_photos alter column daily_slot set default 1;

create or replace function public.enforce_progress_photo_entry_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.weight_sample_id is null then
    raise exception using
      errcode = '23514',
      message = 'Attach progress photos to a weight entry.';
  end if;

  -- Serialize uploads to the same entry across devices. Under PostgREST's
  -- READ COMMITTED isolation the following count sees the prior upload commit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text || '/' || new.weight_sample_id::text, 0)
  );
  if (
    select count(*) from public.progress_photos
    where user_id = new.user_id
      and weight_sample_id = new.weight_sample_id
      and id <> new.id
  ) >= 3 then
    raise exception using
      errcode = '23514',
      message = 'Three progress photos are allowed per weight entry.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_progress_photo_entry_limit() from public;

create trigger progress_photos_entry_limit
before insert or update of user_id, weight_sample_id on public.progress_photos
for each row execute function public.enforce_progress_photo_entry_limit();

-- Run with: supabase db query --linked --file supabase/tests/progress_photos_per_entry.sql
-- Exercise the installed trigger body using temporary synthetic rows only.
begin;

create temporary table photo_limit_fixture (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '11111111-1111-4111-8111-111111111111',
  weight_sample_id uuid,
  local_day date not null default current_date
);

do $$
declare definition text;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.progress_photos'::regclass
      and conname = 'progress_photos_user_id_local_day_daily_slot_key'
  ) then
    raise exception 'Daily quota constraint still exists';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.progress_photos'::regclass
      and tgname = 'progress_photos_entry_limit' and tgenabled = 'O'
  ) then
    raise exception 'Entry limit trigger is not enabled';
  end if;
  definition := pg_get_functiondef('public.enforce_progress_photo_entry_limit()'::regprocedure);
  definition := replace(definition, 'public.enforce_progress_photo_entry_limit', 'pg_temp.test_photo_entry_limit');
  definition := replace(definition, 'public.progress_photos', 'pg_temp.photo_limit_fixture');
  execute definition;
end;
$$;

create trigger fixture_entry_limit
before insert or update of user_id, weight_sample_id on photo_limit_fixture
for each row execute function pg_temp.test_photo_entry_limit();

do $$
declare
  entry_a uuid := gen_random_uuid();
  entry_b uuid := gen_random_uuid();
begin
  -- Both entries can receive three photos on the same day.
  insert into photo_limit_fixture(weight_sample_id)
    select entry_a from generate_series(1, 3);
  insert into photo_limit_fixture(weight_sample_id)
    select entry_b from generate_series(1, 3);
  if (select count(*) from photo_limit_fixture) <> 6 then
    raise exception 'Independent entry capacity failed';
  end if;

  -- Changing the date must not create a fourth slot for the same entry.
  begin
    insert into photo_limit_fixture(weight_sample_id, local_day)
      values (entry_a, current_date + 1);
    raise exception 'Fourth attachment unexpectedly accepted';
  exception when check_violation then
    if sqlerrm <> 'Three progress photos are allowed per weight entry.' then
      raise;
    end if;
  end;

  -- Deletion makes room for a replacement on that entry.
  delete from photo_limit_fixture
    where id = (select id from photo_limit_fixture where weight_sample_id = entry_a limit 1);
  insert into photo_limit_fixture(weight_sample_id) values (entry_a);

  begin
    insert into photo_limit_fixture(weight_sample_id) values (null);
    raise exception 'Unlinked attachment unexpectedly accepted';
  exception when check_violation then
    if sqlerrm <> 'Attach progress photos to a weight entry.' then
      raise;
    end if;
  end;
end;
$$;

select 'Per-entry limit, independent capacity, date independence, deletion and required association passed' as result;
rollback;

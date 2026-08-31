-- Release 2: source-aware, duplicate-safe HealthKit imports.

alter table public.vital_samples
  add column if not exists external_id text,
  add column if not exists source_name text;

create unique index if not exists vital_samples_user_source_external_kind_idx
  on public.vital_samples (user_id, source, external_id, kind)
  where external_id is not null;

alter table public.cardio_entries
  add column if not exists external_id text,
  add column if not exists source_name text,
  add column if not exists activity_name text,
  add column if not exists deleted_at timestamptz;

alter table public.cardio_entries
  drop constraint if exists cardio_entries_source_check;

alter table public.cardio_entries
  add constraint cardio_entries_source_check
  check (source in ('manual', 'strava', 'healthkit'));

create unique index if not exists cardio_entries_user_source_external_idx
  on public.cardio_entries (user_id, source, external_id)
  where external_id is not null;

create index if not exists cardio_entries_user_active_occurred_at_idx
  on public.cardio_entries (user_id, occurred_at desc)
  where deleted_at is null;

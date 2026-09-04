-- Private, storage-efficient progress photos linked optionally to a weight entry.

create table if not exists public.progress_photos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_sample_id uuid,
  object_path text not null unique,
  taken_at timestamptz not null default now(),
  local_day date not null,
  daily_slot smallint not null check (daily_slot between 1 and 3),
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  byte_size integer not null check (byte_size between 1 and 2097152),
  created_at timestamptz not null default now(),
  unique (user_id, local_day, daily_slot),
  check (object_path like user_id::text || '/%')
);

alter table public.progress_photos enable row level security;
grant select, insert, delete on public.progress_photos to authenticated;

create policy "Users can read their progress photos"
on public.progress_photos
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their progress photos"
on public.progress_photos
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their progress photos"
on public.progress_photos
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'progress-photos',
  'progress-photos',
  false,
  2097152,
  array['image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their progress photo files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can upload their progress photo files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Users can delete their progress photo files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create index if not exists progress_photos_user_taken_at_idx
  on public.progress_photos (user_id, taken_at desc);

create index if not exists progress_photos_weight_sample_idx
  on public.progress_photos (user_id, weight_sample_id)
  where weight_sample_id is not null;

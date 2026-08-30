-- Store a user's selected muscle groups for each workout. Empty is retained for older sessions.

alter table public.workout_sessions
  add column if not exists muscle_groups text[] not null default '{}';

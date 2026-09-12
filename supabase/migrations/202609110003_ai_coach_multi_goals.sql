-- Allow users to choose several compatible coaching goals while preserving
-- primary_goal for older app versions during rollout.

alter table public.coach_profiles
  add column goals text[];

update public.coach_profiles
set goals = array[primary_goal]
where goals is null;

alter table public.coach_profiles
  alter column goals set default array['general_health']::text[],
  alter column goals set not null;

alter table public.coach_profiles
  add constraint coach_profiles_goals_valid check (
    cardinality(goals) between 1 and 6
    and goals <@ array[
      'muscle_gain',
      'fat_loss',
      'recomp',
      'maintenance',
      'performance',
      'general_health'
    ]::text[]
  );

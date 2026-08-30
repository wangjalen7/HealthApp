-- A user may override the automatic 0.7 g/lb protein target with a daily value.

alter table public.profiles
  add column if not exists daily_protein_goal integer
    check (daily_protein_goal is null or (daily_protein_goal >= 0 and daily_protein_goal <= 5000));

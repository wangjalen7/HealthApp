-- Nullable goals are deliberately user-defined; the app ships with no health targets.

alter table public.profiles
  add column if not exists daily_calorie_goal integer check (daily_calorie_goal is null or daily_calorie_goal >= 0),
  add column if not exists weight_goal_lb numeric(10, 2) check (weight_goal_lb is null or weight_goal_lb > 0),
  add column if not exists bp_systolic_goal integer check (bp_systolic_goal is null or bp_systolic_goal > 0),
  add column if not exists bp_diastolic_goal integer check (bp_diastolic_goal is null or bp_diastolic_goal > 0);

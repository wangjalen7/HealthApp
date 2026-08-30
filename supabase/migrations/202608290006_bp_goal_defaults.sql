-- Use the user-requested healthy BP target as the default, while leaving other goals user-defined.

update public.profiles set bp_systolic_goal = 120 where bp_systolic_goal is null;
update public.profiles set bp_diastolic_goal = 80 where bp_diastolic_goal is null;

alter table public.profiles
  alter column bp_systolic_goal set default 120,
  alter column bp_diastolic_goal set default 80;

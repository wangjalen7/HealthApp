-- Hosted Supabase default privileges grant anon EXECUTE directly. Revoking
-- PUBLIC alone does not remove those grants; restrict the new Summary RPCs.
revoke all on function public.invalidate_food_completion() from public, anon, authenticated;
revoke all on function
 public.set_food_day_complete(date,text,boolean),
 public.ensure_streak_tracking(date,text),
 public.save_streak_rule(text,boolean,jsonb,text,uuid),
 public.save_daily_goals_with_history(jsonb,text,uuid)
from public, anon;

grant execute on function
 public.set_food_day_complete(date,text,boolean),
 public.ensure_streak_tracking(date,text),
 public.save_streak_rule(text,boolean,jsonb,text,uuid),
 public.save_daily_goals_with_history(jsonb,text,uuid)
to authenticated;

-- Preserve historical calorie ranges. New changes use inclusive directional targets.
-- BP is explicitly reinterpreted as daily (including imports) in the client engine.
create or replace function public.save_streak_rule(p_habit text,p_enabled boolean,p_config jsonb,p_zone text,p_user_id uuid default auth.uid()) returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); today date:=(now() at time zone p_zone)::date; activation date; effective date; begin
 perform public.require_active_session(u);
 if p_user_id is distinct from u then raise insufficient_privilege using message='Account changed; reopen settings'; end if;
 if p_habit='calorie_target' and coalesce(p_config->>'calorieMode','') not in ('under','over') then raise exception 'Choose at or under, or at or over'; end if;
 if p_habit='bp' then p_config:=p_config || '{"weekdays":[0,1,2,3,4,5,6],"includeImports":true}'::jsonb; end if;
 if p_habit='reminder' then raise exception 'Reminder rules are stored on this device'; end if;
 if jsonb_typeof(p_config)<>'object' or (p_config ? 'trainingDays' and ((p_config->>'trainingDays')::int not between 1 and 7)) or (p_config ? 'tolerance' and ((p_config->>'tolerance')::numeric not between 0 and 0.5)) then raise exception 'Invalid rule'; end if;
 if p_habit='calorie_target' and p_config->>'calorieMode'='range' and (not(p_config ? 'lower' and p_config ? 'upper') or (p_config->>'lower')::numeric<=0 or (p_config->>'upper')::numeric<(p_config->>'lower')::numeric or (p_config->>'upper')::numeric>20000) then raise exception 'Invalid range'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,19));
 select min(activation_day) into activation from streak_rules where user_id=u and habit=p_habit;
 effective:=case when activation is null then today else today+1 end;
 if p_habit='training' then effective:=case when activation is null then date_trunc('week',today::timestamp)::date else effective+((8-extract(isodow from effective)::int)%7) end; end if;
 activation:=coalesce(activation,effective);
 insert into streak_rules values(u,p_habit,effective,activation,p_enabled,1,p_config)
 on conflict(user_id,habit,effective_day) do update set enabled=excluded.enabled,config=excluded.config;
end $$;

create function public.initialize_summary_streaks(p_habits text[],p_zone text) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); today date:=(now() at time zone p_zone)::date; h text; first_day date; missing text[]; begin
 perform public.require_active_session(u);
 if cardinality(p_habits)>10 then raise exception 'Invalid habits'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,19));
 select array_agg(distinct x) into missing from unnest(p_habits) x where not exists(select 1 from streak_rules r where r.user_id=u and r.habit=x);
 perform public.ensure_streak_tracking(today,p_zone);
 foreach h in array coalesce(missing,'{}'::text[]) loop
  if h not in ('daily_logging','food_logging','food_complete','calorie_target','protein_target','fluid_logging','fluid_target','training','weight','bp') then raise exception 'Invalid habit'; end if;
  -- The default rule applies to available saved history. Targets only qualify where
  -- dated goal snapshots exist; no current goal is invented for earlier days.
  select least(today,coalesce(min(d),today)) into first_day from (
   select (occurred_at at time zone p_zone)::date d from nutrition_entries where user_id=u and h in ('daily_logging','food_logging','food_complete','calorie_target','protein_target')
   union all select (occurred_at at time zone p_zone)::date from hydration_entries where user_id=u and h in ('daily_logging','fluid_logging','fluid_target')
   union all select (completed_at at time zone p_zone)::date from workout_sessions where user_id=u and h in ('daily_logging','training')
   union all select (occurred_at at time zone p_zone)::date from cardio_entries where user_id=u and h in ('daily_logging','training')
   union all select (occurred_at at time zone p_zone)::date from vital_samples where user_id=u and deleted_at is null and (h='daily_logging' or h='weight' and kind='weight' or h='bp' and kind in ('systolic_bp','diastolic_bp'))
  ) dates;
  if h='training' then first_day:=date_trunc('week',first_day::timestamp)::date; end if;
  if h in ('calorie_target','protein_target','fluid_target') then
    select greatest(first_day,coalesce(min(effective_day),today)) into first_day from streak_goal_snapshots where user_id=u;
  end if;
  -- ensure_streak_tracking may just have inserted the default daily rule.
  if h='daily_logging' then delete from streak_rules where user_id=u and habit=h; end if;
  insert into streak_rules values(u,h,first_day,first_day,true,1,jsonb_build_object('calorieMode','under','trainingDays',3,'includeImports',h='bp')) on conflict do nothing;
 end loop;
end $$;
revoke all on function public.initialize_summary_streaks(text[],text) from public,anon;
grant execute on function public.initialize_summary_streaks(text[],text) to authenticated;
revoke all on function public.save_streak_rule(text,boolean,jsonb,text,uuid) from public,anon;
grant execute on function public.save_streak_rule(text,boolean,jsonb,text,uuid) to authenticated;

-- Retain completed range-based days. Transition at the next local day (or the
-- latest already-scheduled revision), never reinterpret completed calorie weeks.
insert into public.streak_rules(user_id,habit,effective_day,activation_day,enabled,version,config)
select r.user_id,r.habit,greatest(r.effective_day,(now() at time zone coalesce(a.time_zone,'UTC'))::date+1),r.activation_day,r.enabled,1,
 (r.config-'lower'-'upper'-'tolerance') || '{"calorieMode":"under"}'::jsonb
from (select distinct on(user_id) * from public.streak_rules where habit='calorie_target' order by user_id,effective_day desc) r
left join public.streak_activation a on a.user_id=r.user_id
where coalesce(r.config->>'calorieMode','tolerance') in ('range','tolerance')
on conflict(user_id,habit,effective_day) do update set config=excluded.config;

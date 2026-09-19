-- Synthetic accounts only, rolled back. Run after both 202609180001 and 202609180002.
begin;
do $$ declare f text; begin
 foreach f in array array[
  'public.set_food_day_complete(date,text,boolean)',
  'public.ensure_streak_tracking(date,text)',
  'public.save_streak_rule(text,boolean,jsonb,text,uuid)',
  'public.save_daily_goals_with_history(jsonb,text,uuid)'
 ] loop
  if has_function_privilege('anon',f,'EXECUTE') then raise exception 'Anonymous execution allowed on %',f; end if;
  if not has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'Authenticated execution missing on %',f; end if;
 end loop;
 if has_function_privilege('anon','public.invalidate_food_completion()','EXECUTE')
  or has_function_privilege('authenticated','public.invalidate_food_completion()','EXECUTE') then
  raise exception 'Trigger function exposed to clients';
 end if;
end $$;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111119','summary-a@example.invalid'),
 ('22222222-2222-4222-8222-222222222229','summary-b@example.invalid');
insert into public.profiles(id,daily_calorie_goal,daily_protein_goal,daily_water_goal_ml,weight_goal_lb,bp_systolic_goal,bp_diastolic_goal)
 values ('11111111-1111-4111-8111-111111111119',2000,null,2400,180,120,80),('22222222-2222-4222-8222-222222222229',2200,150,2500,190,120,80)
 on conflict(id) do update set daily_calorie_goal=excluded.daily_calorie_goal,daily_protein_goal=excluded.daily_protein_goal,daily_water_goal_ml=excluded.daily_water_goal_ml;
insert into vital_samples(id,user_id,kind,value,unit,occurred_at,source) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9','11111111-1111-4111-8111-111111111119','weight',180,'lb',now()-interval '1 hour','manual');
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111119';
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111119","role":"authenticated"}';
select public.ensure_streak_tracking((now() at time zone 'UTC')::date,'UTC');
select public.save_streak_rule('calorie_target',true,'{"calorieMode":"tolerance","tolerance":0.1}','UTC');
do $$ begin
 if (select protein_goal from public.streak_goal_snapshots where effective_day=(now() at time zone 'UTC')::date) <>126 then raise exception 'Automatic protein not resolved'; end if;
 if exists(select 1 from public.streak_goal_snapshots where effective_day<(now() at time zone 'UTC')::date) then raise exception 'Unknown historical goals invented'; end if;
 if (select count(*) from public.streak_rules)<>2 then raise exception 'Rules missing'; end if;
 begin
  insert into public.streak_rules values('22222222-2222-4222-8222-222222222229','weight',current_date,current_date,true,1,'{}');
  raise exception 'Cross-account rule insert allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.vital_samples set value=200 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
set local role authenticated;
select public.ensure_streak_tracking((now() at time zone 'UTC')::date,'UTC');
do $$ begin
 if (select protein_goal from public.streak_goal_snapshots where effective_day=(now() at time zone 'UTC')::date)<>126 then raise exception 'New weight rewrote a resolved protein target'; end if;
 begin perform public.save_streak_rule('weight',true,'{}','UTC','22222222-2222-4222-8222-222222222229');raise exception 'Stale account write allowed';exception when insufficient_privilege then null;end;
end $$;
select public.save_daily_goals_with_history('{"daily_calorie_goal":2100,"daily_protein_goal":160,"daily_water_goal_ml":2600,"weight_goal_lb":175,"bp_systolic_goal":120,"bp_diastolic_goal":80,"calorie_goal_calculation":{"method":"custom"},"fluid_goal_calculation":{"method":"custom"}}','UTC');
do $$ begin
 if (select calorie_goal from public.streak_goal_snapshots where effective_day=(now() at time zone 'UTC')::date)<>2000 then raise exception 'Today target changed retroactively'; end if;
 if (select calorie_goal from public.streak_goal_snapshots where effective_day=(now() at time zone 'UTC')::date+1)<>2100 then raise exception 'Next-day target missing'; end if;
 if (select daily_water_goal_ml from public.profiles where id=auth.uid())<>2600 then raise exception 'Profile compatibility broken'; end if;
end $$;
insert into public.nutrition_entries(id,user_id,meal_log_id,food_name,calories,protein_grams,occurred_at) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9',auth.uid(),'cccccccc-cccc-4ccc-8ccc-ccccccccccc9','Synthetic food',2000,100,now());
select public.set_food_day_complete((now() at time zone 'UTC')::date,'UTC',true);
do $$ begin
 if (select count(*) from public.food_day_completions)<>1 then raise exception 'Confirmation missing'; end if;
 if (select fingerprint from public.food_day_completions)<>'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9:1' then raise exception 'Invalid entry fingerprint'; end if;
end $$;
update public.nutrition_entries set calories=2050 where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
do $$ begin
 if exists(select 1 from public.food_day_completions) then raise exception 'Food edit did not clear confirmation'; end if;
 if (select revision from public.nutrition_entries where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9')<>2 then raise exception 'Revision not advanced'; end if;
end $$;
select public.set_food_day_complete((now() at time zone 'UTC')::date,'UTC',true);
select public.set_food_day_complete((now() at time zone 'UTC')::date,'UTC',false);
do $$ begin if exists(select 1 from public.food_day_completions) then raise exception 'Undo failed'; end if; end $$;
select public.set_food_day_complete((now() at time zone 'UTC')::date,'UTC',true);
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222229';
set local request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222229","role":"authenticated"}';
do $$ declare t text; n integer; begin
 foreach t in array array['streak_rules','streak_goal_snapshots','streak_activation','food_day_completions'] loop
  execute format('select count(*) from public.%I',t) into n;
  if n<>0 then raise exception 'Account A data exposed in %',t; end if;
  begin execute format('delete from public.%I',t); raise exception 'Direct mutation allowed in %',t; exception when insufficient_privilege then null; end;
 end loop;
end $$;
select public.ensure_streak_tracking((now() at time zone 'UTC')::date,'UTC');
do $$ begin if (select count(*) from public.streak_rules)<>1 then raise exception 'Account B initialization not isolated'; end if; end $$;
reset role;
set local role anon;
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';
do $$ begin
 begin perform public.set_food_day_complete(current_date,'UTC',true);raise exception 'Unauthenticated write allowed';exception when insufficient_privilege then null;end;
 begin perform public.save_streak_rule('weight',true,'{}','UTC');raise exception 'Unauthenticated rule write allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;

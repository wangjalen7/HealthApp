-- Dated, account-owned streak rules and targets. Dashboard presentation stays local.
create table public.streak_rules (
 user_id uuid not null references auth.users(id) on delete cascade,
 habit text not null check (habit in ('daily_logging','food_logging','food_complete','calorie_target','protein_target','fluid_logging','fluid_target','training','weight','bp','reminder')),
 effective_day date not null, activation_day date not null,
 enabled boolean not null, version integer not null default 1 check (version=1),
 config jsonb not null default '{}' check (jsonb_typeof(config)='object'),
 primary key(user_id,habit,effective_day), check(effective_day>=activation_day)
);
create table public.streak_goal_snapshots (
 user_id uuid not null references auth.users(id) on delete cascade,
 effective_day date not null, calorie_goal numeric, protein_goal numeric, fluid_goal_ml numeric,
 protein_source text not null, weight_id uuid, provenance jsonb not null default '{}',
 primary key(user_id,effective_day),
 check(calorie_goal is null or calorie_goal between 0 and 20000),
 check(protein_goal is null or protein_goal between 0 and 5000),
 check(fluid_goal_ml is null or fluid_goal_ml between 0 and 20000)
);
create table public.streak_activation (
 user_id uuid primary key references auth.users(id) on delete cascade,
 local_day date not null, time_zone text not null
);
alter table public.nutrition_entries add column revision bigint not null default 1;
create table public.food_day_completions (
 user_id uuid not null references auth.users(id) on delete cascade,
 local_day date not null, time_zone text not null, fingerprint text not null,
 confirmed_at timestamptz not null default now(), primary key(user_id,local_day)
);
do $$ declare t text; begin
 foreach t in array array['streak_rules','streak_goal_snapshots','streak_activation','food_day_completions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy own_read on public.%I for select to authenticated using (user_id=(select auth.uid()))',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

-- Serialize confirmations and food mutations per account, including concurrent devices.
create function public.invalidate_food_completion() returns trigger language plpgsql security definer set search_path=public as $$
declare u uuid; c record; begin
 u:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 perform pg_advisory_xact_lock(hashtextextended(u::text,18));
 for c in select * from food_day_completions where user_id=u loop
  if (tg_op<>'INSERT' and (old.occurred_at at time zone c.time_zone)::date=c.local_day)
    or (tg_op<>'DELETE' and (new.occurred_at at time zone c.time_zone)::date=c.local_day) then
   delete from food_day_completions where user_id=u and local_day=c.local_day;
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 new.revision:=case when tg_op='UPDATE' then old.revision+1 else 1 end;
 return new;
end $$;
create trigger nutrition_confirmation_revision before insert or update or delete on public.nutrition_entries for each row execute function public.invalidate_food_completion();

create function public.set_food_day_complete(p_day date,p_zone text,p_complete boolean) returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); fingerprint text; begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_day>(now() at time zone p_zone)::date then raise exception 'Cannot confirm a future day'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,18));
 if not p_complete then delete from food_day_completions where user_id=u and local_day=p_day; return; end if;
 select coalesce(string_agg(id::text||':'||revision::text,',' order by id::text),'') into fingerprint from nutrition_entries
 where user_id=u and occurred_at >= p_day::timestamp at time zone p_zone and occurred_at < (p_day+1)::timestamp at time zone p_zone;
 insert into food_day_completions values(u,p_day,p_zone,fingerprint,now()) on conflict(user_id,local_day) do update set time_zone=excluded.time_zone,fingerprint=excluded.fingerprint,confirmed_at=excluded.confirmed_at;
end $$;

-- Freeze a resolved protein value per evaluated local date. Future evaluations use
-- the latest eligible weight at/before that day's end; prior snapshots never use a newer weight.
create function public.ensure_streak_tracking(p_day date,p_zone text) returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); p profiles; a date; d date; g streak_goal_snapshots; w vital_samples; begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_day<>(now() at time zone p_zone)::date then raise exception 'Activation must be today'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,19));
 select * into p from profiles where id=u;
 insert into streak_activation values(u,p_day,p_zone) on conflict do nothing;
 select local_day into a from streak_activation where user_id=u;
 for d in select generate_series(a,p_day,'1 day')::date loop
  -- A future Profile change with automatic protein is a pending target. Resolve
  -- it when that day arrives, then freeze the numeric value and provenance.
  if exists(select 1 from streak_goal_snapshots where user_id=u and effective_day=d and not(protein_source='automatic' and (protein_goal is null or coalesce(provenance->>'source','')='profile_change'))) then continue; end if;
  select * into g from streak_goal_snapshots where user_id=u and effective_day=d;
  if g.user_id is null then
  select * into g from streak_goal_snapshots where user_id=u and effective_day<d order by effective_day desc limit 1;
  end if;
  if g.user_id is null then
   g.calorie_goal:=p.daily_calorie_goal; g.protein_goal:=p.daily_protein_goal; g.fluid_goal_ml:=p.daily_water_goal_ml;
   g.protein_source:=case when p.daily_protein_goal is null then 'automatic' else 'profile' end;
  end if;
  if g.protein_source='automatic' then
   select * into w from vital_samples where user_id=u and kind='weight' and value>0 and unit in ('lb','kg') and deleted_at is null
    and occurred_at < (d+1)::timestamp at time zone p_zone and occurred_at<=now() order by occurred_at desc,id limit 1;
   g.protein_goal:=case when w.id is null then null else round(w.value * case when w.unit='kg' then 2.20462 else 1 end * 0.7) end;
   g.weight_id:=w.id;
  end if;
  insert into streak_goal_snapshots values(u,d,g.calorie_goal,g.protein_goal,g.fluid_goal_ml,g.protein_source,g.weight_id,jsonb_build_object('zone',p_zone,'resolvedAt',now(),'method','daily_snapshot_v1'))
  on conflict(user_id,effective_day) do update set protein_goal=excluded.protein_goal,weight_id=excluded.weight_id,provenance=excluded.provenance;
 end loop;
 insert into streak_rules values(u,'daily_logging',a,a,true,1,'{}') on conflict do nothing;
end $$;

create function public.save_streak_rule(p_habit text,p_enabled boolean,p_config jsonb,p_zone text,p_user_id uuid default auth.uid()) returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); today date:=(now() at time zone p_zone)::date; activation date; effective date; begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_user_id is distinct from u then raise insufficient_privilege using message='Account changed; reopen settings'; end if;
 if p_habit='reminder' then raise exception 'Reminder rules are stored on this device'; end if;
 if jsonb_typeof(p_config)<>'object' or (p_config ? 'trainingDays' and ((p_config->>'trainingDays')::int not between 1 and 7)) or (p_config ? 'tolerance' and ((p_config->>'tolerance')::numeric not between 0 and 0.5)) then raise exception 'Invalid rule'; end if;
 if p_habit='calorie_target' and p_config->>'calorieMode'='range' and (not(p_config ? 'lower' and p_config ? 'upper') or (p_config->>'lower')::numeric<=0 or (p_config->>'upper')::numeric<(p_config->>'lower')::numeric or (p_config->>'upper')::numeric>20000) then raise exception 'Invalid range'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,19));
 select min(activation_day) into activation from streak_rules where user_id=u and habit=p_habit;
 effective:=case when activation is null then today else today+1 end;
 if p_habit='training' then effective:=effective+((8-extract(isodow from effective)::int)%7); end if;
 activation:=coalesce(activation,effective);
 insert into streak_rules values(u,p_habit,effective,activation,p_enabled,1,p_config)
 on conflict(user_id,habit,effective_day) do update set enabled=excluded.enabled,config=excluded.config;
end $$;

-- One transaction keeps today's snapshot and updates all existing Profile goals.
create function public.save_daily_goals_with_history(p_goals jsonb,p_zone text,p_user_id uuid default auth.uid()) returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); today date:=(now() at time zone p_zone)::date; p profiles; begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_user_id is distinct from u then raise insufficient_privilege using message='Account changed; reopen goals'; end if;
 perform ensure_streak_tracking(today,p_zone);
 update profiles set
 daily_calorie_goal=(p_goals->>'daily_calorie_goal')::integer,
 daily_protein_goal=(p_goals->>'daily_protein_goal')::integer,
 daily_water_goal_ml=(p_goals->>'daily_water_goal_ml')::numeric,
 weight_goal_lb=(p_goals->>'weight_goal_lb')::numeric,
 bp_systolic_goal=(p_goals->>'bp_systolic_goal')::integer,
 bp_diastolic_goal=(p_goals->>'bp_diastolic_goal')::integer,
 calorie_goal_calculation=p_goals->'calorie_goal_calculation',fluid_goal_calculation=p_goals->'fluid_goal_calculation'
 where id=u returning * into p;
 insert into streak_goal_snapshots values(u,today+1,p.daily_calorie_goal,p.daily_protein_goal,p.daily_water_goal_ml,
 case when p.daily_protein_goal is null then 'automatic' else 'profile' end,null,jsonb_build_object('zone',p_zone,'source','profile_change'))
 on conflict(user_id,effective_day) do update set calorie_goal=excluded.calorie_goal,protein_goal=excluded.protein_goal,fluid_goal_ml=excluded.fluid_goal_ml,protein_source=excluded.protein_source,weight_id=null,provenance=excluded.provenance;
end $$;
revoke all on function public.invalidate_food_completion() from public;
revoke all on function public.set_food_day_complete(date,text,boolean),public.ensure_streak_tracking(date,text),public.save_streak_rule(text,boolean,jsonb,text,uuid),public.save_daily_goals_with_history(jsonb,text,uuid) from public;
grant execute on function public.set_food_day_complete(date,text,boolean),public.ensure_streak_tracking(date,text),public.save_streak_rule(text,boolean,jsonb,text,uuid),public.save_daily_goals_with_history(jsonb,text,uuid) to authenticated;

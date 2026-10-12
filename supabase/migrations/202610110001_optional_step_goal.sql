-- Optional goal only: step history stays device-local. Existing accounts remain null.
-- Preserve authenticated CAS, operation receipts and all existing dated goal behavior.
alter table public.profiles add column daily_step_goal integer
  check (daily_step_goal is null or daily_step_goal > 0);

create or replace function public.save_daily_goals_with_history(p_goals jsonb,p_zone text,p_user_id uuid default auth.uid()) returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); today date:=(now() at time zone p_zone)::date; p profiles; begin
 if u is null then raise exception 'Authentication required'; end if;
 if p_user_id is distinct from u then raise insufficient_privilege using message='Account changed; reopen goals'; end if;
 perform ensure_streak_tracking(today,p_zone);
 update profiles set
 daily_step_goal=(p_goals->>'daily_step_goal')::integer,
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

create or replace function public.commit_health_mutation(p_user_id uuid,p_operation_id uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  receipt public.mutation_receipts; t text=p_request->>'table'; action text=p_request->>'action';
  item jsonb; values_json jsonb; current_row jsonb; result_row jsonb; result jsonb='[]';
  rid uuid; expected bigint; columns_sql text; values_sql text; updates_sql text; k text;
  allowed text[]; groups text[]; profile_json jsonb; patch jsonb; baseline jsonb;
begin
  perform public.require_active_session(p_user_id);
  if p_operation_id is null or p_request is null then raise exception 'Operation ID and request required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_operation_id::text,0));
  select * into receipt from public.mutation_receipts where user_id=p_user_id and operation_id=p_operation_id;
  if found then
    if receipt.request is distinct from p_request then raise exception 'Operation ID reused with different content' using errcode='22023'; end if;
    return receipt.response;
  end if;
  -- Serialize changes per account. Also avoids inverse record/cursor lock ordering.
  perform 1 from auth.users where id=p_user_id for update;
  perform public.require_active_session(p_user_id);

  if action='goals' then
    select to_jsonb(p) into profile_json from public.profiles p where id=p_user_id for update;
    patch=p_request->'changes'; baseline=p_request->'baseline';
    if jsonb_typeof(patch) is distinct from 'object' or jsonb_typeof(baseline) is distinct from 'object' then raise exception 'Invalid goal patch'; end if;
    for k in select jsonb_object_keys(patch) loop
      if not k=any(array['daily_step_goal','daily_calorie_goal','daily_protein_goal','daily_water_goal_ml','weight_goal_lb','bp_systolic_goal','bp_diastolic_goal','calorie_goal_calculation','fluid_goal_calculation']) then raise exception 'Invalid goal field'; end if;
      if not baseline ? k or profile_json->k is distinct from baseline->k then
        return jsonb_build_object('status','conflict','field',k,'current',profile_json);
      end if;
    end loop;
    perform public.save_daily_goals_with_history(jsonb_strip_nulls(profile_json||patch),p_request->>'zone',p_user_id);
    select to_jsonb(p) into result from public.profiles p where id=p_user_id;
  elsif action in ('create_workout','replace_workout') then
    rid=(p_request->>'id')::uuid;
    select to_jsonb(w) into current_row from public.workout_sessions w where id=rid and user_id=p_user_id for update;
    if action='create_workout' then
      if current_row is not null or exists(select 1 from public.deleted_record_ids where user_id=p_user_id and table_name='workout_sessions' and record_id=rid) then
        return jsonb_build_object('status','conflict','current',current_row);
      end if;
      insert into public.workout_sessions(id,user_id,title,started_at,completed_at,template_name)
      values(rid,p_user_id,p_request->>'title',(p_request->>'occurred_at')::timestamptz,(p_request->>'occurred_at')::timestamptz,p_request->>'template_name');
    elsif current_row is null or (current_row->>'version')::bigint is distinct from (p_request->>'version')::bigint then
      return jsonb_build_object('status','conflict','current',current_row);
    end if;
    if jsonb_typeof(p_request->'sets') is distinct from 'array' or jsonb_array_length(p_request->'sets') not between 1 and 5000 then raise exception 'Invalid workout sets'; end if;
    select array_agg(value) into groups from jsonb_array_elements_text(p_request->'muscle_groups');
    if groups is null or cardinality(groups) not between 1 and 7 or not groups <@ array['Back','Chest','Tri','Bi','Delt','Legs','Abs'] then raise exception 'Invalid muscle groups'; end if;
    if exists(select 1 from jsonb_array_elements(p_request->'sets') s where (s->>'weight')::numeric>5000 or (s->>'right_weight')::numeric>5000) then raise exception 'Invalid working weight'; end if;
    perform public.replace_workout_session(rid,p_request->>'title',groups,p_request->>'location',p_request->>'notes',p_request->'sets');
    select to_jsonb(w)||jsonb_build_object('sets',(select jsonb_agg(to_jsonb(s) order by exercise_order,set_number,id) from public.workout_sets s where session_id=rid and user_id=p_user_id)) into result from public.workout_sessions w where id=rid and user_id=p_user_id;
  else
    if t is null or not t=any(array['vital_samples','cardio_entries','nutrition_entries','hydration_entries','user_food_profiles','food_recipes','saved_drinks','progress_photos','workout_sessions'])
      or action is null or not action=any(array['create','update','delete']) or (t='workout_sessions' and action<>'delete') or (t='progress_photos' and action='update') then raise exception 'Unsupported mutation'; end if;
    if jsonb_typeof(p_request->'rows') is distinct from 'array' or jsonb_array_length(p_request->'rows') not between 1 and 500 then raise exception 'Invalid mutation rows'; end if;
    select array_agg(column_name::text) into allowed from information_schema.columns where table_schema='public' and table_name=t and is_generated='NEVER'
      and column_name not in ('id','user_id','version','change_seq','created_at','updated_at');
    -- Validate all versions before any mutation, so a conflict is all-or-nothing.
    for item in select value from jsonb_array_elements(p_request->'rows') loop
      rid=(item->>'id')::uuid; expected=(item->>'version')::bigint;
      execute format('select to_jsonb(r) from public.%I r where id=$1 and user_id=$2 for update',t) into current_row using rid,p_user_id;
      if (action='create' and (current_row is not null or expected is distinct from 0 or exists(select 1 from public.deleted_record_ids where user_id=p_user_id and table_name=t and record_id=rid)))
        or (action<>'create' and (current_row is null or (current_row->>'version')::bigint is distinct from expected or current_row->>'deleted_at' is not null)) then
        return jsonb_build_object('status','conflict','id',rid,'current',current_row);
      end if;
      if action='update' and ((t='cardio_entries' and current_row->>'source'<>'manual') or (t='nutrition_entries' and current_row->>'nutrition_source'='import')) then raise exception 'Imported records cannot be edited'; end if;
      values_json=coalesce(item->'values','{}');
      if jsonb_typeof(values_json)<>'object' then raise exception 'Invalid record'; end if;
      for k in select jsonb_object_keys(values_json) loop
        if not k=any(allowed) or k='deleted_at' then raise exception 'Unsupported field: %',k; end if;
        if action='update' and t in ('vital_samples','cardio_entries','nutrition_entries') and k=any(array['source','external_id','kind','nutrition_source','food_profile_id','recipe_id','meal_log_id']) then raise exception 'Immutable record field: %',k; end if;
      end loop;
    end loop;
    if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_request->'rows')) then raise exception 'Duplicate record in operation'; end if;
    for item in select value from jsonb_array_elements(p_request->'rows') loop
      rid=(item->>'id')::uuid; values_json=coalesce(item->'values','{}');
      if action='delete' then
        if t in ('vital_samples','cardio_entries') then
          execute format('update public.%I set deleted_at=now() where id=$1 and user_id=$2 returning to_jsonb(%I.*)',t,t) into result_row using rid,p_user_id;
        else
          execute format('delete from public.%I where id=$1 and user_id=$2 returning to_jsonb(%I.*)',t,t) into result_row using rid,p_user_id;
        end if;
        insert into public.deleted_record_ids values(p_user_id,t,rid) on conflict do nothing;
      elsif action='create' then
        values_json=values_json||jsonb_build_object('id',rid,'user_id',p_user_id);
        select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into columns_sql,values_sql from jsonb_object_keys(values_json) key;
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',t,columns_sql,values_sql,t,t) into result_row using values_json;
      else
        select string_agg(format('%I=r.%I',key,key),',') into updates_sql from jsonb_object_keys(values_json) key;
        if updates_sql is null then raise exception 'Empty update'; end if;
        execute format('update public.%I d set %s from jsonb_populate_record(null::public.%I,$1) r where d.id=$2 and d.user_id=$3 returning to_jsonb(d.*)',t,updates_sql,t) into result_row using values_json,rid,p_user_id;
      end if;
      result=result||jsonb_build_array(result_row);
    end loop;
  end if;
  result=jsonb_build_object('status','accepted','data',result);
  insert into public.mutation_receipts(user_id,operation_id,request,response) values(p_user_id,p_operation_id,p_request,result);
  return result;
end $$;

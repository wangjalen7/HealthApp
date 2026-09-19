-- Apply only after review and rollout coordination. Old direct writers fail closed.
-- Abort on ownership violations; never repair or delete health records silently.
do $$ begin
  if exists(select 1 from public.workout_sets s join public.workout_sessions w on w.id=s.session_id where s.user_id<>w.user_id) then
    raise exception 'Workout ownership violations exist. Review the read-only preflight before migrating.';
  end if;
end $$;
alter table public.workout_sessions add constraint workout_sessions_owner_id unique(user_id,id);
alter table public.workout_sets add constraint workout_sets_owner_parent foreign key(user_id,session_id) references public.workout_sessions(user_id,id) on delete cascade;

create table public.mutation_receipts (
  user_id uuid not null references auth.users on delete cascade,
  operation_id uuid not null, request jsonb not null, response jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id,operation_id)
);
create table public.deleted_record_ids (
  user_id uuid not null references auth.users on delete cascade,
  table_name text not null, record_id uuid not null,
  primary key(user_id,table_name,record_id)
);
create table public.vital_sync_counters (
  user_id uuid primary key references auth.users on delete cascade, value bigint not null default 0
);
alter table public.mutation_receipts enable row level security;
alter table public.deleted_record_ids enable row level security;
alter table public.vital_sync_counters enable row level security;
revoke all on public.mutation_receipts,public.deleted_record_ids,public.vital_sync_counters from public,anon,authenticated;

create function public.bump_record_version() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then new.version=1; else new.version=old.version+1; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['vital_samples','workout_sessions','cardio_entries','nutrition_entries','hydration_entries','user_food_profiles','food_recipes','saved_drinks','progress_photos'] loop
    execute format('alter table public.%I add column version bigint not null default 1',t);
    execute format('create trigger version_record before insert or update on public.%I for each row execute function public.bump_record_version()',t);
    execute format('revoke insert,update,delete on public.%I from public,anon,authenticated',t);
  end loop;
end $$;
revoke insert,update,delete on public.workout_sets from public,anon,authenticated;
revoke update on public.profiles from public,anon,authenticated;
grant update(display_name,first_name,last_name,updated_at) on public.profiles to authenticated;
revoke all on function public.replace_workout_session(uuid,text,text[],text,text,jsonb),public.save_daily_goals_with_history(jsonb,text,uuid) from public,anon,authenticated;

alter table public.vital_samples add column change_seq bigint not null default 0;
-- Backfill every existing row, including tombstones, before enabling the cursor.
with numbered as(select id,user_id,row_number() over(partition by user_id order by created_at,id) n from public.vital_samples)
update public.vital_samples v set change_seq=n.n from numbered n where v.id=n.id;
insert into public.vital_sync_counters(user_id,value) select user_id,max(change_seq) from public.vital_samples group by user_id;
create unique index vital_change_cursor on public.vital_samples(user_id,change_seq);
create function public.assign_vital_cursor() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- A per-user row lock makes allocation commit-ordered. A plain sequence does not.
  insert into public.vital_sync_counters(user_id,value) values(new.user_id,1)
    on conflict(user_id) do update set value=public.vital_sync_counters.value+1 returning value into new.change_seq;
  return new;
end $$;
create trigger vital_change_cursor before insert or update on public.vital_samples for each row execute function public.assign_vital_cursor();

create function public.read_vital_changes(p_user_id uuid,p_after bigint default 0,p_through bigint default null,p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ceiling bigint; records jsonb; last_cursor bigint;
begin
  perform public.require_active_session(p_user_id);
  select coalesce(value,0) into ceiling from public.vital_sync_counters where user_id=p_user_id;
  ceiling=coalesce(ceiling,0);
  if p_after<0 or p_after>ceiling or (p_through is not null and (p_through<p_after or p_through>ceiling)) then raise exception 'Invalid sync cursor'; end if;
  ceiling=coalesce(p_through,ceiling);
  select coalesce(jsonb_agg(to_jsonb(v) order by v.change_seq,v.id),'[]'),max(v.change_seq) into records,last_cursor
  from (select * from public.vital_samples where user_id=p_user_id and change_seq>p_after and change_seq<=ceiling order by change_seq,id limit greatest(1,least(p_limit,500))) v;
  return jsonb_build_object('rows',records,'through',ceiling,'cursor',coalesce(last_cursor,ceiling),'done',coalesce(last_cursor,ceiling)=ceiling or jsonb_array_length(records)=0);
end $$;

-- Single transaction: receipt lookup, CAS, mutation(s), and receipt persistence.
-- Table names come from this fixed allowlist; all values remain bound parameters.
create function public.commit_health_mutation(p_user_id uuid,p_operation_id uuid,p_request jsonb)
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
      if not k=any(array['daily_calorie_goal','daily_protein_goal','daily_water_goal_ml','weight_goal_lb','bp_systolic_goal','bp_diastolic_goal','calorie_goal_calculation','fluid_goal_calculation']) then raise exception 'Invalid goal field'; end if;
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

revoke all on function public.bump_record_version(),public.assign_vital_cursor(),public.read_vital_changes(uuid,bigint,bigint,integer),public.commit_health_mutation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_vital_changes(uuid,bigint,bigint,integer),public.commit_health_mutation(uuid,uuid,jsonb) to authenticated;

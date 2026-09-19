-- Synthetic fixtures only; no live records. This file always rolls back.
begin;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','one@example.invalid'),('10000000-0000-4000-8000-000000000002','two@example.invalid');
insert into auth.sessions(id,user_id,created_at) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',now()),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',now());
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare u uuid=auth.uid(); r jsonb; req jsonb; a uuid=gen_random_uuid(); rid uuid=gen_random_uuid(); v bigint; begin
  req=jsonb_build_object('table','hydration_entries','action','create','rows',jsonb_build_array(jsonb_build_object('id',rid,'version',0,'values',jsonb_build_object('fluid_name','Water','volume_ml',240,'occurred_at',now()))));
  r=public.commit_health_mutation(u,a,req);
  if r->>'status'<>'accepted' then raise exception 'create failed'; end if;
  if public.commit_health_mutation(u,a,req)<>r then raise exception 'retry changed result'; end if;
  if (select count(*) from public.hydration_entries where id=rid)<>1 then raise exception 'duplicate hydration'; end if;
  begin perform public.commit_health_mutation(u,a,req||'{"action":"delete"}'); raise exception 'mismatched reuse accepted'; exception when invalid_parameter_value then null; end;
  begin insert into public.hydration_entries(id,user_id,volume_ml,occurred_at) values(gen_random_uuid(),u,240,now()); raise exception 'direct write accepted'; exception when insufficient_privilege then null; end;
  begin perform public.enroll_biometric_device(u,gen_random_uuid(),'iPhone',repeat('a',64),'20000000-0000-4000-8000-000000000001'); raise exception 'client issued credential'; exception when insufficient_privilege then null; end;
  begin perform public.commit_health_mutation('10000000-0000-4000-8000-000000000002',gen_random_uuid(),req); raise exception 'account mismatch accepted'; exception when invalid_authorization_specification then null; end;
  -- A deliberately separate identical entry has its own ID and operation.
  req=jsonb_set(req,'{rows,0,id}',to_jsonb(gen_random_uuid()));
  perform public.commit_health_mutation(u,gen_random_uuid(),req);
  if (select count(*) from public.hydration_entries)<>2 then raise exception 'separate identical entry lost'; end if;
  -- Vitals: stale edit after deletion, direct bypass, and immutable tombstone.
  rid=gen_random_uuid();
  req=jsonb_build_object('table','vital_samples','action','create','rows',jsonb_build_array(jsonb_build_object('id',rid,'version',0,'values',jsonb_build_object('kind','weight','value',170,'unit','lb','source','manual','occurred_at',now()))));
  r=public.commit_health_mutation(u,gen_random_uuid(),req);v=(r->'data'->0->>'version')::bigint;
  req=jsonb_build_object('table','vital_samples','action','delete','rows',jsonb_build_array(jsonb_build_object('id',rid,'version',v)));
  r=public.commit_health_mutation(u,gen_random_uuid(),req);if r->>'status'<>'accepted' then raise exception 'delete failed'; end if;
  req=jsonb_build_object('table','vital_samples','action','update','rows',jsonb_build_array(jsonb_build_object('id',rid,'version',v,'values','{"value":175}'::jsonb)));
  r=public.commit_health_mutation(u,gen_random_uuid(),req);if r->>'status'<>'conflict' then raise exception 'stale update accepted'; end if;
  req=jsonb_set(req,'{rows,0,version}',to_jsonb(v+1));
  if public.commit_health_mutation(u,gen_random_uuid(),req)->>'status'<>'conflict' then raise exception 'deleted record edit accepted even with latest version'; end if;
  if (select deleted_at from public.vital_samples where id=rid) is null then raise exception 'resurrection'; end if;
  begin update public.vital_samples set deleted_at=null where id=rid; raise exception 'direct resurrection accepted'; exception when insufficient_privilege then null; end;
end $$;
-- Simulated devices share the original goal snapshot. Different fields merge;
-- the same field conflicts, even when each client has a valid session.
do $$ declare u uuid=auth.uid(); before jsonb; r jsonb; begin
  select to_jsonb(p) into before from public.profiles p where id=u;
  r=public.commit_health_mutation(u,gen_random_uuid(),jsonb_build_object('action','goals','zone','UTC','changes','{"daily_calorie_goal":2200}'::jsonb,'baseline',jsonb_build_object('daily_calorie_goal',before->'daily_calorie_goal')));
  if r->>'status'<>'accepted' then raise exception 'first goal update failed'; end if;
  r=public.commit_health_mutation(u,gen_random_uuid(),jsonb_build_object('action','goals','zone','UTC','changes','{"daily_water_goal_ml":2500}'::jsonb,'baseline',jsonb_build_object('daily_water_goal_ml',before->'daily_water_goal_ml')));
  if r->>'status'<>'accepted' or (r->'data'->>'daily_calorie_goal')::int<>2200 then raise exception 'independent goal overwritten'; end if;
  r=public.commit_health_mutation(u,gen_random_uuid(),jsonb_build_object('action','goals','zone','UTC','changes','{"daily_calorie_goal":2400}'::jsonb,'baseline',jsonb_build_object('daily_calorie_goal',before->'daily_calorie_goal')));
  if r->>'status'<>'conflict' then raise exception 'same goal silently overwritten'; end if;
  begin update public.profiles set daily_calorie_goal=1 where id=u; raise exception 'direct goal bypass'; exception when insufficient_privilege then null; end;
  begin perform public.save_daily_goals_with_history('{}','UTC',u); raise exception 'old goal RPC bypass'; exception when insufficient_privilege then null; end;
end $$;
do $$ declare u uuid=auth.uid(); rid uuid=gen_random_uuid(); operation uuid=gen_random_uuid(); req jsonb; r jsonb; v bigint; bad_id uuid=gen_random_uuid(); begin
  req=jsonb_build_object('action','create_workout','id',rid,'title','Test workout','occurred_at',now(),'muscle_groups','["Chest"]'::jsonb,'location','','notes','','sets',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'exercise_name','Press','exercise_order',1,'muscle_group','Chest','set_number',1,'weight',100,'weight_unit','lb','reps',10)));
  r=public.commit_health_mutation(u,operation,req);v=(r->'data'->>'version')::bigint;
  if r->>'status'<>'accepted' or public.commit_health_mutation(u,operation,req)<>r then raise exception 'workout create/retry failed'; end if;
  if (select count(*) from public.workout_sets where session_id=rid)<>1 then raise exception 'duplicate sets'; end if;
  req=req||jsonb_build_object('action','replace_workout','version',v,'title','Device A');
  if public.commit_health_mutation(u,gen_random_uuid(),req)->>'status'<>'accepted' then raise exception 'replacement failed'; end if;
  req=req||'{"title":"Device B"}'::jsonb;
  if public.commit_health_mutation(u,gen_random_uuid(),req)->>'status'<>'conflict' then raise exception 'stale replacement accepted'; end if;
  if (select title from public.workout_sessions where id=rid)<>'Device A' then raise exception 'replacement overwrote winner'; end if;
  -- Fails after session insertion, while inserting sets. Whole transaction rolls back.
  req=req||jsonb_build_object('action','create_workout','id',bad_id);
  req=jsonb_set(req,'{sets,0,reps}','0');
  begin perform public.commit_health_mutation(u,gen_random_uuid(),req);raise exception 'invalid sets accepted';exception when check_violation then null;end;
  if exists(select 1 from public.workout_sessions where id=bad_id) then raise exception 'partial completed workout'; end if;
end $$;
reset role;
-- Prove the relationship constraint independently of revoked client DML.
do $$ declare parent uuid=gen_random_uuid(); begin
  insert into public.workout_sessions(id,user_id,title,started_at,completed_at) values(parent,'10000000-0000-4000-8000-000000000002','Other account',now(),now());
  begin insert into public.workout_sets(id,user_id,session_id,exercise_name,set_number,weight,reps) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000001',parent,'Cross account',1,10,10);raise exception 'cross-owner set accepted';exception when foreign_key_violation then null;end;
end $$;
-- Seed beyond service row caps. Equal timestamps deliberately require a tie-break.
insert into public.vital_samples(id,user_id,kind,value,unit,occurred_at) select gen_random_uuid(),'10000000-0000-4000-8000-000000000001','weight',170,'lb',now() from generate_series(1,1207);
set local role authenticated;
do $$ declare u uuid=auth.uid(); page jsonb; cursor_value bigint=0; ceiling bigint; total integer=0; prior bigint=-1; begin
  loop
    page=public.read_vital_changes(u,cursor_value,ceiling,73);
    ceiling=(page->>'through')::bigint;cursor_value=(page->>'cursor')::bigint;
    total=total+jsonb_array_length(page->'rows');
    if cursor_value<=prior then raise exception 'nonadvancing cursor'; end if;prior=cursor_value;
    exit when (page->>'done')::boolean;
  end loop;
  if total<>1208 then raise exception 'truncated sync: %',total;end if;
  if not exists(select 1 from jsonb_array_elements(public.read_vital_changes(u,0,null,500)->'rows') r where r->>'deleted_at' is not null) then raise exception 'tombstone absent';end if;
  if public.read_vital_changes(u,cursor_value,null,73)->'rows'<>'[]'::jsonb then raise exception 'incremental repeated records';end if;
end $$;
-- Mutations after page 1 move beyond its fixed upper boundary and are read on
-- the next pass, including an unread record deleted during pagination.
do $$ declare u uuid=auth.uid(); first_page jsonb; next_page jsonb; boundary bigint; pos bigint; changed public.vital_samples; removed public.vital_samples; begin
  first_page=public.read_vital_changes(u,0,null,73);boundary=(first_page->>'through')::bigint;pos=(first_page->>'cursor')::bigint;
  select * into changed from public.vital_samples where user_id=u and change_seq>pos and deleted_at is null order by change_seq limit 1;
  select * into removed from public.vital_samples where user_id=u and change_seq>changed.change_seq and deleted_at is null order by change_seq limit 1;
  perform public.commit_health_mutation(u,gen_random_uuid(),jsonb_build_object('table','vital_samples','action','update','rows',jsonb_build_array(jsonb_build_object('id',changed.id,'version',changed.version,'values','{"value":171}'::jsonb))));
  perform public.commit_health_mutation(u,gen_random_uuid(),jsonb_build_object('table','vital_samples','action','delete','rows',jsonb_build_array(jsonb_build_object('id',removed.id,'version',removed.version))));
  loop next_page=public.read_vital_changes(u,pos,boundary,73);pos=(next_page->>'cursor')::bigint;exit when (next_page->>'done')::boolean;end loop;
  next_page=public.read_vital_changes(u,pos,null,73);
  if jsonb_array_length(next_page->'rows')<>2 then raise exception 'changes during pagination skipped';end if;
  if not exists(select 1 from jsonb_array_elements(next_page->'rows') r where r->>'id'=removed.id::text and r->>'deleted_at' is not null) then raise exception 'concurrent tombstone skipped';end if;
end $$;
reset role;
-- Service-only enrollment and single-use rotation, wrong device, expiry, password revocation.
do $$ declare u uuid='10000000-0000-4000-8000-000000000001'; d uuid=gen_random_uuid(); c uuid; begin
  c=public.enroll_biometric_device(u,d,'Test iPhone',repeat('a',64),'20000000-0000-4000-8000-000000000001');
  if public.consume_biometric_device(c,gen_random_uuid(),repeat('a',64),repeat('b',64)) is not null then raise exception 'wrong device accepted';end if;
  if public.consume_biometric_device(c,d,repeat('a',64),repeat('b',64))<>u then raise exception 'rotation failed';end if;
  if public.consume_biometric_device(c,d,repeat('a',64),repeat('c',64)) is not null then raise exception 'replay accepted';end if;
  update public.biometric_device_credentials set expires_at=now()-interval '1 second' where id=c;
  if public.consume_biometric_device(c,d,repeat('b',64),repeat('c',64)) is not null then raise exception 'expired credential accepted';end if;
  c=public.enroll_biometric_device(u,d,'Test iPhone',repeat('d',64),'20000000-0000-4000-8000-000000000001');
  update auth.users set encrypted_password='changed-test-hash' where id=u;
  if public.consume_biometric_device(c,d,repeat('d',64),repeat('e',64)) is not null then raise exception 'password change did not revoke';end if;
end $$;
delete from auth.sessions where id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  begin perform public.read_vital_changes(auth.uid());raise exception 'revoked access session read accepted';exception when invalid_authorization_specification then null;end;
  begin perform public.commit_health_mutation(auth.uid(),gen_random_uuid(),'{"action":"goals","changes":{},"baseline":{},"zone":"UTC"}');raise exception 'revoked session wrote';exception when invalid_authorization_specification then null;end;
end $$;
reset role;
-- Local sign-out of device 1 leaves device 2 usable.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select public.require_active_session(auth.uid());
reset role;
rollback;

begin;
insert into auth.users(id) values('55555555-5555-4555-8555-555555555551'),('55555555-5555-4555-8555-555555555552');
insert into auth.sessions(id,user_id) values('55555555-5555-4555-8555-555555555553','55555555-5555-4555-8555-555555555551');
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555551","session_id":"55555555-5555-4555-8555-555555555553"}',true);
set local role authenticated;
do $$ declare u uuid=auth.uid(); r jsonb; op uuid=gen_random_uuid(); request jsonb; begin
  if (select daily_step_goal from public.profiles where id=u) is not null then raise exception 'Step goal invented for existing account'; end if;
  request=jsonb_build_object('action','goals','zone','America/New_York','changes','{"daily_step_goal":8000}'::jsonb,'baseline','{"daily_step_goal":null}'::jsonb);
  r=public.commit_health_mutation(u,op,request);
  if r->>'status'<>'accepted' or (r#>>'{data,daily_step_goal}')::int<>8000 then raise exception 'Step goal save failed'; end if;
  if public.commit_health_mutation(u,op,request) is distinct from r then raise exception 'Step retry not idempotent'; end if;
  r=public.commit_health_mutation(u,gen_random_uuid(),jsonb_build_object('action','goals','zone','America/New_York','changes','{"daily_step_goal":9000}'::jsonb,'baseline','{"daily_step_goal":null}'::jsonb));
  if r->>'status'<>'conflict' then raise exception 'Stale step write did not conflict'; end if;
  r=public.commit_health_mutation(u,gen_random_uuid(),jsonb_build_object('action','goals','zone','America/New_York','changes','{"daily_calorie_goal":2100}'::jsonb,'baseline',jsonb_build_object('daily_calorie_goal',(select daily_calorie_goal from public.profiles where id=u))));
  if r->>'status'<>'accepted' or (r#>>'{data,daily_step_goal}')::int<>8000 then raise exception 'Old client erased step goal'; end if;
  begin
    perform public.commit_health_mutation(u,gen_random_uuid(),jsonb_build_object('action','goals','zone','UTC','changes','{"daily_step_goal":0}'::jsonb,'baseline','{"daily_step_goal":8000}'::jsonb));
    raise exception 'Zero goal accepted';
  exception when check_violation then null; end;
  begin
    perform public.commit_health_mutation('55555555-5555-4555-8555-555555555552',gen_random_uuid(),request);
    raise exception 'Cross account step write accepted';
  exception when invalid_authorization_specification then null; end;
  r=public.commit_health_mutation(u,gen_random_uuid(),jsonb_build_object('action','goals','zone','UTC','changes','{"daily_step_goal":null}'::jsonb,'baseline','{"daily_step_goal":8000}'::jsonb));
  if r->>'status'<>'accepted' or r#>>'{data,daily_step_goal}' is not null or (r#>>'{data,daily_calorie_goal}')::int<>2100 then raise exception 'Step removal changed other goals'; end if;
  begin update public.profiles set daily_step_goal=123 where id=u; raise exception 'Direct step update allowed'; exception when insufficient_privilege then null; end;
  if exists(select 1 from public.profiles where id<>u) then raise exception 'Profile RLS failed'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.commit_health_mutation('55555555-5555-4555-8555-555555555551',gen_random_uuid(),'{}'); raise exception 'Anonymous step mutation allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;

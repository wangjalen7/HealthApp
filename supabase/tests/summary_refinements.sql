begin;
insert into auth.users(id,email) values('22222222-2222-4222-8222-222222222222','disposable-deletion@example.invalid');
insert into auth.sessions(id,user_id) values('22222222-2222-4222-8222-222222222223','22222222-2222-4222-8222-222222222222');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"22222222-2222-4222-8222-222222222223"}',true);
insert into public.cardio_entries(id,user_id,activity_type,duration_minutes,occurred_at) values('22222222-2222-4222-8222-222222222224','22222222-2222-4222-8222-222222222222','walk',30,now()-interval '10 days');
set local role authenticated;
select public.initialize_summary_streaks(array['training','bp','calorie_target'],'UTC');
select public.initialize_summary_streaks(array['training','bp','calorie_target'],'UTC');
reset role;
do $$ begin
 if (select count(*) from public.streak_rules where user_id='22222222-2222-4222-8222-222222222222' and habit='training')<>1 then raise exception 'Initialization is not idempotent'; end if;
 if not exists(select 1 from public.streak_rules where user_id='22222222-2222-4222-8222-222222222222' and habit='training' and activation_day<=current_date-10 and extract(isodow from effective_day)=1) then raise exception 'Training history not initialized'; end if;
 if has_function_privilege('authenticated','public.prepare_account_deletion(uuid,text)','execute') or has_function_privilege('anon','public.initialize_summary_streaks(text[],text)','execute') then raise exception 'Unsafe permissions'; end if;
end $$;
insert into storage.objects(id,bucket_id,name,owner_id) values('22222222-2222-4222-8222-222222222225','progress-photos','22222222-2222-4222-8222-222222222222/orphan.jpg','22222222-2222-4222-8222-222222222222');
select public.prepare_account_deletion('22222222-2222-4222-8222-222222222222',repeat('a',64));
do $$ begin
 if public.cancel_unstarted_deletion(repeat('a',64)) then raise exception 'Active deletion was cancelled'; end if;
 if not public.cancel_unstarted_deletion(repeat('b',64)) then raise exception 'Unstarted request not sealed'; end if;
 begin
  perform public.prepare_account_deletion('22222222-2222-4222-8222-222222222222',repeat('b',64));
  raise exception 'Cancelled request started';
 exception when others then if sqlerrm='Cancelled request started' then raise; end if; end;
end $$;
do $$ begin
 if exists(select 1 from auth.sessions where user_id='22222222-2222-4222-8222-222222222222') then raise exception 'Sessions remain'; end if;
 if public.account_access_allowed() then raise exception 'Deleting account can access data'; end if;
 if not exists(select 1 from public.account_deletion_objects('22222222-2222-4222-8222-222222222222')) then raise exception 'Orphan photo omitted'; end if;
 begin
   perform public.finish_account_deletion(repeat('a',64));
   raise exception 'Premature completion';
 exception when others then if sqlerrm='Premature completion' then raise; end if; end;
 begin
   update public.cardio_entries set duration_minutes=35 where user_id='22222222-2222-4222-8222-222222222222';
   raise exception 'Writes not blocked';
 exception when sqlstate '28000' then null; end;
end $$;
-- Simulate successful Storage API object deletion and Auth API cascade, using only
-- this transaction's disposable account. The hosted API still needs integration QA.
select set_config('request.jwt.claims','{}',true);
delete from storage.objects where owner_id='22222222-2222-4222-8222-222222222222';
delete from auth.users where id='22222222-2222-4222-8222-222222222222';
select public.finish_account_deletion(repeat('a',64));
select public.finish_account_deletion(repeat('a',64));
do $$ begin
 if not exists(select 1 from public.account_deletion_jobs where token_hash=repeat('a',64) and completed and user_id is null) then raise exception 'Missing anonymous completion receipt'; end if;
end $$;
rollback;

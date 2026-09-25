-- Synthetic fixtures only; always rolled back. Run with the isolated harness.
begin;
insert into auth.users(id,email) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','privacy-a@example.invalid'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','privacy-b@example.invalid');
insert into public.ai_processing_choices(user_id,purpose,notice_version) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','meal','2026-09-25.1'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','meal','2026-09-25.1');
insert into public.coach_profiles(user_id,primary_goal,experience_level,training_days_per_week,session_minutes,consented_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','general_health','beginner',3,30,now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','general_health','beginner',3,30,now());
insert into public.coach_threads(id,user_id,title) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic plan'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Other plan');
insert into auth.sessions(id,user_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.ai_processing_choices) <> 1 then raise exception 'Consent receipt isolation failed'; end if;
 begin
   insert into public.ai_processing_choices(user_id,purpose,notice_version) values(auth.uid(),'workout','fake');
   raise exception 'Client forged a server receipt';
 exception when insufficient_privilege then null; end;
 perform public.clear_saved_ai_data();
 if exists(select 1 from public.coach_threads) or exists(select 1 from public.coach_profiles) then raise exception 'Planner cleanup incomplete'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.coach_threads) <> 1 then raise exception 'Cross-account deletion'; end if;
 if (select count(*) from public.ai_processing_choices) <> 2 then raise exception 'Consent evidence unexpectedly deleted'; end if;
 if has_function_privilege('anon','public.clear_saved_ai_data()','execute') then raise exception 'Anonymous cleanup allowed'; end if;
end $$;
select public.prepare_account_deletion('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('c',64));
do $$ begin
 begin
   update public.ai_processing_choices set chosen_at=now() where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
   raise exception 'Late service write accepted';
 exception when sqlstate '28000' then null; end;
end $$;
select set_config('request.jwt.claims','{}',true);
delete from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select public.finish_account_deletion(repeat('c',64));
do $$ begin
 if exists(select 1 from public.ai_processing_choices where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'Consent not cascaded'; end if;
end $$;
rollback;

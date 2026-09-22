begin;
do $$ begin
 if not exists(select 1 from public.account_setup where user_id='99999999-9999-4999-8999-999999999999' and completed_at is not null) then raise exception 'Existing account was not backfilled'; end if;
end $$;
insert into auth.users(id) values('88888888-8888-4888-8888-888888888888'),('77777777-7777-4777-8777-777777777777');
insert into auth.sessions(id,user_id) values('66666666-6666-4666-8666-666666666666','88888888-8888-4888-8888-888888888888');
select set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","session_id":"66666666-6666-4666-8666-666666666666"}',true);
set local role authenticated;
do $$ declare r jsonb; begin
 if (select count(*) from public.account_setup)<>1 then raise exception 'RLS isolation failed'; end if;
 if exists(select 1 from public.account_setup where completed_at is not null) then raise exception 'New user should be incomplete'; end if;
 begin update public.account_setup set preferred_name='bypass'; raise exception 'direct update allowed'; exception when insufficient_privilege then null; end;
 begin perform public.save_account_setup('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111',1,'{}');raise exception 'cross account write allowed'; exception when invalid_authorization_specification then null; end;
 r=public.save_account_setup('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111',1,'{"preferred_name":"王 Jalen","step":"goals"}');
 if r->>'status'<>'accepted' or r#>>'{data,version}'<>'2' then raise exception 'save failed'; end if;
 r=public.save_account_setup('88888888-8888-4888-8888-888888888888','22222222-2222-4222-8222-222222222222',1,'{"preferred_name":"stale"}');
 if r->>'status'<>'conflict' then raise exception 'stale update allowed'; end if;
 r=public.save_account_setup('88888888-8888-4888-8888-888888888888','33333333-3333-4333-8333-333333333333',2,'{"complete":true,"step":"summary"}');
 if r#>>'{data,completed_at}' is null then raise exception 'complete failed'; end if;
 r=public.save_account_setup('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111',1,'{"preferred_name":"王 Jalen","step":"goals"}');
 if (select version from public.account_setup)<>3 or (select completed_at from public.account_setup) is null then raise exception 'lost reply replay changed state'; end if;
 r=public.save_account_setup('88888888-8888-4888-8888-888888888888','44444444-4444-4444-8444-444444444444',3,'{"complete":false,"preferred_name":"Updated"}');
 if r#>>'{data,completed_at}' is null then raise exception 'completion regressed'; end if;
 if exists(select 1 from public.profiles where id='88888888-8888-4888-8888-888888888888' and daily_calorie_goal is not null) then raise exception 'skipping changed goals'; end if;
end $$;
reset role;
delete from auth.sessions where id='66666666-6666-4666-8666-666666666666';
set local role authenticated;
do $$ begin
 begin perform public.save_account_setup('88888888-8888-4888-8888-888888888888','55555555-5555-4555-8555-555555555555',4,'{}');raise exception 'revoked session allowed';exception when invalid_authorization_specification then null;end;
end $$;
rollback;

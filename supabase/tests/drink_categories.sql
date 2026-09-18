-- Synthetic fixtures only; run after the migration with db query --linked --file.
begin;
create temporary table drink_fixture (like public.hydration_entries including defaults including generated including constraints);
create temporary table saved_drink_fixture (like public.saved_drinks including defaults including constraints);
do $$
declare a uuid := '11111111-1111-4111-8111-111111111111';
begin
  insert into drink_fixture(id,user_id,fluid_name,volume_ml,occurred_at) values (gen_random_uuid(),a,'Legacy wine',150,now());
  insert into drink_fixture(id,user_id,fluid_name,volume_ml,occurred_at,category_id,alcohol_status,counting_policy) values
    (gen_random_uuid(),a,'Coffee',250,now(),'coffee','nonalcoholic','beverage_volume_v1'),
    (gen_random_uuid(),a,'Wine',150,now(),'wine','alcoholic','beverage_volume_v1'),
    (gen_random_uuid(),a,'Unknown',100,now(),'other','unknown','beverage_volume_v1');
  if (select sum(counted_ml) from drink_fixture) <> 400 then raise exception 'Incorrect credit or legacy preservation'; end if;
  if (select count(*) from drink_fixture where counted_ml is null) <> 1 then raise exception 'Unknown must remain null'; end if;
  begin
    insert into drink_fixture(id,user_id,volume_ml,occurred_at,category_id,alcohol_status,counting_policy)
      values(gen_random_uuid(),a,150,now(),'wine','nonalcoholic','beverage_volume_v1');
    raise exception 'Wine incorrectly accepted as nonalcoholic';
  exception when check_violation then null; end;
  begin
    insert into drink_fixture(id,user_id,volume_ml,occurred_at,category_id,alcohol_status,counting_policy)
      values(gen_random_uuid(),a,150,now(),'invented','nonalcoholic','beverage_volume_v1');
    raise exception 'Unknown category ID accepted';
  exception when check_violation then null; end;
  update drink_fixture set alcohol_status='nonalcoholic' where fluid_name='Unknown';
  if (select sum(counted_ml) from drink_fixture) <> 500 then raise exception 'Reclassification did not update credit'; end if;
end $$;

-- Exercise the actual saved-drink policy expression on isolated temporary records.
alter table saved_drink_fixture enable row level security;
do $$
declare qual text; checked text;
begin
  if not (select relrowsecurity from pg_class where oid='public.saved_drinks'::regclass) then raise exception 'Saved drinks RLS missing'; end if;
  select pg_get_expr(polqual,polrelid), pg_get_expr(polwithcheck,polrelid) into qual,checked
    from pg_policy where polrelid='public.saved_drinks'::regclass and polname='saved_drinks_own';
  if qual is null or checked is null then raise exception 'Ownership policy missing'; end if;
  execute format('create policy fixture_own on saved_drink_fixture for all to authenticated using (%s) with check (%s)',qual,checked);
end $$;
insert into saved_drink_fixture(id,user_id,name,category_id,alcohol_status,default_volume_ml) values
  (gen_random_uuid(),'11111111-1111-4111-8111-111111111111','A coffee','coffee','nonalcoholic',250),
  (gen_random_uuid(),'22222222-2222-4222-8222-222222222222','B coffee','coffee','nonalcoholic',250);
grant select, insert, update, delete on saved_drink_fixture to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$
declare affected integer;
begin
  if (select count(*) from saved_drink_fixture) <> 1 then raise exception 'Cross-user read exposed'; end if;
  update saved_drink_fixture set name='Forbidden' where user_id='22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-user update allowed'; end if;
  delete from saved_drink_fixture where user_id='22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-user delete allowed'; end if;
  begin
    insert into saved_drink_fixture(id,user_id,name,category_id,alcohol_status,default_volume_ml)
      values(gen_random_uuid(),'22222222-2222-4222-8222-222222222222','Forbidden','water','nonalcoholic',250);
    raise exception 'Cross-user insert allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;

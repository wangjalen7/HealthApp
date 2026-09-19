// Optional STAGING ONLY integration test. Not run as part of this implementation.
// npm install --prefix dist/hardening-concurrency --no-save --package-lock=false pg
// Supply HEALTHAPP_TEST_DATABASE_URL and HEALTHAPP_ALLOW_STAGING_TESTS=yes yourself.
// Uses synthetic accounts, separate PostgreSQL connections and real lock waits.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
if (process.env.HEALTHAPP_ALLOW_STAGING_TESTS !== 'yes' || !process.env.HEALTHAPP_TEST_DATABASE_URL) {
  throw new Error('Explicit staging opt-in and a test database URL are required. No connection was made.');
}
const { default: pg } = await import('../dist/hardening-concurrency/node_modules/pg/lib/index.js');
const pool = new pg.Pool({connectionString:process.env.HEALTHAPP_TEST_DATABASE_URL,max:4});
const owner=randomUUID(),session=randomUUID(),workout=randomUUID(),reading=randomUUID();
const admin=await pool.connect(),a=await pool.connect(),b=await pool.connect();
const claims=JSON.stringify({sub:owner,session_id:session,role:'authenticated'});
async function begin(client) { await client.query('begin');await client.query("select set_config('request.jwt.claims',$1,true)",[claims]);await client.query('set local role authenticated'); }
async function commit(client,request,operation=randomUUID()) {return (await client.query('select public.commit_health_mutation($1,$2,$3::jsonb) result',[owner,operation,JSON.stringify(request)])).rows[0].result;}
try {
  await admin.query('insert into auth.users(id,email) values($1,$2)',[owner,`hardening-${owner}@example.invalid`]);
  await admin.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,owner]);
  const profile=(await admin.query('select * from public.profiles where id=$1',[owner])).rows[0];
  await begin(a);await begin(b);
  const first=await commit(a,{action:'goals',zone:'UTC',changes:{daily_calorie_goal:2200},baseline:{daily_calorie_goal:profile.daily_calorie_goal}});
  const independent=commit(b,{action:'goals',zone:'UTC',changes:{daily_water_goal_ml:2400},baseline:{daily_water_goal_ml:profile.daily_water_goal_ml}});
  await a.query('commit');const second=await independent;await b.query('commit');
  assert.equal(first.status,'accepted');assert.equal(second.status,'accepted');assert.equal(second.data.daily_calorie_goal,2200);
  await begin(a);await begin(b);
  await commit(a,{action:'goals',zone:'UTC',changes:{daily_calorie_goal:2300},baseline:{daily_calorie_goal:2200}});
  const same=commit(b,{action:'goals',zone:'UTC',changes:{daily_calorie_goal:2500},baseline:{daily_calorie_goal:2200}});
  await a.query('commit');assert.equal((await same).status,'conflict');await b.query('commit');

  const request={action:'create_workout',id:workout,title:'Concurrency test',occurred_at:new Date().toISOString(),muscle_groups:['Chest'],location:'',notes:'',sets:[{id:randomUUID(),exercise_name:'Test press',exercise_order:1,muscle_group:'Chest',set_number:1,weight:10,reps:10}]};
  const operation=randomUUID();await begin(a);await begin(b);
  const saved=await commit(a,request,operation);const duplicate=commit(b,request,operation);
  await a.query('commit');assert.deepEqual(await duplicate,saved);await b.query('commit');
  assert.equal(Number((await admin.query('select count(*) from public.workout_sets where session_id=$1',[workout])).rows[0].count),1);
  await begin(a);await begin(b);
  await commit(a,{...request,action:'replace_workout',version:saved.data.version,title:'A'});
  const replacement=commit(b,{...request,action:'replace_workout',version:saved.data.version,title:'B'});
  await a.query('commit');assert.equal((await replacement).status,'conflict');await b.query('commit');

  // A reader cannot advance past an uncommitted cursor reservation.
  await begin(a);await begin(b);
  await commit(a,{table:'vital_samples',action:'create',rows:[{id:reading,version:0,values:{kind:'weight',value:170,unit:'lb',occurred_at:new Date().toISOString()}}]});
  const before=(await b.query('select public.read_vital_changes($1) result',[owner])).rows[0].result;
  assert.equal(before.through,0);await a.query('commit');
  const after=(await b.query('select public.read_vital_changes($1,$2) result',[owner,before.cursor])).rows[0].result;
  assert.equal(after.rows.length,1);assert.equal(after.rows[0].id,reading);await b.query('commit');
  console.log('PASS: simultaneous independent/same-field goals, idempotent workout creation, replacement CAS, and commit-ordered vital cursors.');
} finally {
  await a.query('rollback');await b.query('rollback');
  await admin.query('delete from auth.users where id=$1',[owner]);
  a.release();b.release();admin.release();await pool.end();
}

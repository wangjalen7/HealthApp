// Creates and removes one disposable account. Never reads real users' health data.
// Managed keys and fixture credentials stay in memory and are never logged.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
if (process.env.HEALTHAPP_ALLOW_STEP_GOAL_TEST !== 'yes') throw new Error('Explicit step-goal test opt-in required.');
const project = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
assert.match(project, /^[a-z0-9]+$/);
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', `npx --yes supabase projects api-keys --project-ref ${project} --output json`], { encoding: 'utf8', windowsHide: true });
if (cli.status !== 0) throw new Error('Managed test access unavailable');
const keys = JSON.parse(cli.stdout);
const adminKey = keys.find(k => k.name === 'service_role')?.api_key;
const publicKey = keys.find(k => k.type === 'publishable')?.api_key ?? keys.find(k => k.name === 'anon')?.api_key;
assert.ok(adminKey && publicKey);
async function call(path, body, token, key = publicKey, method = 'POST') {
  const response = await fetch(`https://${project}.supabase.co${path}`, {
    method, headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}
function success(result, stage) {
  if (result.status >= 300) throw new Error(`${stage}: HTTP ${result.status}, code ${result.data?.code ?? result.data?.error_code ?? 'unknown'}`);
}
const email = `step-goal-test-${randomUUID()}@example.invalid`, password = `${randomUUID()}Aa!9`;
let user;
try {
  const created = await call('/auth/v1/admin/users', {email,password,email_confirm:true}, adminKey, adminKey);
  success(created,'Create fixture'); user=created.data.id;
  const login=await call('/auth/v1/token?grant_type=password',{email,password});success(login,'Sign in fixture');
  const token=login.data.access_token;
  const profilePath=`/rest/v1/profiles?id=eq.${user}&select=daily_step_goal,daily_calorie_goal`;
  const initial=await call(profilePath,undefined,token,publicKey,'GET');success(initial,'Read optional goal');assert.equal(initial.data[0].daily_step_goal,null);
  const request={action:'goals',zone:'America/New_York',changes:{daily_step_goal:8000},baseline:{daily_step_goal:null}};
  const operation=randomUUID();
  const payload={p_user_id:user,p_operation_id:operation,p_request:request};
  const saved=await call('/rest/v1/rpc/commit_health_mutation',payload,token);success(saved,'Save step goal');assert.equal(saved.data.data.daily_step_goal,8000);
  const retry=await call('/rest/v1/rpc/commit_health_mutation',payload,token);success(retry,'Retry goal');assert.deepEqual(retry.data,saved.data);
  const stale=await call('/rest/v1/rpc/commit_health_mutation',{...payload,p_operation_id:randomUUID()},token);success(stale,'Stale goal');assert.equal(stale.data.status,'conflict');
  const oldClient={action:'goals',zone:'America/New_York',changes:{daily_calorie_goal:2100},baseline:{daily_calorie_goal:initial.data[0].daily_calorie_goal}};
  const merged=await call('/rest/v1/rpc/commit_health_mutation',{...payload,p_operation_id:randomUUID(),p_request:oldClient},token);success(merged,'Old client goal edit');assert.equal(merged.data.data.daily_step_goal,8000);
  const invalid=await call('/rest/v1/rpc/commit_health_mutation',{...payload,p_operation_id:randomUUID(),p_request:{...request,changes:{daily_step_goal:0},baseline:{daily_step_goal:8000}}},token);assert.ok(invalid.status>=400);
  const removed=await call('/rest/v1/rpc/commit_health_mutation',{...payload,p_operation_id:randomUUID(),p_request:{...request,changes:{daily_step_goal:null},baseline:{daily_step_goal:8000}}},token);success(removed,'Remove step goal');assert.equal(removed.data.data.daily_step_goal,null);assert.equal(removed.data.data.daily_calorie_goal,2100);
  const anonymous=await call('/rest/v1/rpc/commit_health_mutation',payload);assert.ok(anonymous.status>=400);
  console.log('PASS: live optional step goal starts unset; add/read, retry receipts, conflict detection, old-client goal preservation, validation, removal and anonymous rejection.');
} finally {
  if(user){success(await call(`/auth/v1/admin/users/${user}`,undefined,adminKey,adminKey,'DELETE'),'Remove fixture');
    const remaining=await call(`/rest/v1/profiles?id=eq.${user}&select=id`,undefined,adminKey,adminKey,'GET');success(remaining,'Verify cleanup');assert.deepEqual(remaining.data,[]);
    console.log('PASS: disposable account and profile removed.');}
}

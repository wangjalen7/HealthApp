// Explicit opt-in. Uses only a disposable synthetic Auth account, no health entries.
// Existing managed CLI credentials stay in memory; passwords/tokens/keys are never logged.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
if(process.env.HEALTHAPP_ALLOW_SETUP_TEST !== 'yes') throw new Error('Explicit setup test opt-in required.');
const project=readFileSync('supabase/.temp/project-ref','utf8').trim();
if(!/^[a-z0-9]+$/.test(project)) throw new Error('Invalid project reference');
const cli=spawnSync('cmd.exe',['/d','/s','/c',`npx --yes supabase projects api-keys --project-ref ${project} --output json`],{encoding:'utf8',windowsHide:true});
if(cli.status!==0) throw new Error('Managed test access unavailable');
const keys=JSON.parse(cli.stdout);
const adminKey=keys.find(k=>k.name==='service_role')?.api_key;
const publicKey=keys.find(k=>k.type==='publishable')?.api_key ?? keys.find(k=>k.name==='anon')?.api_key;
assert.ok(adminKey && publicKey,'Existing managed keys required');
const base=`https://${project}.supabase.co`;
async function call(path,body,token,key=publicKey,method='POST') {
  const response=await fetch(base+path,{method,headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  return {status:response.status,data};
}
function success(result,stage) {
  if(result.status>=300) throw new Error(`${stage}: HTTP ${result.status}, code ${result.data.code ?? result.data.error_code ?? 'unknown'}`);
}

const email='onboarding-test-'+randomUUID()+'@example.invalid',password=randomUUID()+'Aa!9';let userId;
try {
 const created=await call('/auth/v1/admin/users',{email,password,email_confirm:true},adminKey,adminKey);success(created,'Create fixture');userId=created.data.id;assert.match(userId,/^[0-9a-f-]{36}$/);
 const login=await call('/auth/v1/token?grant_type=password',{email,password});success(login,'Email sign-in');const bearer=login.data.access_token;
 const rows=await call('/rest/v1/account_setup?user_id=eq.'+userId,undefined,bearer,publicKey,'GET');success(rows,'Read new setup');assert.equal(rows.data.length,1);assert.equal(rows.data[0].completed_at,null);assert.equal(rows.data[0].version,1);
 const operation=randomUUID();const request={p_user_id:userId,p_operation_id:operation,p_version:1,p_changes:{preferred_name:'Synthetic',step:'summary'}};
 const saved=await call('/rest/v1/rpc/save_account_setup',request,bearer);success(saved,'Setup save');assert.equal(saved.data.status,'accepted');assert.equal(saved.data.data.version,2);
 const completed=await call('/rest/v1/rpc/save_account_setup',{...request,p_operation_id:randomUUID(),p_version:2,p_changes:{complete:true}},bearer);success(completed,'Completion');assert.ok(completed.data.data.completed_at);
 const replay=await call('/rest/v1/rpc/save_account_setup',request,bearer);success(replay,'Lost-response replay');assert.equal(replay.data.data.version,2);
 const stale=await call('/rest/v1/rpc/save_account_setup',{...request,p_operation_id:randomUUID()},bearer);success(stale,'Stale edit');assert.equal(stale.data.status,'conflict');assert.equal(stale.data.data.version,3);assert.ok(stale.data.data.completed_at);
 const direct=await call('/rest/v1/account_setup?user_id=eq.'+userId,{preferred_name:'bypass'},bearer,publicKey,'PATCH');assert.ok(direct.status>=400);
 const anonymous=await call('/rest/v1/account_setup?user_id=eq.'+userId,undefined,undefined,publicKey,'GET');assert.ok(anonymous.status>=400);
 console.log('PASS: hosted email login, new-account trigger, completion, receipt replay, stale-write rejection and direct/anonymous access restrictions.');
} finally {if(userId){const removed=await call('/auth/v1/admin/users/'+userId,undefined,adminKey,adminKey,'DELETE');success(removed,'Cleanup');console.log('PASS: synthetic account and onboarding records removed.');}}

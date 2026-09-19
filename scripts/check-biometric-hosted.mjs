// Explicit opt-in. Uses only a disposable synthetic Auth account, no health entries.
// Existing managed CLI credentials stay in memory; passwords/tokens/keys are never logged.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
if(process.env.HEALTHAPP_ALLOW_AUTH_TEST !== 'yes') throw new Error('Explicit Auth test opt-in required.');
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
const deviceId=randomUUID(),email=`face-id-test-${randomUUID()}@example.invalid`,password=`${randomUUID()}Aa!9`;
let userId;
try {
  const created=await call('/auth/v1/admin/users',{email,password,email_confirm:true},adminKey,adminKey);
  success(created,'Synthetic account creation');userId=created.data.id;
  assert.match(userId,/^[0-9a-f-]{36}$/);
  const login=await call('/auth/v1/token?grant_type=password',{email,password});success(login,'Password login');
  const bearer=login.data.access_token;
  const enroll={action:'enroll',userId,deviceId,deviceName:'Disposable regression fixture'};
  const missing=await call('/functions/v1/biometric-auth',enroll,bearer);assert.equal(missing.status,400);
  const wrong=await call('/functions/v1/biometric-auth',{...enroll,password:'not-the-password'},bearer);assert.equal(wrong.status,401);
  console.log('PASS: existing session cannot enroll without the correct password.');
  const saved=await call('/functions/v1/biometric-auth',{...enroll,password},bearer);success(saved,'Device enrollment');
  const {credentialId,secret}=saved.data;assert.ok(credentialId && secret);
  const request={action:'authenticate',credentialId,deviceId,secret};
  const other=await call('/functions/v1/biometric-auth',{...request,deviceId:randomUUID()});assert.equal(other.status,401);
  const first=await call('/functions/v1/biometric-auth',request);success(first,'First Face ID exchange');
  assert.equal(first.data.userId,userId);assert.match(first.data.nextSecret,/^[A-Za-z0-9_-]{43}$/);assert.ok(first.data.accessToken && first.data.refreshToken);
  const replay=await call('/functions/v1/biometric-auth',request);assert.equal(replay.status,401);
  const second=await call('/functions/v1/biometric-auth',{...request,secret:first.data.nextSecret});success(second,'Rotated Face ID exchange');assert.equal(second.data.userId,userId);
  console.log('PASS: enrollment, device binding, two real session exchanges, secret rotation and replay rejection.');
  const revoked=await call('/functions/v1/biometric-auth',{action:'revoke',credentialId},second.data.accessToken);success(revoked,'Device revocation');
  const revokedLogin=await call('/functions/v1/biometric-auth',{...request,secret:second.data.nextSecret});assert.equal(revokedLogin.status,401);
  console.log('PASS: revoked credential cannot sign in.');
} finally {
  if(userId) {
    const removed=await call(`/auth/v1/admin/users/${userId}`,undefined,adminKey,adminKey,'DELETE');success(removed,'Synthetic account cleanup');
    console.log('PASS: disposable account and its credentials/sessions removed.');
  }
}

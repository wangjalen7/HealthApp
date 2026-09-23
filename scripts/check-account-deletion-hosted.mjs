// Disposable hosted account verification only. Never targets an existing account.
// HEALTHAPP_ALLOW_DELETION_TEST=yes node scripts/check-account-deletion-hosted.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
if (process.env.HEALTHAPP_ALLOW_DELETION_TEST !== 'yes') throw new Error('Explicit disposable deletion-test opt-in required.');
const project = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
assert.match(project, /^[a-z0-9]+$/);
const cli = spawnSync('cmd.exe', ['/d', '/s', '/c', `npx --yes supabase projects api-keys --project-ref ${project} --output json`], { encoding: 'utf8', windowsHide: true });
if (cli.status !== 0) throw new Error('Managed test access unavailable');
const keys = JSON.parse(cli.stdout);
const adminKey = keys.find(k => k.name === 'service_role')?.api_key;
const publicKey = keys.find(k => k.type === 'publishable')?.api_key ?? keys.find(k => k.name === 'anon')?.api_key;
assert.ok(adminKey && publicKey);
const base = `https://${project}.supabase.co`;
async function call(path, body, token, key = publicKey, method = 'POST') {
  const response = await fetch(base + path, {
    method, headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}
function success(result, stage) {
  if (result.status >= 300) throw new Error(`${stage}: HTTP ${result.status}`);
}
const capability = () => randomUUID() + randomUUID();
const deletion = (action, token, jwt, extra = {}) => call('/functions/v1/delete-account', { action, token, ...extra }, jwt);
const fluid = (fixture, name, volume) => call('/rest/v1/rpc/commit_health_mutation', {
  p_user_id: fixture.id, p_operation_id: randomUUID(), p_request: {
    table: 'hydration_entries', action: 'create', rows: [{ id: randomUUID(), version: 0, values: {
      fluid_name: name, volume_ml: volume, category_id: 'water', alcohol_status: 'nonalcoholic', counting_policy: 'beverage_volume_v1', occurred_at: new Date().toISOString(),
    } }],
  },
}, fixture.jwt);
const fixtures = [];
let photoPath;
try {
  const ready = await deletion('status', capability());
  success(ready, 'Deployment readiness'); assert.equal(ready.data.ready, true);
  assert.equal((await deletion('prepare', capability(), undefined, { password: 'unused', confirmation: 'DELETE' })).status, 401);
  for (let index = 0; index < 2; index++) {
    const email = `deletion-test-${randomUUID()}@example.invalid`, password = `${randomUUID()}Aa!9`;
    const created = await call('/auth/v1/admin/users', { email, password, email_confirm: true }, adminKey, adminKey);
    success(created, 'Create disposable fixture');
    const fixture = { id: created.data.id, email, password };
    fixtures.push(fixture);
    const login = await call('/auth/v1/token?grant_type=password', { email, password });
    success(login, 'Fixture sign-in'); fixture.jwt = login.data.access_token;
    success(await fluid(fixture, 'Synthetic test water', 250), 'Seed fixture fluid');
  }
  const [first, second] = fixtures;
  const token = capability();
  assert.equal((await deletion('prepare', token, first.jwt, { password: 'wrong-password', confirmation: 'DELETE' })).status, 403);
  const unstarted = await deletion('run', token);
  assert.equal(unstarted.data.code, 'not_started');
  photoPath = `${first.id}/${randomUUID()}.jpg`;
  const upload = await fetch(`${base}/storage/v1/object/progress-photos/${photoPath}`, { method: 'POST', headers: { apikey: publicKey, Authorization: `Bearer ${first.jwt}`, 'Content-Type': 'image/jpeg' }, body: new Uint8Array([255, 216, 255, 217]) });
  assert.ok(upload.ok, 'Orphan fixture upload must succeed');
  const prepared = await deletion('prepare', token, first.jwt, { password: first.password, confirmation: 'DELETE' });
  success(prepared, 'Password-verified preparation'); assert.equal(prepared.data.prepared, true);
  const cancel = await deletion('cancel', token);
  success(cancel, 'Prepared cancellation check'); assert.equal(cancel.data.cancelled, false);
  const blocked = await fluid(first, 'Blocked fixture', 1);
  assert.ok(blocked.status >= 400, 'Old session cannot add data during deletion');
  assert.equal(blocked.data.code, '28000', 'The previously working save must now reject the revoked session');
  const completed = await deletion('run', token);
  success(completed, 'Recovery-only cleanup'); assert.equal(completed.data.completed, true);
  assert.equal((await deletion('run', token)).data.completed, true, 'Lost final response remains safely retryable');
  assert.equal((await call(`/auth/v1/admin/users/${first.id}`, undefined, adminKey, adminKey, 'GET')).status, 404);
  for (const [table, column] of [['profiles', 'id'], ['hydration_entries', 'user_id'], ['account_setup', 'user_id']]) {
    const remaining = await call(`/rest/v1/${table}?${column}=eq.${first.id}&select=*`, undefined, adminKey, adminKey, 'GET');
    success(remaining, 'Verify owned row removal'); assert.deepEqual(remaining.data, []);
  }
  const objects = await call('/rest/v1/rpc/account_deletion_objects', { p_user_id: first.id }, adminKey, adminKey);
  success(objects, 'Verify orphan cleanup'); assert.deepEqual(objects.data, []);
  const other = await call(`/rest/v1/hydration_entries?user_id=eq.${second.id}&select=id`, undefined, second.jwt, publicKey, 'GET');
  success(other, 'Other account isolation'); assert.equal(other.data.length, 1);
  const sealedToken = capability();
  assert.equal((await deletion('cancel', sealedToken)).data.cancelled, true);
  assert.equal((await deletion('prepare', sealedToken, second.jwt, { password: second.password, confirmation: 'DELETE' })).data.cancelled, true);
  success(await call(`/auth/v1/admin/users/${second.id}`, undefined, adminKey, adminKey, 'GET'), 'Cancelled fixture remains intact');
  console.log('PASS: readiness, unauthorized/wrong-password rejection, write blocking, orphan cleanup, Auth/data removal, recovery without a session, repeat completion, sealed cancellation and other-account isolation.');
} finally {
  if (photoPath) {
    const result = await call('/storage/v1/object/progress-photos', { prefixes: [photoPath] }, adminKey, adminKey, 'DELETE');
    success(result, 'Remove only fixture photo');
  }
  for (const fixture of fixtures) {
    assert.match(fixture.email, /^deletion-test-[a-f0-9-]+@example\.invalid$/);
    const result = await call(`/auth/v1/admin/users/${fixture.id}`, undefined, adminKey, adminKey, 'DELETE');
    if (result.status !== 404) success(result, 'Remove disposable fixture');
  }
  console.log('Disposable fixture cleanup completed.');
}

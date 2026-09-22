// Creates and removes one disposable account. Never reads real users' health data.
// Managed keys and fixture credentials stay in memory and are never logged.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
if (process.env.HEALTHAPP_ALLOW_STREAK_TEST !== 'yes') throw new Error('Explicit streak test opt-in required.');
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
const email = `streak-test-${randomUUID()}@example.invalid`, password = `${randomUUID()}Aa!9`;
let user;
try {
  const request = { p_habits: ['daily_logging', 'food_logging', 'food_complete', 'calorie_target', 'protein_target', 'fluid_logging', 'fluid_target', 'training', 'weight', 'bp'], p_zone: 'America/New_York' };
  const anonymous = await call('/rest/v1/rpc/initialize_summary_streaks', request);
  assert.ok(anonymous.status >= 400);
  assert.equal(anonymous.data?.code, '42501', 'RPC must exist and reject anonymous execution');
  const created = await call('/auth/v1/admin/users', { email, password, email_confirm: true }, adminKey, adminKey);
  success(created, 'Create fixture'); user = created.data.id;
  assert.match(user, /^[0-9a-f-]{36}$/);
  const login = await call('/auth/v1/token?grant_type=password', { email, password });
  success(login, 'Fixture sign-in');
  const token = login.data.access_token;
  const initialized = await call('/rest/v1/rpc/initialize_summary_streaks', request, token);
  success(initialized, 'Initialize streak widget');
  const path = `/rest/v1/streak_rules?user_id=eq.${user}&order=habit,effective_day`;
  const first = await call(path, undefined, token, publicKey, 'GET'); success(first, 'Read rules');
  assert.equal(first.data.length, 10);
  assert.ok(first.data.every(row => row.user_id === user && row.enabled));
  assert.equal(first.data.find(row => row.habit === 'calorie_target').config.calorieMode, 'under');
  assert.equal(first.data.find(row => row.habit === 'bp').config.includeImports, true);
  success(await call('/rest/v1/rpc/initialize_summary_streaks', request, token), 'Retry initialization');
  const second = await call(path, undefined, token, publicKey, 'GET'); success(second, 'Read retry');
  assert.deepEqual(second.data, first.data, 'Retry must preserve existing rules');
  console.log('PASS: live RPC resolves exact p_habits/p_zone signature, rejects anonymous access, initializes all ten server habits, and preserves rules on retry.');
} finally {
  if (user) {
    success(await call(`/auth/v1/admin/users/${user}`, undefined, adminKey, adminKey, 'DELETE'), 'Remove fixture');
    const remaining = await call(`/rest/v1/streak_rules?user_id=eq.${user}&select=habit`, undefined, adminKey, adminKey, 'GET');
    success(remaining, 'Verify cleanup'); assert.deepEqual(remaining.data, []);
    console.log('PASS: disposable account and streak records removed.');
  }
}

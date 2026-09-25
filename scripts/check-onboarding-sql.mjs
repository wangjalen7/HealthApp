// Isolated real PostgreSQL (PGlite). Never connects to Supabase or uses credentials.
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../dist/summary-db-check/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,encrypted_password text,raw_user_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users,created_at timestamptz default now(),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text,name text,owner_id text);
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated;
  `);
  for (const name of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
    if(name === '202609210001_account_onboarding.sql') await db.exec("insert into auth.users(id) values('99999999-9999-4999-8999-999999999999');");
    try { await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')); }
    catch(error) { console.error('Migration failed:',name); throw error; }
  }
  console.log('PASS: all repository migrations execute against isolated PostgreSQL.');
  await db.exec(await readFile(new URL('../supabase/tests/hardening.sql',import.meta.url),'utf8'));
  console.log('PASS: hardening SQL regressions.');
  await db.exec(await readFile(new URL('../supabase/tests/onboarding.sql',import.meta.url),'utf8'));
  console.log('PASS: onboarding backfill, RLS, session enforcement, CAS, receipts, completion and goal preservation.');
  await db.exec(await readFile(new URL('../supabase/tests/summary_streaks.sql',import.meta.url),'utf8'));
  console.log('PASS: existing streak confirmations, prospective goals and account isolation.');
  await db.exec(await readFile(new URL('../supabase/tests/summary_refinements.sql',import.meta.url),'utf8'));
  console.log('PASS: Summary streak initialization, history, permissions, deletion guard and cleanup verification.');
  await db.exec(await readFile(new URL('../supabase/tests/privacy_controls.sql',import.meta.url),'utf8'));
  console.log('PASS: privacy receipts, cross-account isolation, planner cleanup and account-deletion write guard/cascade.');
} finally { await db.close(); }

// Optional isolated PostgreSQL smoke test; no service credentials or real records.
// npm install --prefix dist/summary-db-check --no-save --package-lock=false @electric-sql/pglite@0.5.8
// node scripts/check-summary-sql.mjs
import {readFile} from "node:fs/promises";
import {PGlite} from "../dist/summary-db-check/node_modules/@electric-sql/pglite/dist/index.js";
const db=new PGlite();
try {
 await db.exec(`
 create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
 create table profiles(id uuid primary key references auth.users, daily_calorie_goal integer,daily_protein_goal integer,daily_water_goal_ml numeric,weight_goal_lb numeric,bp_systolic_goal integer,bp_diastolic_goal integer,calorie_goal_calculation jsonb,fluid_goal_calculation jsonb);
 create table vital_samples(id uuid primary key,user_id uuid references auth.users,kind text,value numeric,unit text,occurred_at timestamptz,source text,deleted_at timestamptz);
 create table nutrition_entries(id uuid primary key,user_id uuid references auth.users,meal_log_id uuid not null,food_name text,calories integer,protein_grams numeric,occurred_at timestamptz);
 alter table profiles enable row level security; alter table nutrition_entries enable row level security;
 create policy profile_own on profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
 create policy food_own on nutrition_entries for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 grant select,insert,update,delete on profiles,nutrition_entries to authenticated;
 alter default privileges in schema public grant execute on functions to anon,authenticated;
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/202609180001_summary_streaks.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/202609180002_summary_function_permissions.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/tests/summary_streaks.sql',import.meta.url),'utf8'));
 console.log('PASS: migration, dated targets, automatic protein, food invalidation/undo and account/anonymous isolation in isolated PostgreSQL.');
} finally {await db.close();}

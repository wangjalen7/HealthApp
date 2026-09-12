-- Private, review-before-apply AI coaching conversations and preferences.

create table public.coach_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_goal text not null check (primary_goal in ('muscle_gain', 'fat_loss', 'recomp', 'maintenance', 'performance', 'general_health')),
  experience_level text not null check (experience_level in ('beginner', 'intermediate', 'advanced')),
  training_days_per_week smallint not null check (training_days_per_week between 1 and 7),
  session_minutes smallint not null check (session_minutes between 15 and 240),
  equipment text[] not null default '{}',
  limitations text check (char_length(limitations) <= 1000),
  dietary_preferences text[] not null default '{}',
  dietary_restrictions text[] not null default '{}',
  disliked_foods text[] not null default '{}',
  meal_prep_minutes smallint check (meal_prep_minutes between 0 and 480),
  height_inches numeric(6, 2) check (height_inches between 24 and 108),
  birth_year smallint check (birth_year between 1900 and 2200),
  energy_estimation_sex text check (energy_estimation_sex in ('female', 'male')),
  target_weight_change_lb_week numeric(4, 2) check (target_weight_change_lb_week between -5 and 5),
  response_style text not null default 'concise' check (response_style in ('concise', 'detailed')),
  use_nutrition boolean not null default true,
  use_training boolean not null default true,
  use_vitals boolean not null default true,
  use_hydration boolean not null default true,
  use_photo_metadata boolean not null default true,
  consented_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_threads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  summary text not null default '' check (char_length(summary) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.coach_messages (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  model_tier text check (model_tier in ('standard', 'deep')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  unique (id, user_id, thread_id),
  foreign key (thread_id, user_id) references public.coach_threads(id, user_id) on delete cascade
);

create table public.coach_actions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  message_id uuid not null,
  kind text not null check (kind in ('next_meal', 'next_workout')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  foreign key (message_id, user_id, thread_id) references public.coach_messages(id, user_id, thread_id) on delete cascade
);

create table public.coach_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  standard_requests smallint not null default 0 check (standard_requests between 0 and 30),
  deep_requests smallint not null default 0 check (deep_requests between 0 and 3),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  primary key (user_id, usage_day)
);

create index coach_threads_user_updated_idx on public.coach_threads (user_id, updated_at desc);
create index coach_messages_thread_created_idx on public.coach_messages (thread_id, created_at);
create index coach_actions_thread_created_idx on public.coach_actions (thread_id, created_at);

alter table public.coach_profiles enable row level security;
alter table public.coach_threads enable row level security;
alter table public.coach_messages enable row level security;
alter table public.coach_actions enable row level security;
alter table public.coach_daily_usage enable row level security;

grant select, insert, update, delete on public.coach_profiles to authenticated;
grant select, insert, update, delete on public.coach_threads to authenticated;
grant select, insert, update, delete on public.coach_messages to authenticated;
grant select, insert, update, delete on public.coach_actions to authenticated;
revoke all on public.coach_daily_usage from anon, authenticated;

create policy "coach_profiles_own" on public.coach_profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "coach_threads_own" on public.coach_threads for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "coach_messages_own" on public.coach_messages for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "coach_actions_own" on public.coach_actions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.consume_coach_quota(p_user_id uuid, p_tier text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare usage public.coach_daily_usage;
begin
  if p_tier not in ('standard', 'deep') then raise exception 'Invalid coach tier'; end if;
  insert into public.coach_daily_usage as current (
    user_id, usage_day, standard_requests, deep_requests
  ) values (
    p_user_id,
    (now() at time zone 'utc')::date,
    case when p_tier = 'standard' then 1 else 0 end,
    case when p_tier = 'deep' then 1 else 0 end
  )
  on conflict (user_id, usage_day) do update set
    standard_requests = current.standard_requests + case when p_tier = 'standard' then 1 else 0 end,
    deep_requests = current.deep_requests + case when p_tier = 'deep' then 1 else 0 end
  where
    (p_tier = 'standard' and current.standard_requests < 30)
    or (p_tier = 'deep' and current.deep_requests < 3)
  returning * into usage;
  if usage.user_id is null then return jsonb_build_object('allowed', false); end if;
  return jsonb_build_object(
    'allowed', true,
    'standardRemaining', 30 - usage.standard_requests,
    'deepRemaining', 3 - usage.deep_requests
  );
end;
$$;

create function public.record_coach_tokens(p_user_id uuid, p_input_tokens integer, p_output_tokens integer)
returns void language sql security definer set search_path = '' as $$
  update public.coach_daily_usage
  set input_tokens = input_tokens + greatest(p_input_tokens, 0),
      output_tokens = output_tokens + greatest(p_output_tokens, 0)
  where user_id = p_user_id and usage_day = (now() at time zone 'utc')::date;
$$;

revoke all on function public.consume_coach_quota(uuid, text) from public, anon, authenticated;
revoke all on function public.record_coach_tokens(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_coach_quota(uuid, text) to service_role;
grant execute on function public.record_coach_tokens(uuid, integer, integer) to service_role;

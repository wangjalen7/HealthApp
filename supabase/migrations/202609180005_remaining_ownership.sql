-- Abort rather than discard legacy metadata with missing/mismatched parents.
do $$ begin
  if exists(select 1 from public.progress_photos p left join public.vital_samples v on v.id=p.weight_sample_id and v.user_id=p.user_id
    where p.weight_sample_id is not null and (v.id is null or v.kind<>'weight')) then
    raise exception 'Progress-photo parent violations exist. Review preflight; do not delete records to force this migration.';
  end if;
end $$;
alter table public.vital_samples add constraint vital_samples_owner_id unique(user_id,id);
alter table public.progress_photos add constraint progress_photos_owner_parent
  foreign key(user_id,weight_sample_id) references public.vital_samples(user_id,id) deferrable initially deferred;

-- An unexpired JWT alone must not authorize writes after its session is revoked.
-- Covers remaining direct writes and existing SECURITY DEFINER feature RPCs.
create function public.guard_active_user_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then perform public.require_active_session(auth.uid()); end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','vital_samples','workout_sessions','workout_sets','cardio_entries','nutrition_entries','hydration_entries','user_food_profiles','food_recipes','saved_drinks','progress_photos','coach_profiles','coach_threads','coach_messages','coach_actions','streak_rules','streak_goal_snapshots','streak_activation','food_day_completions'] loop
    execute format('create trigger require_session_before_write before insert or update or delete on public.%I for each row execute function public.guard_active_user_write()',t);
  end loop;
end $$;
revoke all on function public.guard_active_user_write() from public,anon,authenticated;

create function public.require_photo_weight_parent() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.vital_samples where id=new.weight_sample_id and user_id=new.user_id and kind='weight' and deleted_at is null) then
    raise exception 'Save and sync this weight reading before attaching a photo' using errcode='23514';
  end if;
  return new;
end $$;
create trigger photo_weight_parent before insert or update of weight_sample_id,user_id on public.progress_photos for each row execute function public.require_photo_weight_parent();
revoke all on function public.require_photo_weight_parent() from public,anon,authenticated;

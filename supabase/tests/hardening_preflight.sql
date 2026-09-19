-- READ ONLY. Run as an authorized database administrator before migrations 004/005.
-- Results contain identifiers, not measurement values. Never auto-delete violations.
select s.id as set_id,s.user_id as set_owner,s.session_id,w.user_id as session_owner
from public.workout_sets s left join public.workout_sessions w on w.id=s.session_id
where w.id is null or s.user_id<>w.user_id;
select p.id as photo_id,p.user_id as photo_owner,p.weight_sample_id,v.user_id as reading_owner,v.kind
from public.progress_photos p left join public.vital_samples v on v.id=p.weight_sample_id
where p.weight_sample_id is not null and (v.id is null or v.user_id<>p.user_id or v.kind<>'weight');
-- Nutrition profile/recipe and Coach thread/message/action relationships already
-- have composite ownership foreign keys in the original migrations.

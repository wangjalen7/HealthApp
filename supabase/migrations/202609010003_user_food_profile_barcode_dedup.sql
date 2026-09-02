-- Normalize profile barcode identity, merge any existing per-user duplicates,
-- and prevent repeated manual or provider-backed barcode saves from creating
-- another reusable food profile.

update public.user_food_profiles
set barcode = case
  when regexp_replace(barcode, '[^0-9]', '', 'g') = '' then null
  when char_length(regexp_replace(barcode, '[^0-9]', '', 'g')) <= 14
    then lpad(regexp_replace(barcode, '[^0-9]', '', 'g'), 14, '0')
  else regexp_replace(barcode, '[^0-9]', '', 'g')
end
where barcode is not null;

create temporary table food_profile_barcode_merge on commit drop as
select
  id as duplicate_id,
  user_id,
  first_value(id) over (
    partition by user_id, barcode
    order by
      (catalog_product_id is not null) desc,
      is_user_corrected desc,
      updated_at desc,
      id
  ) as keeper_id,
  row_number() over (
    partition by user_id, barcode
    order by
      (catalog_product_id is not null) desc,
      is_user_corrected desc,
      updated_at desc,
      id
  ) as duplicate_rank
from public.user_food_profiles
where barcode is not null;

update public.nutrition_entries as entry
set food_profile_id = merge.keeper_id
from food_profile_barcode_merge as merge
where merge.duplicate_rank > 1
  and entry.user_id = merge.user_id
  and entry.food_profile_id = merge.duplicate_id;

delete from public.user_food_profiles as profile
using food_profile_barcode_merge as merge
where merge.duplicate_rank > 1
  and profile.user_id = merge.user_id
  and profile.id = merge.duplicate_id;

alter table public.user_food_profiles
  add constraint user_food_profiles_user_barcode_key unique (user_id, barcode);

-- Refresh barcode products after moving from deprecated v2/knowledge-panel
-- parsing to the structured Open Food Facts v3.6 product response.

alter table public.food_catalog_products
  alter column normalization_version set default 4;

update public.food_barcode_lookups as lookup
set expires_at = least(lookup.expires_at, now())
from public.food_catalog_products as product
where lookup.product_id = product.id
  and product.provider = 'open_food_facts'
  and product.normalization_version < 4;

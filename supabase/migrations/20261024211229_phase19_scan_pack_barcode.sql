-- Phase 19, deliverable 1: scanning a pack's barcode (item_uom_conversions.barcode, e.g. the box of 12)
-- finds its product in the document line search. An exact match on the whole query, next to the
-- existing token search; /api/quote-items then starts the line in that pack's unit.

create or replace function public.search_inventory_items(p_query text)
returns setof public.inventory_items
language sql
stable
set search_path = ''
as $$
  with recursive tokens as (
    select distinct token
    from unnest(
      regexp_split_to_array(
        regexp_replace(lower(coalesce(p_query, '')), '[^[:alnum:][:space:]]', '', 'g'),
        '\s+'
      )
    ) as token
    where token <> ''
  ),
  cat_path as (
    select c.id, c.id as leaf, c.parent_id, c.name from public.categories c
    union all
    select p.id, cp.leaf, p.parent_id, p.name from public.categories p join cat_path cp on p.id = cp.parent_id
  ),
  cat_text as (
    select leaf, string_agg(name, ' ') as names from cat_path group by leaf
  ),
  fitment as (
    select private.tenant_has_module(private.current_tenant_id(), 'vehicle_fitment') as enabled
  )
  select i.*
  from public.inventory_items i
  left join cat_text ct on ct.leaf = i.category_id
  where exists (
    select 1
    from public.item_uom_conversions uc
    where uc.item_id = i.id and uc.barcode is not null and uc.barcode = btrim(coalesce(p_query, ''))
  )
  or exists (
    select 1
    from (
      select null::integer as vehicle_id
      union all
      select c.vehicle_id
      from public.item_vehicle_compatibility c
      where c.item_id = i.id and (select f.enabled from fitment f)
    ) fit
    left join public.vehicles v on v.id = fit.vehicle_id
    where not exists (
      select 1
      from tokens t
      where strpos(
        regexp_replace(
          lower(concat_ws(' ', i.sku, i.name, ct.names, v.make, v.model, v."trim", v.year::text,
            (select string_agg(e.value, ' ') from jsonb_each_text(i.attributes) e))),
          '[^[:alnum:][:space:]]', '', 'g'
        ),
        t.token
      ) = 0
    )
  );
$$;

revoke execute on function public.search_inventory_items(text) from public, anon;
grant execute on function public.search_inventory_items(text) to authenticated;

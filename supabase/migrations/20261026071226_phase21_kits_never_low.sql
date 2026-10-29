-- Phase 21 (RF-21.1): kits have no alert level of their own, so they're never "low stock" in the list
-- (their products are). Same function as before otherwise.
create or replace function public.inventory_list(p_store_id uuid default null, p_grouped boolean default true, p_query text default null)
returns setof public.inventory_list_row
language sql
stable
set search_path = ''
as $$
  with searched as (
    select s.id, s.group_id from public.search_inventory_items(p_query) s where p_query is not null
  ),
  matched as (
    select i.* from public.inventory_items i
    where not i.is_archived
      and (p_query is null
           or i.id in (select id from searched)
           or (p_grouped and i.group_id in (select group_id from searched where group_id is not null)))
  ),
  stocked as (
    select m.id, m.is_kit, m.group_id, m.name, m.sku, m.category_id, m.is_universal, m.attributes, m.cost_price, m.created_at,
           coalesce(sp.selling_price, m.selling_price) as price,
           case when m.is_kit then public.kit_available(m.id, p_store_id)
                when p_store_id is null then m.quantity_on_hand else coalesce(l.on_hand, 0) end as on_hand,
           case when m.is_kit then 0
                when p_store_id is null then m.reserved_quantity else coalesce(l.reserved, 0) end as reserved,
           coalesce(l.low_stock_threshold, m.low_stock_threshold) as threshold
    from matched m
    left join public.stock_levels l on p_store_id is not null and l.item_id = m.id and l.store_id = p_store_id
    left join public.store_item_prices sp on p_store_id is not null and sp.item_id = m.id and sp.store_id = p_store_id
  )
  select s.id, case when s.is_kit then 'kit' else 'item' end, s.group_id, s.name, s.sku, s.category_id, s.is_universal, s.attributes,
         s.price, s.price, s.cost_price, s.on_hand, s.reserved, s.on_hand - s.reserved, s.threshold,
         not s.is_kit and s.on_hand - s.reserved <= s.threshold, 0, s.created_at
  from stocked s
  where not p_grouped or s.group_id is null
  union all
  select g.id, 'group', g.id, g.name, g.sku_prefix, g.category_id, g.is_universal, g.attributes,
         min(s.price), max(s.price), min(s.cost_price), sum(s.on_hand), sum(s.reserved), sum(s.on_hand - s.reserved),
         min(s.threshold), bool_or(s.on_hand - s.reserved <= s.threshold), count(*)::integer, g.created_at
  from stocked s join public.product_groups g on g.id = s.group_id
  where p_grouped
  group by g.id;
$$;

-- Phase 21 (2/3): the rules for variants, kits and barcodes.
--
-- * save_product_group: a group, its options and every variant (SKU, barcode, price, cost, low-stock
--   level, on / off, stock per store) in one transaction. Variants switched off or left out are deleted,
--   or archived when they have documents or stock history; one with stock can't be switched off.
-- * delete_product_group: the same for every variant; the group goes when none is left.
-- * Kit lines (RF-21.1) reserve / deduct their components at the line's store, saved with the line
--   (quote_items.kit_components), so changing a kit later doesn't change old documents.
-- * inventory_list: the inventory page's rows, one per product, kit or product group (or one per SKU),
--   with stock rolled up, at one store or for the whole organization.
-- * Archived products are left out of search, the plan's product limit and stock reports.

-- ---------------------------------------------------------------------------------------------------
-- Plan limit: archived products don't count; bringing one back checks the limit.
-- ---------------------------------------------------------------------------------------------------
create or replace function private.inventory_check_product_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if new.is_archived or (tg_op = 'UPDATE' and not old.is_archived) then
    return new;
  end if;
  v_limit := private.tenant_limit(new.tenant_id, 'products');
  if v_limit is null then
    return new;
  end if;
  -- One organization's inserts are counted one at a time (CSV imports and variant matrices insert many rows).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.tenant_id::text || ':products', 0));
  select count(*) into v_count from public.inventory_items i where i.tenant_id = new.tenant_id and not i.is_archived and i.id <> new.id;
  if v_count >= v_limit then
    raise exception 'This organization''s plan allows % products (each variant and kit counts as one).', v_limit
      using errcode = 'P0001', detail = 'plan_limit:products', hint = 'Delete unused products or ask ProductLogik to change the plan.';
  end if;
  return new;
end;
$$;
drop trigger inventory_check_product_limit on public.inventory_items;
create trigger inventory_check_product_limit before insert or update of is_archived on public.inventory_items
for each row execute function private.inventory_check_product_limit();

-- ---------------------------------------------------------------------------------------------------
-- Barcodes: one product or pack per code in an organization.
-- ---------------------------------------------------------------------------------------------------
create function private.check_barcode_free()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.barcode is null then
    return new;
  end if;
  if tg_table_name = 'inventory_items' then
    if exists (select 1 from public.item_uom_conversions c where c.tenant_id = new.tenant_id and c.barcode = new.barcode) then
      raise exception 'Barcode % is already used by a pack of another product.', new.barcode using errcode = '23505';
    end if;
  elsif exists (select 1 from public.inventory_items i where i.tenant_id = new.tenant_id and i.barcode = new.barcode) then
    raise exception 'Barcode % is already used by another product.', new.barcode using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke all on function private.check_barcode_free() from public, anon, authenticated;
create trigger inventory_items_check_barcode before insert or update of barcode on public.inventory_items
for each row execute function private.check_barcode_free();
create trigger item_uom_conversions_check_barcode before insert or update of barcode on public.item_uom_conversions
for each row execute function private.check_barcode_free();

-- Kits are sold one at a time: no packs.
create or replace function private.check_item_conversion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_new boolean;
begin
  if exists (select 1 from public.inventory_items i where i.id = new.item_id and i.base_uom_id = new.uom_id) then
    raise exception 'A unit conversion can''t use the product''s base unit.' using errcode = '23514';
  end if;
  if exists (select 1 from public.inventory_items i where i.id = new.item_id and i.is_kit) then
    raise exception 'Kits are sold one at a time, so they can''t have packs.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    v_new := not exists (select 1 from public.item_uom_conversions c where c.item_id = new.item_id and c.uom_id = new.uom_id);
  else
    v_new := (new.item_id, new.uom_id) is distinct from (old.item_id, old.uom_id);
  end if;
  if v_new then
    if not coalesce((select t.packs_enabled from public.tenants t where t.id = new.tenant_id), false) then
      raise exception 'Packs are turned off. An admin can turn them on in Settings → Units.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.units_of_measure u where u.id = new.uom_id and u.is_pack) then
      raise exception '% can''t be used as a pack. An admin can allow it in Settings → Units.',
        coalesce((select u.name from public.units_of_measure u where u.id = new.uom_id), 'That unit') using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Variants: their options must be their group's, one value per option.
-- ---------------------------------------------------------------------------------------------------
create function private.check_item_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.group_id is null then
    return new;
  end if;
  if jsonb_array_length(new.option_values) <> (select count(*) from public.product_option_types t where t.group_id = new.group_id)
     or exists (
       select 1 from jsonb_array_elements_text(new.option_values) with ordinality e(v, n)
       where not exists (
         select 1 from public.product_option_values ov
         join public.product_option_types ot on ot.id = ov.option_type_id
         where ov.id::text = e.v and ot.group_id = new.group_id and ot.position = e.n - 1)) then
    raise exception 'A variant needs one value for each of its group''s options.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_item_variant() from public, anon, authenticated;
create trigger inventory_items_check_variant before insert or update of group_id, option_values on public.inventory_items
for each row execute function private.check_item_variant();

-- ---------------------------------------------------------------------------------------------------
-- Kits: components, cost and availability
-- ---------------------------------------------------------------------------------------------------
create function private.check_kit_component()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_part record;
begin
  if not exists (select 1 from public.inventory_items i where i.id = new.kit_id and i.is_kit) then
    raise exception 'Only kits have components.' using errcode = '23514';
  end if;
  select i.name, i.is_kit, i.is_archived, u.code, u.decimals into v_part
  from public.inventory_items i left join public.units_of_measure u on u.id = i.base_uom_id
  where i.id = new.component_id;
  if v_part.is_kit then
    raise exception 'A kit can''t contain another kit (%).', v_part.name using errcode = '23514';
  end if;
  if v_part.is_archived then
    raise exception '% is switched off, so it can''t go in a kit.', v_part.name using errcode = '23514';
  end if;
  if new.quantity <> round(new.quantity, coalesce(v_part.decimals, 3)) then
    raise exception '% in a kit: % allows at most % decimal places.', v_part.name, v_part.code, v_part.decimals using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.kit_components k where k.kit_id = new.kit_id) >= 30 then
    raise exception 'A kit can have at most 30 products.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.check_kit_component() from public, anon, authenticated;
create trigger kit_components_check before insert or update on public.kit_components
for each row execute function private.check_kit_component();

-- A kit costs what its components cost.
create function private.kit_cost(p_kit uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(round(sum(c.cost_price * k.quantity), 2), 0)
  from public.kit_components k join public.inventory_items c on c.id = k.component_id
  where k.kit_id = p_kit;
$$;
revoke all on function private.kit_cost(uuid) from public, anon, authenticated;

create function private.inventory_items_kit_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_kit then
    new.cost_price := case when tg_op = 'INSERT' then 0 else private.kit_cost(new.id) end;
  end if;
  return new;
end;
$$;
revoke all on function private.inventory_items_kit_cost() from public, anon, authenticated;
create trigger inventory_items_kit_cost before insert or update of cost_price, is_kit on public.inventory_items
for each row execute function private.inventory_items_kit_cost();

-- A component's new cost moves its kits' cost.
create function private.inventory_items_component_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory_items k set cost_price = 0
  where k.id in (select c.kit_id from public.kit_components c where c.component_id = new.id);
  return null;
end;
$$;
revoke all on function private.inventory_items_component_cost() from public, anon, authenticated;
create trigger inventory_items_component_cost after update of cost_price on public.inventory_items
for each row when (old.cost_price is distinct from new.cost_price and not new.is_kit)
execute function private.inventory_items_component_cost();

create function private.kit_components_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- cost_price = 0 is replaced by the kit's real cost (inventory_items_kit_cost).
  update public.inventory_items set cost_price = 0
  where id = case when tg_op = 'DELETE' then old.kit_id else new.kit_id end and is_kit;
  return null;
end;
$$;
revoke all on function private.kit_components_changed() from public, anon, authenticated;
create trigger kit_components_changed after insert or update or delete on public.kit_components
for each row execute function private.kit_components_changed();

-- Whole kits the components make: at one store, or (null) from the organization's totals.
create function public.kit_available(p_kit uuid, p_store uuid default null)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(min(floor(greatest(
           case when p_store is null then c.quantity_on_hand - c.reserved_quantity
                else coalesce(l.on_hand - l.reserved, 0) end, 0) / k.quantity)), 0)
  from public.kit_components k
  join public.inventory_items c on c.id = k.component_id
  left join public.stock_levels l on p_store is not null and l.item_id = k.component_id and l.store_id = p_store
  where k.kit_id = p_kit;
$$;
revoke all on function public.kit_available(uuid, uuid) from public, anon;
grant execute on function public.kit_available(uuid, uuid) to authenticated;

-- Kits hold no stock of their own: only their components' stock moves.
create or replace function private.apply_stock(
  p_item uuid, p_store uuid, p_on_hand numeric, p_reserved numeric, p_type text,
  p_quote uuid default null, p_note text default null, p_unit_cost numeric default null
)
returns public.stock_levels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_store record;
  v_level public.stock_levels;
begin
  select i.id, i.tenant_id, i.name, i.cost_price, i.is_kit, u.code as unit into v_item
  from public.inventory_items i left join public.units_of_measure u on u.id = i.base_uom_id
  where i.id = p_item;
  if not found then
    raise exception 'That product no longer exists.' using errcode = 'P0002';
  end if;
  if v_item.is_kit and (coalesce(p_on_hand, 0) <> 0 or coalesce(p_reserved, 0) <> 0) then
    raise exception '% is a kit: it has no stock of its own, its products do.', v_item.name using errcode = '23514';
  end if;
  select s.id, s.name into v_store from public.stores s where s.id = p_store and s.tenant_id = v_item.tenant_id;
  if not found then
    raise exception 'That store isn''t in this organization.' using errcode = '23503';
  end if;

  insert into public.stock_levels (tenant_id, item_id, store_id) values (v_item.tenant_id, p_item, p_store)
  on conflict do nothing;
  select * into v_level from public.stock_levels where item_id = p_item and store_id = p_store for update;

  if v_level.on_hand + coalesce(p_on_hand, 0) < 0 then
    raise exception 'Not enough stock of % at %: % % on hand.', v_item.name, v_store.name,
      trim_scale(v_level.on_hand), coalesce(v_item.unit, '') using errcode = '23514';
  end if;
  if v_level.on_hand + coalesce(p_on_hand, 0) < v_level.reserved + coalesce(p_reserved, 0) then
    raise exception '% at % has % % reserved on quotations, more than would be left on hand.', v_item.name, v_store.name,
      trim_scale(v_level.reserved + coalesce(p_reserved, 0)), coalesce(v_item.unit, '') using errcode = '23514';
  end if;

  update public.stock_levels
  set on_hand = on_hand + coalesce(p_on_hand, 0),
      reserved = greatest(reserved + coalesce(p_reserved, 0), 0),
      updated_at = now()
  where item_id = p_item and store_id = p_store
  returning * into v_level;

  if coalesce(p_on_hand, 0) <> 0 or coalesce(p_reserved, 0) <> 0 then
    insert into public.stock_movements (tenant_id, item_id, store_id, type, quantity, reserved, on_hand_after, reserved_after, unit_cost, quote_id, note)
    values (v_item.tenant_id, p_item, p_store, p_type, coalesce(p_on_hand, 0), coalesce(p_reserved, 0),
            v_level.on_hand, v_level.reserved, coalesce(p_unit_cost, v_item.cost_price),
            -- A document being deleted (its lines give stock back) is already gone.
            (select q.id from public.quotes q where q.id = p_quote), nullif(btrim(p_note), ''));
  end if;

  -- Totals follow (inventory_items_stock_totals).
  perform pg_catalog.set_config('app.stock_sync', 'on', true);
  update public.inventory_items set quantity_on_hand = quantity_on_hand where id = p_item;
  perform pg_catalog.set_config('app.stock_sync', 'off', true);
  return v_level;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Document lines: kits hold their components; variants keep their label.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.quote_items_sync_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote record;
  v_base numeric;
  v_reserve numeric := 0;
  v_deduct numeric := 0;
  v_store uuid;
  v_level public.stock_levels;
  v_item record;
  v_available numeric;
  v_elsewhere numeric;
  v_part record;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select q.status, q.store_id, q.tenant_id into v_quote from public.quotes q where q.id = new.quote_id;
    if new.item_id is null or new.is_labor then
      new.source_store_id := null;
      new.kit_components := null;
    else
      new.source_store_id := coalesce(new.source_store_id, v_quote.store_id);
      -- A line from another store's stock (new or changed lines only, so converting or paying a
      -- document someone else built still works).
      if new.source_store_id <> v_quote.store_id
         and (tg_op = 'INSERT' or new.source_store_id is distinct from old.source_store_id or new.item_id is distinct from old.item_id
              or new.quantity is distinct from old.quantity or new.uom_factor is distinct from old.uom_factor) then
        if not private.can_invoice_other_store(v_quote.tenant_id) then
          raise exception '%', case when (select t.allow_cross_store_invoicing from public.tenants t where t.id = v_quote.tenant_id)
                                    then 'Only admins can sell from another store''s stock.'
                                    else 'Selling from other stores'' stock is switched off (Settings → Stores).' end
            using errcode = '42501';
        end if;
        if not exists (select 1 from public.stores s where s.id = new.source_store_id and s.is_active) then
          raise exception 'That store is switched off, so its stock can''t be sold.' using errcode = '23514';
        end if;
      end if;
      -- RF-21.1: what one kit holds, and the variant's label, are taken when the line gets its product.
      if tg_op = 'INSERT' or new.item_id is distinct from old.item_id then
        select i.variant_label,
               case when i.is_kit then (select jsonb_agg(jsonb_build_object('item_id', k.component_id, 'quantity', k.quantity) order by k.position, k.component_id)
                                        from public.kit_components k where k.kit_id = i.id) end
          into new.variant_label, new.kit_components
        from public.inventory_items i where i.id = new.item_id;
      else
        new.variant_label := old.variant_label;
        new.kit_components := old.kit_components;
      end if;
      v_base := round(new.quantity * new.uom_factor, 3);
      if v_quote.status in ('sent', 'accepted') then
        v_reserve := v_base;
      elsif v_quote.status in ('invoiced', 'paid') then
        v_deduct := v_base;
      end if;
    end if;

    -- Already holding exactly this (e.g. an invoice being paid holds the same): leave stock and the ledger alone.
    if tg_op = 'UPDATE' and old.item_id is not distinct from new.item_id
       and old.source_store_id is not distinct from new.source_store_id
       and old.reserved_qty = v_reserve and old.deducted_qty = v_deduct then
      new.reserved_qty := v_reserve;
      new.deducted_qty := v_deduct;
      return new;
    end if;
  end if;

  -- Give back what the old line held.
  if tg_op in ('UPDATE', 'DELETE') and old.item_id is not null and (old.reserved_qty > 0 or old.deducted_qty > 0) then
    v_store := coalesce(old.source_store_id, (select q.store_id from public.quotes q where q.id = old.quote_id));
    if old.kit_components is not null then
      -- A kit line gives back its components (those still in inventory). If the kit itself was deleted,
      -- reservations are released but sold components stay sold.
      for v_part in
        select (e->>'item_id')::uuid as item_id, (e->>'quantity')::numeric as qty
        from jsonb_array_elements(old.kit_components) e
        where exists (select 1 from public.inventory_items i where i.id = (e->>'item_id')::uuid)
        order by 1
      loop
        if old.reserved_qty > 0 then
          perform private.apply_stock(v_part.item_id, v_store, 0, -round(old.reserved_qty * v_part.qty, 3), 'release', old.quote_id, 'Kit line');
        end if;
        if old.deducted_qty > 0 and exists (select 1 from public.inventory_items i where i.id = old.item_id) then
          perform private.apply_stock(v_part.item_id, v_store, round(old.deducted_qty * v_part.qty, 3), 0, 'sale_cancel', old.quote_id, 'Kit line');
        end if;
      end loop;
    elsif exists (select 1 from public.inventory_items i where i.id = old.item_id) then
      if old.reserved_qty > 0 then
        perform private.apply_stock(old.item_id, v_store, 0, -old.reserved_qty, 'release', old.quote_id);
      end if;
      if old.deducted_qty > 0 then
        perform private.apply_stock(old.item_id, v_store, old.deducted_qty, 0, 'sale_cancel', old.quote_id);
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  new.reserved_qty := 0;
  new.deducted_qty := 0;
  if v_reserve + v_deduct = 0 then
    return new;
  end if;

  select i.name, u.code as unit into v_item
  from public.inventory_items i left join public.units_of_measure u on u.id = i.base_uom_id
  where i.id = new.item_id;
  if not found then
    return new;
  end if;

  -- RF-21.1: a kit takes its components at the line's store. Every component is checked first, its row
  -- locked in product order, so parallel documents queue and nothing moves unless the whole kit can.
  if new.kit_components is not null then
    for v_part in
      select (e->>'item_id')::uuid as item_id, round((v_reserve + v_deduct) * (e->>'quantity')::numeric, 3) as need,
             c.name, u.code as unit
      from jsonb_array_elements(new.kit_components) e
      join public.inventory_items c on c.id = (e->>'item_id')::uuid
      left join public.units_of_measure u on u.id = c.base_uom_id
      order by 1
    loop
      insert into public.stock_levels (tenant_id, item_id, store_id) values (v_quote.tenant_id, v_part.item_id, new.source_store_id)
      on conflict do nothing;
      select * into v_level from public.stock_levels where item_id = v_part.item_id and store_id = new.source_store_id for update;
      if v_part.need > v_level.on_hand - v_level.reserved then
        raise exception 'Not enough stock for %: it needs % % of % at %, and % % are available.',
          v_item.name, trim_scale(v_part.need), coalesce(v_part.unit, ''), v_part.name,
          (select s.name from public.stores s where s.id = new.source_store_id),
          trim_scale(greatest(v_level.on_hand - v_level.reserved, 0)), coalesce(v_part.unit, '')
          using errcode = '23514';
      end if;
    end loop;
    for v_part in
      select (e->>'item_id')::uuid as item_id, (e->>'quantity')::numeric as qty
      from jsonb_array_elements(new.kit_components) e
      order by 1
    loop
      if v_reserve > 0 then
        perform private.apply_stock(v_part.item_id, new.source_store_id, 0, round(v_reserve * v_part.qty, 3), 'reserve', new.quote_id, 'Kit: ' || v_item.name);
      end if;
      if v_deduct > 0 then
        perform private.apply_stock(v_part.item_id, new.source_store_id, -round(v_deduct * v_part.qty, 3), 0, 'sale', new.quote_id, 'Kit: ' || v_item.name);
      end if;
    end loop;
    new.reserved_qty := v_reserve;
    new.deducted_qty := v_deduct;
    return new;
  end if;

  -- Only the source store's stock counts. Locking its row makes parallel documents queue.
  insert into public.stock_levels (tenant_id, item_id, store_id) values (v_quote.tenant_id, new.item_id, new.source_store_id)
  on conflict do nothing;
  select * into v_level from public.stock_levels where item_id = new.item_id and store_id = new.source_store_id for update;
  v_available := v_level.on_hand - v_level.reserved;
  if v_reserve + v_deduct > v_available then
    select coalesce(sum(l.on_hand - l.reserved), 0) into v_elsewhere
    from public.stock_levels l where l.item_id = new.item_id and l.store_id <> new.source_store_id;
    raise exception 'Not enough stock for % at %: % % available (% on hand, % reserved on quotations).%',
      v_item.name, (select s.name from public.stores s where s.id = new.source_store_id),
      trim_scale(greatest(v_available, 0)), coalesce(v_item.unit, ''),
      trim_scale(v_level.on_hand), trim_scale(v_level.reserved),
      case when v_elsewhere > 0 then ' Other stores have ' || trim_scale(v_elsewhere) || ' ' || coalesce(v_item.unit, '') || '.' else '' end
      using errcode = '23514';
  end if;

  if v_reserve > 0 then
    perform private.apply_stock(new.item_id, new.source_store_id, 0, v_reserve, 'reserve', new.quote_id);
  end if;
  if v_deduct > 0 then
    perform private.apply_stock(new.item_id, new.source_store_id, -v_deduct, 0, 'sale', new.quote_id);
  end if;
  new.reserved_qty := v_reserve;
  new.deducted_qty := v_deduct;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Search: archived products are hidden; a product's own barcode finds it too.
-- ---------------------------------------------------------------------------------------------------
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
  where not i.is_archived
  and (
    (i.barcode is not null and i.barcode = btrim(coalesce(p_query, '')))
    or exists (
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
    )
  );
$$;

create or replace function public.inventory_items_at_store(p_store_id uuid, p_stock text default null, p_query text default null)
returns setof public.inventory_items
language sql
stable
set search_path = ''
as $$
  select i.*
  from public.inventory_items i
  left join public.stock_levels l on l.item_id = i.id and l.store_id = p_store_id
  where not i.is_archived
    and (p_query is null or i.id in (select s.id from public.search_inventory_items(p_query) s))
    and case p_stock
      when 'in' then coalesce(l.on_hand - l.reserved, 0) > 0
      when 'out' then coalesce(l.on_hand - l.reserved, 0) <= 0
      when 'low' then coalesce(l.on_hand - l.reserved, 0) <= coalesce(l.low_stock_threshold, i.low_stock_threshold)
      else true
    end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The inventory page's rows
-- ---------------------------------------------------------------------------------------------------
create type public.inventory_list_row as (
  -- The product's or kit's id, or the group's id for a group row.
  id uuid,
  kind text,
  group_id uuid,
  name text,
  sku text,
  category_id uuid,
  is_universal boolean,
  attributes jsonb,
  -- A group: its cheapest and dearest variant.
  selling_price numeric,
  max_price numeric,
  cost_price numeric,
  quantity_on_hand numeric,
  reserved_quantity numeric,
  available_quantity numeric,
  low_stock_threshold numeric,
  is_low_stock boolean,
  variant_count integer,
  created_at timestamptz
);

-- p_grouped: one row per product group (its variants rolled up; a search matching any variant shows the
-- whole group) instead of one per variant. p_store_id: that store's stock, price and low-stock level;
-- null = the organization's totals. Kits show the whole kits their components make.
create function public.inventory_list(p_store_id uuid default null, p_grouped boolean default true, p_query text default null)
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
         s.on_hand - s.reserved <= s.threshold, 0, s.created_at
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
revoke all on function public.inventory_list(uuid, boolean, text) from public, anon;
grant execute on function public.inventory_list(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Product groups
-- ---------------------------------------------------------------------------------------------------
-- A variant that's switched off: deleted, or archived when it's on documents or has stock history.
-- Not while it has stock or is in a kit.
create function private.retire_variant(p_item uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  select i.name into v_name from public.inventory_items i where i.id = p_item;
  if exists (select 1 from public.stock_levels l where l.item_id = p_item and (l.on_hand <> 0 or l.reserved <> 0)) then
    raise exception '% still has stock. Sell it, or set its stock to 0, before switching it off.', v_name using errcode = '23514';
  end if;
  if exists (select 1 from public.kit_components k where k.component_id = p_item) then
    raise exception '% is in a kit. Take it out of the kit before switching it off.', v_name using errcode = '23514';
  end if;
  if exists (select 1 from public.quote_items qi where qi.item_id = p_item)
     or exists (select 1 from public.stock_movements m where m.item_id = p_item) then
    update public.inventory_items set is_archived = true, updated_at = now() where id = p_item;
  else
    delete from public.inventory_items where id = p_item;
  end if;
end;
$$;
revoke all on function private.retire_variant(uuid) from public, anon;
grant execute on function private.retire_variant(uuid) to authenticated;

-- p_group: { id?, name, sku_prefix, description, vendor_name, category_id, base_uom_id, cost_price,
--   selling_price, low_stock_threshold, price_includes_tax, is_universal, vehicle_ids[], attributes{},
--   options: [{ id?, name, values: [{ id?, value, price_delta }] }],
--   variants: [{ id?, values: [text per option], sku, barcode, selling_price (null = the group's + deltas),
--                cost_price (null = the group's), low_stock_threshold, enabled, stock: [{ store_id, on_hand }] }] }
-- Stock entered is set at each store (opening stock for new variants, else an adjustment); the caller must
-- work in the store. Returns the group's id.
create function public.save_product_group(p_group jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_fitment boolean;
  v_universal boolean;
  v_vehicles integer[];
  v_id uuid := nullif(p_group->>'id', '')::uuid;
  v_group public.product_groups;
  v_has_variants boolean := false;
  v_option_count integer;
  v_opt jsonb;
  v_val jsonb;
  v_pos integer;
  v_vpos integer;
  v_type_id uuid;
  v_value_id uuid;
  v_var jsonb;
  v_ids uuid[];
  v_values jsonb;
  v_label text;
  v_delta numeric;
  v_item_id uuid;
  v_was_archived boolean;
  v_is_new boolean;
  v_own_price boolean;
  v_own_cost boolean;
  v_keep uuid[] := '{}';
  v_st jsonb;
  v_bad text;
begin
  if v_tenant is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_group) <> 'object' or jsonb_typeof(p_group->'options') <> 'array' or jsonb_typeof(p_group->'variants') <> 'array' then
    raise exception 'A product group needs its options and variants.' using errcode = '22023';
  end if;
  v_option_count := jsonb_array_length(p_group->'options');
  if v_option_count not between 1 and 3 then
    raise exception 'Give a product group 1 to 3 options (e.g. Size, Colour).' using errcode = '22023';
  end if;
  if jsonb_array_length(p_group->'variants') > 300 then
    raise exception 'A product group can have at most 300 variants.' using errcode = '22023';
  end if;
  select lower(btrim(o->>'name')) into v_bad from jsonb_array_elements(p_group->'options') o
  group by lower(btrim(o->>'name')) having count(*) > 1 limit 1;
  if found then
    raise exception 'Two options are called "%".', v_bad using errcode = '22023';
  end if;

  v_fitment := private.tenant_has_module(v_tenant, 'vehicle_fitment');
  v_universal := coalesce((p_group->>'is_universal')::boolean, true) or not v_fitment;
  v_vehicles := array(select distinct (e)::integer from jsonb_array_elements_text(coalesce(p_group->'vehicle_ids', '[]')) e);
  if v_fitment and not v_universal and coalesce(cardinality(v_vehicles), 0) = 0 then
    raise exception 'Vehicle-specific items need at least one vehicle.' using errcode = '22023';
  end if;

  -- The group.
  if v_id is null then
    insert into public.product_groups (
      tenant_id, name, sku_prefix, description, vendor_name, category_id, base_uom_id, cost_price, selling_price,
      low_stock_threshold, price_includes_tax, is_universal, attributes
    )
    values (
      v_tenant, btrim(p_group->>'name'), upper(btrim(p_group->>'sku_prefix')), nullif(btrim(p_group->>'description'), ''),
      nullif(btrim(p_group->>'vendor_name'), ''), (p_group->>'category_id')::uuid, (p_group->>'base_uom_id')::uuid,
      coalesce((p_group->>'cost_price')::numeric, 0), coalesce((p_group->>'selling_price')::numeric, 0),
      coalesce((p_group->>'low_stock_threshold')::numeric, 5), coalesce((p_group->>'price_includes_tax')::boolean, true),
      v_universal, coalesce(p_group->'attributes', '{}')
    )
    returning * into v_group;
  else
    select * into v_group from public.product_groups where id = v_id and not is_archived for update;
    if not found then
      raise exception 'This product group no longer exists.' using errcode = 'P0002';
    end if;
    v_has_variants := exists (select 1 from public.inventory_items i where i.group_id = v_id);
    update public.product_groups
    set name = btrim(p_group->>'name'),
        sku_prefix = upper(btrim(p_group->>'sku_prefix')),
        description = nullif(btrim(p_group->>'description'), ''),
        vendor_name = nullif(btrim(p_group->>'vendor_name'), ''),
        category_id = (p_group->>'category_id')::uuid,
        base_uom_id = (p_group->>'base_uom_id')::uuid,
        cost_price = coalesce((p_group->>'cost_price')::numeric, 0),
        selling_price = coalesce((p_group->>'selling_price')::numeric, 0),
        low_stock_threshold = coalesce((p_group->>'low_stock_threshold')::numeric, 5),
        price_includes_tax = coalesce((p_group->>'price_includes_tax')::boolean, true),
        is_universal = v_universal,
        attributes = coalesce(p_group->'attributes', '{}'),
        updated_at = now()
    where id = v_id
    returning * into v_group;
  end if;

  -- Options. Once a group has variants its options stay (their names and values can still change).
  if v_has_variants and (
       v_option_count <> (select count(*) from public.product_option_types t where t.group_id = v_group.id)
       or exists (select 1 from jsonb_array_elements(p_group->'options') with ordinality o(opt, n)
                  where not exists (select 1 from public.product_option_types t
                                    where t.group_id = v_group.id and t.id::text = o.opt->>'id' and t.position = o.n - 1))) then
    raise exception 'Options can''t be added or removed once a product group has variants. Rename them, or change their values.'
      using errcode = '22023';
  end if;
  for v_opt, v_pos in select o.opt, (o.n - 1)::integer from jsonb_array_elements(p_group->'options') with ordinality o(opt, n) loop
    if jsonb_typeof(v_opt->'values') <> 'array' or jsonb_array_length(v_opt->'values') not between 1 and 40 then
      raise exception 'Give % 1 to 40 values.', coalesce(nullif(btrim(v_opt->>'name'), ''), 'each option') using errcode = '22023';
    end if;
    select lower(btrim(e->>'value')) into v_bad from jsonb_array_elements(v_opt->'values') e
    group by lower(btrim(e->>'value')) having count(*) > 1 limit 1;
    if found then
      raise exception '% lists "%" twice.', btrim(v_opt->>'name'), v_bad using errcode = '22023';
    end if;
    v_type_id := nullif(v_opt->>'id', '')::uuid;
    if v_type_id is null then
      insert into public.product_option_types (tenant_id, group_id, name, position)
      values (v_tenant, v_group.id, btrim(v_opt->>'name'), v_pos)
      returning id into v_type_id;
    else
      update public.product_option_types set name = btrim(v_opt->>'name'), position = v_pos
      where id = v_type_id and group_id = v_group.id;
      if not found then
        raise exception 'An option changed while you were editing. Reload and try again.' using errcode = '40001';
      end if;
    end if;
    -- Values left out go (variants keep their label; theirs are switched off below).
    delete from public.product_option_values v
    where v.option_type_id = v_type_id
      and not exists (select 1 from jsonb_array_elements(v_opt->'values') e where e->>'id' = v.id::text);
    for v_val, v_vpos in select e, (n - 1)::integer from jsonb_array_elements(v_opt->'values') with ordinality x(e, n) loop
      v_value_id := nullif(v_val->>'id', '')::uuid;
      if v_value_id is null then
        insert into public.product_option_values (tenant_id, option_type_id, value, position, price_delta)
        values (v_tenant, v_type_id, btrim(v_val->>'value'), v_vpos, coalesce((v_val->>'price_delta')::numeric, 0));
      else
        update public.product_option_values
        set value = btrim(v_val->>'value'), position = v_vpos, price_delta = coalesce((v_val->>'price_delta')::numeric, 0)
        where id = v_value_id and option_type_id = v_type_id;
        if not found then
          raise exception 'An option value changed while you were editing. Reload and try again.' using errcode = '40001';
        end if;
      end if;
    end loop;
  end loop;

  -- Variants.
  for v_var in select e from jsonb_array_elements(p_group->'variants') e loop
    if jsonb_typeof(v_var->'values') <> 'array' or jsonb_array_length(v_var->'values') <> v_option_count then
      raise exception 'Each variant needs one value for each option.' using errcode = '22023';
    end if;
    v_ids := array(
      select (select ov.id from public.product_option_values ov
              join public.product_option_types ot on ot.id = ov.option_type_id
              where ot.group_id = v_group.id and ot.position = x.n - 1 and lower(ov.value) = lower(btrim(x.v)))
      from jsonb_array_elements_text(v_var->'values') with ordinality x(v, n)
      order by x.n);
    if array_position(v_ids, null) is not null then
      raise exception 'A variant uses a value that isn''t in its options.' using errcode = '22023';
    end if;
    v_values := to_jsonb(v_ids);
    select string_agg(ov.value, ' / ' order by ot.position), coalesce(sum(ov.price_delta), 0) into v_label, v_delta
    from unnest(v_ids) u(id)
    join public.product_option_values ov on ov.id = u.id
    join public.product_option_types ot on ot.id = ov.option_type_id;

    -- The saved variant: by id, else by its options (an archived one comes back).
    v_item_id := null;
    select i.id, i.is_archived into v_item_id, v_was_archived
    from public.inventory_items i
    where i.group_id = v_group.id
      and (i.id::text = v_var->>'id' or (nullif(v_var->>'id', '') is null and i.option_values = v_values))
    limit 1;
    if v_item_id = any (v_keep) then
      raise exception 'Two variants are both %.', v_label using errcode = '22023';
    end if;

    if not coalesce((v_var->>'enabled')::boolean, true) then
      if v_item_id is not null and not v_was_archived then
        perform private.retire_variant(v_item_id);
      end if;
      continue;
    end if;

    v_own_price := nullif(v_var->>'selling_price', '') is not null;
    v_own_cost := nullif(v_var->>'cost_price', '') is not null;
    v_is_new := v_item_id is null;
    if v_is_new then
      insert into public.inventory_items (
        tenant_id, sku, name, description, category_id, cost_price, selling_price, low_stock_threshold, is_universal,
        price_includes_tax, vendor_name, attributes, base_uom_id, group_id, option_values, variant_label, own_price, own_cost, barcode
      )
      values (
        v_tenant, upper(btrim(v_var->>'sku')), v_group.name || ' – ' || v_label, v_group.description, v_group.category_id,
        case when v_own_cost then (v_var->>'cost_price')::numeric else v_group.cost_price end,
        case when v_own_price then (v_var->>'selling_price')::numeric else v_group.selling_price + v_delta end,
        coalesce((v_var->>'low_stock_threshold')::numeric, v_group.low_stock_threshold), v_universal,
        v_group.price_includes_tax, v_group.vendor_name, v_group.attributes, v_group.base_uom_id,
        v_group.id, v_values, v_label, v_own_price, v_own_cost, nullif(btrim(v_var->>'barcode'), '')
      )
      returning id into v_item_id;
    else
      update public.inventory_items
      set sku = upper(btrim(v_var->>'sku')),
          name = v_group.name || ' – ' || v_label,
          description = v_group.description,
          category_id = v_group.category_id,
          cost_price = case when v_own_cost then (v_var->>'cost_price')::numeric else v_group.cost_price end,
          selling_price = case when v_own_price then (v_var->>'selling_price')::numeric else v_group.selling_price + v_delta end,
          low_stock_threshold = coalesce((v_var->>'low_stock_threshold')::numeric, low_stock_threshold),
          is_universal = v_universal,
          price_includes_tax = v_group.price_includes_tax,
          vendor_name = v_group.vendor_name,
          attributes = v_group.attributes,
          base_uom_id = v_group.base_uom_id,
          option_values = v_values,
          variant_label = v_label,
          own_price = v_own_price,
          own_cost = v_own_cost,
          barcode = nullif(btrim(v_var->>'barcode'), ''),
          is_archived = false,
          updated_at = now()
      where id = v_item_id;
    end if;
    v_keep := v_keep || v_item_id;

    if v_fitment then
      delete from public.item_vehicle_compatibility where item_id = v_item_id and tenant_id = v_tenant;
      if not v_universal then
        insert into public.item_vehicle_compatibility (tenant_id, item_id, vehicle_id)
        select v_tenant, v_item_id, vehicle_id from unnest(v_vehicles) as vehicle_id;
      end if;
    end if;

    for v_st in select e from jsonb_array_elements(coalesce(v_var->'stock', '[]')) e loop
      if nullif(v_st->>'on_hand', '') is null then
        continue;
      end if;
      if (v_st->>'on_hand')::numeric < 0 then
        raise exception 'Stock can''t be negative.' using errcode = '22023';
      end if;
      perform private.set_item_stock(v_item_id, (v_st->>'store_id')::uuid, (v_st->>'on_hand')::numeric,
                                     case when v_is_new then 'opening' else 'adjustment' end);
    end loop;
  end loop;

  if cardinality(v_keep) = 0 then
    raise exception 'Switch on at least one variant.' using errcode = '22023';
  end if;
  -- Saved variants left out (or whose value was removed) are switched off.
  for v_item_id in select i.id from public.inventory_items i where i.group_id = v_group.id and not i.is_archived and i.id <> all (v_keep) loop
    perform private.retire_variant(v_item_id);
  end loop;

  return v_group.id;
end;
$$;
revoke all on function public.save_product_group(jsonb) from public, anon;
grant execute on function public.save_product_group(jsonb) to authenticated;

-- Deletes a group: each variant is deleted, or archived when it has documents or history (then the
-- group stays archived with it). Returns 'deleted' or 'archived'.
create function public.delete_product_group(p_group uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_item uuid;
begin
  if public.current_tenant_id() is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  perform 1 from public.product_groups g where g.id = p_group and not g.is_archived for update;
  if not found then
    raise exception 'This product group no longer exists.' using errcode = 'P0002';
  end if;
  for v_item in select i.id from public.inventory_items i where i.group_id = p_group and not i.is_archived loop
    perform private.retire_variant(v_item);
  end loop;
  if exists (select 1 from public.inventory_items i where i.group_id = p_group) then
    update public.product_groups set is_archived = true, updated_at = now() where id = p_group;
    return 'archived';
  end if;
  delete from public.product_groups where id = p_group;
  return 'deleted';
end;
$$;
revoke all on function public.delete_product_group(uuid) from public, anon;
grant execute on function public.delete_product_group(uuid) to authenticated;

-- Phase 21 (2/3, continued): save_inventory_item with barcodes and kits, and the console's checks.

-- ---------------------------------------------------------------------------------------------------
-- save_inventory_item: barcode and kits; variants are edited through their group.
-- ---------------------------------------------------------------------------------------------------

-- p_barcode: null leaves it, '' clears it. p_is_kit: null leaves it (new products: not a kit).
-- p_kit_components: [{ item_id, quantity }] replaces a kit's products; null leaves them.
create function public.save_inventory_item(
  p_sku text, p_name text, p_category_id uuid, p_cost_price numeric, p_selling_price numeric,
  p_quantity_on_hand numeric, p_low_stock_threshold numeric, p_is_universal boolean,
  p_item_id uuid default null, p_description text default null, p_vehicle_ids integer[] default '{}',
  p_price_includes_tax boolean default true, p_vendor_name text default null, p_attributes jsonb default '{}',
  p_base_uom_id uuid default null, p_purchase_uom_id uuid default null, p_sale_uom_id uuid default null,
  p_conversions jsonb default null, p_store_id uuid default null, p_store_settings jsonb default null,
  p_barcode text default null, p_is_kit boolean default null, p_kit_components jsonb default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_fitment boolean;
  v_item_id uuid;
  v_base uuid := p_base_uom_id;
  v_store uuid;
  v_group uuid;
  v_was_kit boolean;
  v_name text;
  v_kit boolean;
  v_qty numeric := p_quantity_on_hand;
  v_conversions jsonb := p_conversions;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  v_fitment := private.tenant_has_module(v_tenant_id, 'vehicle_fitment');

  if p_item_id is not null then
    select i.group_id, i.is_kit, i.name into v_group, v_was_kit, v_name from public.inventory_items i where i.id = p_item_id and i.tenant_id = v_tenant_id;
    if not found then
      raise exception 'Inventory item not found.' using errcode = 'P0002';
    end if;
    if v_group is not null then
      raise exception '% is a variant: change it in its product group.', v_name using errcode = '55000';
    end if;
  end if;
  v_kit := coalesce(p_is_kit, v_was_kit, false);
  if p_item_id is not null and v_kit is distinct from v_was_kit
     and (exists (select 1 from public.stock_levels l where l.item_id = p_item_id and (l.on_hand <> 0 or l.reserved <> 0))
          or exists (select 1 from public.quote_items qi where qi.item_id = p_item_id)) then
    raise exception '%', case when v_kit then 'A product with stock or on documents can''t become a kit.'
                              else 'A kit that''s on documents can''t become a normal product.' end using errcode = '55000';
  end if;
  -- A kit has no stock or packs of its own.
  if v_kit then
    v_qty := null;
    v_conversions := '[]';
  end if;

  if v_fitment and not p_is_universal and coalesce(cardinality(p_vehicle_ids), 0) = 0 then
    raise exception 'Vehicle-specific items need at least one vehicle.' using errcode = '22023';
  end if;
  if v_conversions is not null and jsonb_typeof(v_conversions) <> 'array' then
    raise exception 'Unit conversions must be a list.' using errcode = '22023';
  end if;
  if p_kit_components is not null and jsonb_typeof(p_kit_components) <> 'array' then
    raise exception 'A kit''s products must be a list.' using errcode = '22023';
  end if;
  if p_store_settings is not null and (jsonb_typeof(p_store_settings) <> 'array' or not private.is_shop_admin()) then
    raise exception 'Only admins can set store prices and store low-stock levels.' using errcode = '42501';
  end if;
  -- The stock entered is the current store's (the app passes it); null leaves stock alone.
  if v_qty is not null then
    v_store := coalesce(p_store_id, private.default_store_id());
    if v_store is null or not private.can_work_in_store(v_store) then
      raise exception 'You can''t change stock in that store.' using errcode = '42501';
    end if;
    if v_qty < 0 then
      raise exception 'Stock can''t be negative.' using errcode = '22023';
    end if;
  end if;

  if v_base is null and p_item_id is not null then
    select base_uom_id into v_base from public.inventory_items where id = p_item_id and tenant_id = v_tenant_id;
  end if;
  if v_base is null then
    select id into v_base from public.units_of_measure where tenant_id = v_tenant_id and lower(code) = 'pcs';
  end if;
  if not exists (select 1 from public.units_of_measure where id = v_base and tenant_id = v_tenant_id) then
    raise exception 'Choose a unit for this product.' using errcode = '22023';
  end if;

  if p_item_id is null then
    insert into public.inventory_items (
      tenant_id, sku, name, description, category_id, cost_price, selling_price,
      low_stock_threshold, is_universal, price_includes_tax, vendor_name, attributes,
      base_uom_id, purchase_uom_id, sale_uom_id, barcode, is_kit
    )
    values (
      v_tenant_id, p_sku, p_name, p_description, p_category_id, p_cost_price, p_selling_price,
      p_low_stock_threshold, p_is_universal or not v_fitment, p_price_includes_tax,
      nullif(btrim(p_vendor_name), ''), coalesce(p_attributes, '{}'),
      v_base, case when not v_kit then nullif(p_purchase_uom_id, v_base) end, case when not v_kit then nullif(p_sale_uom_id, v_base) end,
      nullif(btrim(p_barcode), ''), v_kit
    )
    returning id into v_item_id;
  else
    update public.inventory_items
    set sku = p_sku,
        name = p_name,
        description = p_description,
        category_id = p_category_id,
        cost_price = p_cost_price,
        selling_price = p_selling_price,
        low_stock_threshold = p_low_stock_threshold,
        is_universal = case when v_fitment then p_is_universal else is_universal end,
        price_includes_tax = p_price_includes_tax,
        vendor_name = nullif(btrim(p_vendor_name), ''),
        attributes = coalesce(p_attributes, '{}'),
        base_uom_id = v_base,
        purchase_uom_id = case when not v_kit then nullif(p_purchase_uom_id, v_base) end,
        sale_uom_id = case when not v_kit then nullif(p_sale_uom_id, v_base) end,
        barcode = case when p_barcode is null then barcode else nullif(btrim(p_barcode), '') end,
        is_kit = v_kit,
        updated_at = now()
    where id = p_item_id and tenant_id = v_tenant_id
    returning id into v_item_id;

    if v_fitment then
      delete from public.item_vehicle_compatibility
      where item_id = v_item_id and tenant_id = v_tenant_id;
    end if;
  end if;

  -- A new base unit can't also be a conversion.
  delete from public.item_uom_conversions where item_id = v_item_id and uom_id = v_base;

  if v_fitment and not p_is_universal then
    insert into public.item_vehicle_compatibility (tenant_id, item_id, vehicle_id)
    select distinct v_tenant_id, v_item_id, vehicle_id
    from unnest(p_vehicle_ids) as vehicle_id;
  end if;

  if v_conversions is not null then
    -- Conversions removed from the list go (clearing them as purchase / sale unit is done by the trigger,
    -- after which the values just saved are put back if they still point at a kept conversion).
    delete from public.item_uom_conversions c
    where c.item_id = v_item_id
      and not exists (select 1 from jsonb_array_elements(v_conversions) e where (e->>'uom_id')::uuid = c.uom_id);
    insert into public.item_uom_conversions (tenant_id, item_id, uom_id, factor, selling_price, barcode, sort_order)
    select v_tenant_id, v_item_id, (e->>'uom_id')::uuid, (e->>'factor')::numeric,
           nullif(e->>'selling_price', '')::numeric, nullif(btrim(e->>'barcode'), ''), ord::integer
    from jsonb_array_elements(v_conversions) with ordinality as x(e, ord)
    on conflict (item_id, uom_id) do update
      set factor = excluded.factor, selling_price = excluded.selling_price,
          barcode = excluded.barcode, sort_order = excluded.sort_order;
    update public.inventory_items
    set purchase_uom_id = case when not v_kit then nullif(p_purchase_uom_id, v_base) end,
        sale_uom_id = case when not v_kit then nullif(p_sale_uom_id, v_base) end
    where id = v_item_id;
  end if;

  -- RF-21.1: the kit's products (the list replaces what was there).
  if v_kit and p_kit_components is not null then
    delete from public.kit_components k
    where k.kit_id = v_item_id
      and not exists (select 1 from jsonb_array_elements(p_kit_components) e where (e->>'item_id')::uuid = k.component_id);
    insert into public.kit_components (tenant_id, kit_id, component_id, quantity, position)
    select v_tenant_id, v_item_id, (e->>'item_id')::uuid, (e->>'quantity')::numeric, (ord - 1)::smallint
    from jsonb_array_elements(p_kit_components) with ordinality as x(e, ord)
    on conflict (kit_id, component_id) do update set quantity = excluded.quantity, position = excluded.position;
  elsif not v_kit then
    delete from public.kit_components where kit_id = v_item_id;
  end if;
  if v_kit and not exists (select 1 from public.kit_components k where k.kit_id = v_item_id) then
    raise exception 'Add at least one product to the kit.' using errcode = '22023';
  end if;

  -- Stock at the current store: opening stock for a new product, else an adjustment to the figure entered.
  if v_qty is not null then
    perform private.set_item_stock(v_item_id, v_store, v_qty, case when p_item_id is null then 'opening' else 'adjustment' end);
  end if;

  -- RF-20.1 store prices and per-store low-stock levels (admins): the list replaces what was set.
  if p_store_settings is not null then
    perform private.set_item_store_settings(v_item_id, p_store_settings);
  end if;

  return v_item_id;
end;
$$;
revoke all on function public.save_inventory_item(text, text, uuid, numeric, numeric, numeric, numeric, boolean, uuid, text, integer[], boolean, text, jsonb, uuid, uuid, uuid, jsonb, uuid, jsonb, text, boolean, jsonb) from public, anon;
grant execute on function public.save_inventory_item(text, text, uuid, numeric, numeric, numeric, numeric, boolean, uuid, text, integer[], boolean, text, jsonb, uuid, uuid, uuid, jsonb, uuid, jsonb, text, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Console: archived products don't count; kit lines' component reservations reconcile too.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.admin_near_limits(p_ratio numeric default 0.9)
returns table (tenant_id uuid, name text, kind text, used bigint, max integer)
language sql
stable
security definer
set search_path = ''
as $$
  with lim as (
    select t.id, t.name,
      coalesce(s.max_users, p.max_users) as max_users,
      coalesce(s.max_products, p.max_products) as max_products,
      coalesce(s.max_stores, p.max_stores) as max_stores
    from public.tenants t
    join public.tenant_subscriptions s on s.tenant_id = t.id
    join public.subscription_plans p on p.id = s.plan_id
    where t.archived_at is null
  ), used as (
    select l.*,
      (select count(*) from public.profiles x where x.tenant_id = l.id and x.deactivated_at is null) as users,
      (select count(*) from public.inventory_items i where i.tenant_id = l.id and not i.is_archived) as products,
      (select count(*) from public.stores st where st.tenant_id = l.id and st.is_active) as stores
    from lim l
    where l.max_users is not null or l.max_products is not null or l.max_stores is not null
  )
  select id, name, 'users', users, max_users from used where max_users is not null and users >= ceil(max_users * p_ratio)
  union all
  select id, name, 'products', products, max_products from used where max_products is not null and products >= ceil(max_products * p_ratio)
  union all
  select id, name, 'stores', stores, max_stores from used where max_stores is not null and max_stores > 1 and stores >= ceil(max_stores * p_ratio)
  order by 4 desc
  limit 50;
$$;

create or replace function public.admin_reconcile_tenant(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.invoice_number, 'stored', q.amount_paid, 'computed', coalesce(x.paid, 0)))
      from public.quotes q
      left join (select ip.quote_id, sum(ip.amount) as paid from public.invoice_payments ip where ip.tenant_id = p_tenant group by ip.quote_id) x on x.quote_id = q.id
      where q.tenant_id = p_tenant and q.amount_paid <> coalesce(x.paid, 0)), '[]'::jsonb),
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.item_id, 'sku', i.sku, 'name', i.name || ' · ' || s.name, 'stored', l.reserved, 'computed', coalesce(r.qty, 0)))
      from public.stock_levels l
      join public.inventory_items i on i.id = l.item_id
      join public.stores s on s.id = l.store_id
      left join (
        select h.item_id, h.source_store_id, sum(h.qty) as qty
        from (
          select qi.item_id, qi.source_store_id, qi.reserved_qty as qty
          from public.quote_items qi where qi.tenant_id = p_tenant and qi.kit_components is null
          union all
          -- RF-21.1: kit lines reserve their components.
          select (e->>'item_id')::uuid, qi.source_store_id, round(qi.reserved_qty * (e->>'quantity')::numeric, 3)
          from public.quote_items qi cross join jsonb_array_elements(qi.kit_components) e
          where qi.tenant_id = p_tenant and qi.kit_components is not null and qi.reserved_qty > 0
        ) h
        group by h.item_id, h.source_store_id) r
        on r.item_id = l.item_id and r.source_store_id = l.store_id
      where l.tenant_id = p_tenant and l.reserved <> coalesce(r.qty, 0)), '[]'::jsonb),
    'checkedAt', now()
  );
$$;

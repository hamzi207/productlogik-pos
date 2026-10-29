-- Phase 21: a variant switched off together with its stock set to 0 (one save) has its stock set first.

create or replace function public.save_product_group(p_group jsonb)
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
        -- Stock entered with it (e.g. set to 0 to switch it off) is set first.
        for v_st in select e from jsonb_array_elements(coalesce(v_var->'stock', '[]')) e loop
          if nullif(v_st->>'on_hand', '') is not null then
            if (v_st->>'on_hand')::numeric < 0 then
              raise exception 'Stock can''t be negative.' using errcode = '22023';
            end if;
            perform private.set_item_stock(v_item_id, (v_st->>'store_id')::uuid, (v_st->>'on_hand')::numeric, 'adjustment');
          end if;
        end loop;
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

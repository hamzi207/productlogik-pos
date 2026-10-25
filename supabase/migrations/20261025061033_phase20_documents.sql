-- Phase 20 (2/3): documents work in a store.
--
-- * quotes.store_id: a new document goes to the caller's current store (save_quote p_store_id),
--   which must be one they can work in; it can't move once its lines hold stock.
-- * quote_items.source_store_id: where a line's stock is reserved / deducted. The document's store,
--   unless the organization allows invoicing from other stores and the caller may (admins, or
--   everyone, per Settings → Stores). Enforced here, so the API can't get round the app.
-- * Stock moves through private.apply_stock (ledger: reserve / release / sale / sale_cancel).
-- * Editing or converting a document needs its store; numbering can run per store (RF-20.2); new
--   lines are priced at the document store's own price (RF-20.1).

-- ---------------------------------------------------------------------------------------------------
-- Document store
-- ---------------------------------------------------------------------------------------------------
create function private.quotes_check_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.store_id := coalesce(new.store_id, private.default_store_id(),
                             (select s.id from public.stores s where s.tenant_id = new.tenant_id and s.is_main));
    if not private.can_work_in_store(new.store_id) then
      raise exception 'You can''t create documents in that store.' using errcode = '42501';
    end if;
  elsif new.store_id is distinct from old.store_id then
    if exists (select 1 from public.quote_items qi where qi.quote_id = new.id and (qi.reserved_qty > 0 or qi.deducted_qty > 0)) then
      raise exception 'This document holds stock, so its store can''t change.' using errcode = '55000';
    end if;
    if not private.can_work_in_store(new.store_id) then
      raise exception 'You can''t move documents to that store.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.quotes_check_store() from public, anon, authenticated;
create trigger quotes_check_store before insert or update of store_id on public.quotes
for each row execute function private.quotes_check_store();

-- ---------------------------------------------------------------------------------------------------
-- Line stock, per store
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
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select q.status, q.store_id, q.tenant_id into v_quote from public.quotes q where q.id = new.quote_id;
    if new.item_id is null or new.is_labor then
      new.source_store_id := null;
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
      v_base := round(new.quantity * new.uom_factor, 3);
      if v_quote.status in ('sent', 'accepted') then
        v_reserve := v_base;
      elsif v_quote.status in ('invoiced', 'paid') then
        v_deduct := v_base;
      end if;
    end if;

    -- Already holding exactly this (e.g. a quotation turning into an invoice keeps nothing, but an
    -- invoice being paid holds the same): leave stock and the ledger alone.
    if tg_op = 'UPDATE' and old.item_id is not distinct from new.item_id
       and old.source_store_id is not distinct from new.source_store_id
       and old.reserved_qty = v_reserve and old.deducted_qty = v_deduct then
      new.reserved_qty := v_reserve;
      new.deducted_qty := v_deduct;
      return new;
    end if;
  end if;

  -- Give back what the old line held (if its product still exists).
  if tg_op in ('UPDATE', 'DELETE') and old.item_id is not null and (old.reserved_qty > 0 or old.deducted_qty > 0)
     and exists (select 1 from public.inventory_items i where i.id = old.item_id) then
    v_store := coalesce(old.source_store_id, (select q.store_id from public.quotes q where q.id = old.quote_id));
    if old.reserved_qty > 0 then
      perform private.apply_stock(old.item_id, v_store, 0, -old.reserved_qty, 'release', old.quote_id);
    end if;
    if old.deducted_qty > 0 then
      perform private.apply_stock(old.item_id, v_store, old.deducted_qty, 0, 'sale_cancel', old.quote_id);
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
-- save_quote, convert_quote, numbering and save_inventory_item with stores
-- ---------------------------------------------------------------------------------------------------
drop function public.save_quote(uuid, jsonb, uuid, text, integer, text, text, numeric, text, text, text, text, date);
drop function public.next_document_number(text);
drop function public.save_inventory_item(text, text, uuid, numeric, numeric, numeric, numeric, boolean, uuid, text, integer[], boolean, text, jsonb, uuid, uuid, uuid, jsonb);

create function public.save_quote(p_customer_id uuid, p_items jsonb, p_quote_id uuid default null::uuid, p_stage text default 'draft'::text, p_vehicle_id integer default null::integer, p_custom_vehicle_notes text default null::text, p_discount_type text default 'amount'::text, p_discount_value numeric default 0, p_notes text default null::text, p_discount_reason text default null::text, p_walk_in_name text default null::text, p_walk_in_phone text default null::text, p_due_date date default null::date, p_store_id uuid default null::uuid)
 returns quotes
 language plpgsql
 set search_path to ''
as $function$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_quote public.quotes;
  v_is_walk_in boolean;
  v_tax_rate numeric;
  v_custom_includes_tax boolean;
  v_validity integer;
  v_due_days integer;
  v_today date;
  v_line_count integer;
  v_subtotal numeric;
  v_discount numeric;
  v_factor numeric;
  v_included_tax numeric;
  v_added_tax numeric;
  v_total numeric;
  v_bad record;
  v_store uuid;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Line items must be a list.' using errcode = '22023';
  end if;
  if p_discount_type not in ('amount', 'percent') or coalesce(p_discount_value, -1) < 0
     or (p_discount_type = 'percent' and p_discount_value > 100) then
    raise exception 'Enter a valid discount.' using errcode = '22023';
  end if;

  -- RLS hides other shops' customers, so this also stops cross-shop links.
  -- Invoices fall due after the customer's credit period (0 = on the invoice date).
  select is_walk_in, credit_days into v_is_walk_in, v_due_days from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Choose a customer.' using errcode = 'P0002';
  end if;

  select tax_rate, prices_include_tax, quote_validity_days, (now() at time zone timezone)::date
  into v_tax_rate, v_custom_includes_tax, v_validity, v_today
  from public.tenants where id = v_tenant_id;

  if p_quote_id is not null then
    select * into v_quote from public.quotes where id = p_quote_id for update;
    if not found then
      raise exception 'This document no longer exists.' using errcode = 'P0002';
    end if;
    if v_quote.status in ('paid', 'cancelled', 'void') then
      raise exception 'Paid and cancelled documents can''t be changed.' using errcode = '55000';
    end if;
    if v_quote.status <> 'draft' then
      v_tax_rate := v_quote.tax_rate;
    end if;
    -- Editing a document means working in its store.
    v_store := v_quote.store_id;
    if not private.can_work_in_store(v_store) then
      raise exception 'This document belongs to %. Switch to that store to change it.',
        (select s.name from public.stores s where s.id = v_store) using errcode = '42501';
    end if;
  elsif p_stage is null or p_stage not in ('draft', 'quotation', 'invoice') then
    raise exception 'Unknown document type.' using errcode = '22023';
  else
    -- A new document goes to the current store (the app passes it), checked against the caller's stores.
    v_store := coalesce(p_store_id, private.default_store_id());
    if v_store is null then
      raise exception 'You don''t have a store to work in. Ask an admin to give you one (Settings → Team).' using errcode = '42501';
    end if;
    if not private.can_work_in_store(v_store) then
      raise exception 'You can''t create documents in that store.' using errcode = '42501';
    end if;
  end if;

  create temporary table if not exists pg_temp.save_quote_lines (
    item_id uuid, description text, is_labor boolean, quantity numeric, unit_price numeric,
    discount_type text, discount_value numeric, unit_discount numeric, sale_price numeric,
    gross numeric, net numeric, unit_cost numeric, price_includes_tax boolean, sort_order integer,
    requested_uom uuid, uom_id uuid, uom_label text, uom_factor numeric, uom_decimals smallint, base_decimals smallint,
    source_store_id uuid
  ) on commit drop;
  truncate pg_temp.save_quote_lines;

  -- Stock lines are priced from the catalogue: the base price, or the conversion's own price
  -- (else base price × factor) when sold in another unit. Cost follows the same factor.
  insert into pg_temp.save_quote_lines (
    item_id, description, is_labor, quantity, unit_price, discount_type, discount_value,
    unit_cost, price_includes_tax, sort_order,
    requested_uom, uom_id, uom_label, uom_factor, uom_decimals, base_decimals, source_store_id
  )
  select
    s.item_id,
    btrim(coalesce(l.description, '')),
    coalesce(l.is_labor, false),
    l.quantity,
    case when s.item_id is not null then coalesce(c.selling_price, round(coalesce(sp.selling_price, i.selling_price) * coalesce(c.factor, 1), 2)) else l.unit_price end,
    coalesce(l.discount_type, 'percent'),
    coalesce(l.discount_value, 0),
    case when s.item_id is not null then round(coalesce(i.cost_price, 0) * coalesce(c.factor, 1), 2) else 0 end,
    case when s.item_id is not null then coalesce(i.price_includes_tax, true) else v_custom_includes_tax end,
    l.ord::integer,
    case when s.item_id is not null then l.uom_id end,
    case when s.item_id is null then null when c.uom_id is not null then c.uom_id else i.base_uom_id end,
    case when s.item_id is null then null when c.uom_id is not null then cu.code else bu.code end,
    coalesce(c.factor, 1),
    case when s.item_id is null then 3 when c.uom_id is not null then cu.decimals else bu.decimals end,
    case when s.item_id is null then 3 else bu.decimals end,
    case when s.item_id is not null then coalesce(l.source_store_id, v_store) end
  from rows from (
    jsonb_to_recordset(p_items) as (
      item_id uuid, description text, is_labor boolean, quantity numeric, unit_price numeric,
      discount_type text, discount_value numeric, uom_id uuid, source_store_id uuid
    )
  ) with ordinality as l(item_id, description, is_labor, quantity, unit_price, discount_type, discount_value, uom_id, source_store_id, ord)
  cross join lateral (select case when coalesce(l.is_labor, false) then null else l.item_id end as item_id) s
  left join public.inventory_items i on i.id = s.item_id
  left join public.units_of_measure bu on bu.id = i.base_uom_id
  left join public.item_uom_conversions c on c.item_id = i.id and c.uom_id = l.uom_id and l.uom_id <> i.base_uom_id
  left join public.units_of_measure cu on cu.id = c.uom_id
  left join public.store_item_prices sp on sp.store_id = v_store and sp.item_id = i.id;

  if exists (select 1 from pg_temp.save_quote_lines l where l.item_id is not null and not exists (
               select 1 from public.inventory_items i where i.id = l.item_id)) then
    raise exception 'A product on this document is no longer in your inventory. Remove it and try again.' using errcode = '23503';
  end if;
  select description into v_bad from pg_temp.save_quote_lines
  where requested_uom is not null and requested_uom <> uom_id limit 1;
  if found then
    raise exception 'That unit isn''t set up for "%". Pick another unit.', v_bad.description using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where description = '') then
    raise exception 'Every line needs a description.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where quantity is null or quantity <= 0) then
    raise exception 'Quantities must be more than 0.' using errcode = '22023';
  end if;
  select description, uom_label, uom_decimals into v_bad from pg_temp.save_quote_lines
  where quantity <> round(quantity, uom_decimals) limit 1;
  if found then
    raise exception '"%" can have at most % decimal places%.', v_bad.description, v_bad.uom_decimals,
      case when v_bad.uom_label is not null then ' in ' || v_bad.uom_label else '' end using errcode = '22023';
  end if;
  select description, uom_label into v_bad from pg_temp.save_quote_lines
  where item_id is not null and round(quantity * uom_factor, 3) <> round(quantity * uom_factor, base_decimals) limit 1;
  if found then
    raise exception 'That quantity of "%" in % doesn''t come to a whole number of its base unit.', v_bad.description, v_bad.uom_label using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines where unit_price is null or unit_price < 0) then
    raise exception 'Prices can''t be negative.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.save_quote_lines
             where discount_type not in ('percent', 'amount') or discount_value < 0
                or (discount_type = 'percent' and discount_value > 100)) then
    raise exception 'Enter a valid line discount.' using errcode = '22023';
  end if;

  update pg_temp.save_quote_lines
  set unit_discount = case discount_type
                        when 'amount' then round(discount_value, 2)
                        else round(unit_price * discount_value / 100, 2)
                      end
  where true;  -- pg_safeupdate (API connections) rejects UPDATE without WHERE
  if exists (select 1 from pg_temp.save_quote_lines where unit_discount > unit_price) then
    raise exception 'A discount can''t be more than the unit price.' using errcode = '22023';
  end if;
  update pg_temp.save_quote_lines
  set sale_price = unit_price - unit_discount,
      gross = round(quantity * unit_price, 2),
      net = round(quantity * (unit_price - unit_discount), 2)
  where true;

  select count(*), coalesce(sum(net), 0) into v_line_count, v_subtotal from pg_temp.save_quote_lines;

  if v_line_count = 0 and (coalesce(v_quote.status, 'draft') <> 'draft' or (p_quote_id is null and p_stage <> 'draft')) then
    raise exception 'Add at least one item first.' using errcode = '22023';
  end if;

  v_discount := case p_discount_type
                  when 'percent' then round(v_subtotal * p_discount_value / 100, 2)
                  else round(p_discount_value, 2)
                end;
  if v_discount > v_subtotal then
    raise exception 'The discount can''t be more than the subtotal.' using errcode = '22023';
  end if;
  if v_discount > 0 and nullif(btrim(p_discount_reason), '') is null then
    raise exception 'Give a reason for the discount.' using errcode = '22023';
  end if;
  v_factor := case when v_subtotal > 0 then (v_subtotal - v_discount) / v_subtotal else 0 end;

  select
    coalesce(sum(net * v_factor * v_tax_rate / (100 + v_tax_rate)) filter (where price_includes_tax), 0),
    coalesce(sum(net * v_factor * v_tax_rate / 100) filter (where not price_includes_tax), 0)
  into v_included_tax, v_added_tax
  from pg_temp.save_quote_lines;
  v_total := round(v_subtotal - v_discount + v_added_tax, 2);

  if p_quote_id is not null and v_quote.amount_paid > v_total then
    raise exception 'Payments already recorded (%) are more than the new total (%). Remove a payment first.',
      v_quote.amount_paid, v_total using errcode = '23514';
  end if;

  if p_quote_id is null then
    insert into public.quotes (
      tenant_id, store_id, customer_id, vehicle_id, custom_vehicle_notes, status,
      draft_number, quotation_number, invoice_number, quoted_at, invoiced_at, valid_until, due_date,
      subtotal, tax_rate, tax_amount, discount_type, discount_value, discount_amount, discount_reason,
      total_amount, notes, walk_in_name, walk_in_phone, created_by
    )
    values (
      v_tenant_id, v_store, p_customer_id, p_vehicle_id, nullif(btrim(p_custom_vehicle_notes), ''),
      case p_stage when 'draft' then 'draft' when 'quotation' then 'sent' else 'invoiced' end,
      case when p_stage = 'draft' then public.next_document_number('D', v_store) end,
      case when p_stage = 'quotation' then public.next_document_number('Q', v_store) end,
      case when p_stage = 'invoice' then public.next_document_number('INV', v_store) end,
      case when p_stage = 'quotation' then now() end,
      case when p_stage = 'invoice' then now() end,
      case when p_stage = 'quotation' then now() + make_interval(days => v_validity) end,
      case when p_stage = 'invoice' then coalesce(p_due_date, v_today + v_due_days) end,
      v_subtotal, v_tax_rate, round(v_included_tax + v_added_tax, 2), p_discount_type,
      p_discount_value, v_discount, case when v_discount > 0 then btrim(p_discount_reason) end,
      v_total, nullif(btrim(p_notes), ''),
      case when v_is_walk_in then nullif(btrim(p_walk_in_name), '') end,
      case when v_is_walk_in then nullif(btrim(p_walk_in_phone), '') end,
      auth.uid()
    )
    returning * into v_quote;
  else
    -- Removing the old lines gives back any stock they held.
    delete from public.quote_items where quote_id = p_quote_id;

    update public.quotes
    set customer_id = p_customer_id,
        vehicle_id = p_vehicle_id,
        custom_vehicle_notes = nullif(btrim(p_custom_vehicle_notes), ''),
        subtotal = v_subtotal,
        tax_rate = v_tax_rate,
        tax_amount = round(v_included_tax + v_added_tax, 2),
        discount_type = p_discount_type,
        discount_value = p_discount_value,
        discount_amount = v_discount,
        discount_reason = case when v_discount > 0 then btrim(p_discount_reason) end,
        total_amount = v_total,
        due_date = case when status in ('invoiced', 'paid') then coalesce(p_due_date, due_date) else due_date end,
        notes = nullif(btrim(p_notes), ''),
        walk_in_name = case when v_is_walk_in then nullif(btrim(p_walk_in_name), '') end,
        walk_in_phone = case when v_is_walk_in then nullif(btrim(p_walk_in_phone), '') end,
        updated_at = now()
    where id = p_quote_id
    returning * into v_quote;
  end if;

  -- Inserting the lines reserves (quotation) or deducts (invoice) their stock, in base units.
  insert into public.quote_items (
    tenant_id, quote_id, item_id, description, is_labor, quantity, unit_cost, unit_price,
    discount_type, discount_value, discount_amount, sale_price, total_price, price_includes_tax, sort_order,
    uom_id, uom_label, uom_factor, source_store_id
  )
  select v_tenant_id, v_quote.id, item_id, description, is_labor, quantity, unit_cost, unit_price,
         discount_type, discount_value, gross - net, sale_price, net, price_includes_tax, sort_order,
         uom_id, uom_label, uom_factor, source_store_id
  from pg_temp.save_quote_lines;

  return v_quote;
end;
$function$
;
create or replace function public.convert_quote(p_quote_id uuid, p_target text)
returns public.quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_validity integer;
  v_due_days integer;
  v_today date;
begin
  if public.current_tenant_id() is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'This document no longer exists.' using errcode = 'P0002';
  end if;
  if not private.can_work_in_store(v_quote.store_id) then
    raise exception 'This document belongs to %. Switch to that store to change it.',
      (select s.name from public.stores s where s.id = v_quote.store_id) using errcode = '42501';
  end if;
  select quote_validity_days, (now() at time zone timezone)::date
  into v_validity, v_today
  from public.tenants where id = v_quote.tenant_id;
  select credit_days into v_due_days from public.customers where id = v_quote.customer_id;

  if p_target = 'draft' then
    if v_quote.status not in ('sent', 'accepted', 'cancelled') then
      raise exception 'Only quotations can be moved back to drafts.' using errcode = '55000';
    end if;
    update public.quotes
    set status = 'draft', draft_number = coalesce(draft_number, public.next_document_number('D', v_quote.store_id)),
        valid_until = null, updated_at = now()
    where id = p_quote_id
    returning * into v_quote;
    return v_quote;
  end if;

  if not exists (select 1 from public.quote_items where quote_id = p_quote_id) then
    raise exception 'Add at least one item first.' using errcode = '22023';
  end if;

  if p_target = 'quotation' then
    if v_quote.status <> 'draft' then
      raise exception 'Only drafts can be turned into quotations.' using errcode = '55000';
    end if;
    update public.quotes
    set status = 'sent', quotation_number = coalesce(quotation_number, public.next_document_number('Q', v_quote.store_id)),
        quoted_at = now(), valid_until = now() + make_interval(days => v_validity), updated_at = now()
    where id = p_quote_id
    returning * into v_quote;
  elsif p_target = 'invoice' then
    if v_quote.status not in ('draft', 'sent', 'accepted') then
      raise exception 'Only drafts and open quotations can be invoiced.' using errcode = '55000';
    end if;
    update public.quotes
    set status = 'invoiced', invoice_number = public.next_document_number('INV', v_quote.store_id),
        invoiced_at = now(), due_date = v_today + v_due_days, updated_at = now()
    where id = p_quote_id
    returning * into v_quote;
  else
    raise exception 'Unknown conversion.' using errcode = '22023';
  end if;

  return v_quote;
end;
$$
;
create function public.next_document_number(p_prefix text, p_store_id uuid default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_last integer;
  v_shop_prefix text;
  v_start integer;
  v_per_store boolean;
  v_code text;
  v_series text;
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  if p_prefix is null or p_prefix not in ('D', 'Q', 'INV') then
    raise exception 'Unknown number series %.', p_prefix using errcode = '22023';
  end if;

  select case p_prefix when 'D' then t.draft_prefix when 'Q' then t.quote_prefix else t.invoice_prefix end,
         case p_prefix when 'D' then t.draft_start_number when 'Q' then t.quote_start_number else t.invoice_start_number end,
         t.number_per_store
    into v_shop_prefix, v_start, v_per_store
  from public.tenants t
  where t.id = v_tenant_id;

  -- RF-20.2: per-store series, prefixed by the store's code (LHR1-INV-1001). Each continues from the
  -- store's own highest number, and from any number already issued under that code.
  if v_per_store and p_store_id is not null then
    select s.code into v_code from public.stores s where s.id = p_store_id and s.tenant_id = v_tenant_id;
    if not found then
      raise exception 'That store isn''t in this organization.' using errcode = '23503';
    end if;
    if v_code is null then
      raise exception 'Give the store a code first (Settings → Stores): documents are numbered per store.' using errcode = '23514';
    end if;
    v_series := v_code || '-' || coalesce(v_shop_prefix, p_prefix) || '-';
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant_id::text || ':' || v_code || ':' || p_prefix, 0));
    select max(substring(n from '[0-9]+$')::integer) into v_last
    from (
      select case p_prefix when 'D' then q.draft_number when 'Q' then q.quotation_number else q.invoice_number end as n, q.store_id
      from public.quotes q
      where q.tenant_id = v_tenant_id
    ) numbers
    where n is not null and (store_id = p_store_id or starts_with(n, v_series));
    return v_series || (greatest(coalesce(v_last, 0), coalesce(v_start, 1001) - 1) + 1);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant_id::text || ':' || p_prefix, 0));

  select max(substring(n from '[0-9]+$')::integer) into v_last
  from (
    select case p_prefix
             when 'D' then q.draft_number
             when 'Q' then q.quotation_number
             else q.invoice_number
           end as n
    from public.quotes q
    where q.tenant_id = v_tenant_id
  ) numbers
  where n is not null;

  return coalesce(v_shop_prefix, p_prefix) || '-' || (greatest(coalesce(v_last, 0), coalesce(v_start, 1001) - 1) + 1);
end;
$$
;
-- save_inventory_item runs as the caller, who can't write stock or store prices directly: these two
-- helpers do it, checking the product is the caller's and the store rules.
create function private.set_item_stock(p_item uuid, p_store uuid, p_on_hand numeric, p_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current numeric;
begin
  if not exists (select 1 from public.inventory_items i where i.id = p_item and i.tenant_id = private.current_tenant_id()) then
    raise exception 'Inventory item not found.' using errcode = 'P0002';
  end if;
  if not private.can_work_in_store(p_store) then
    raise exception 'You can''t change stock in that store.' using errcode = '42501';
  end if;
  select coalesce((select l.on_hand from public.stock_levels l where l.item_id = p_item and l.store_id = p_store), 0) into v_current;
  if p_on_hand <> v_current then
    perform private.apply_stock(p_item, p_store, p_on_hand - v_current, 0, p_type);
  end if;
end;
$$;

create function private.set_item_store_settings(p_item uuid, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := private.current_tenant_id();
begin
  if not private.is_shop_admin() then
    raise exception 'Only admins can set store prices and store low-stock levels.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.inventory_items i where i.id = p_item and i.tenant_id = v_tenant_id) then
    raise exception 'Inventory item not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(p_settings) e
             where not exists (select 1 from public.stores s where s.id = (e->>'store_id')::uuid and s.tenant_id = v_tenant_id)) then
    raise exception 'That store isn''t in this organization.' using errcode = '23503';
  end if;
  if exists (select 1 from jsonb_array_elements(p_settings) e
             where nullif(e->>'selling_price', '')::numeric < 0 or nullif(e->>'low_stock_threshold', '')::numeric < 0) then
    raise exception 'Store prices and low-stock levels can''t be negative.' using errcode = '22023';
  end if;
  delete from public.store_item_prices sp
  where sp.item_id = p_item
    and not exists (select 1 from jsonb_array_elements(p_settings) e
                    where (e->>'store_id')::uuid = sp.store_id and nullif(e->>'selling_price', '') is not null);
  insert into public.store_item_prices (tenant_id, store_id, item_id, selling_price)
  select v_tenant_id, (e->>'store_id')::uuid, p_item, (e->>'selling_price')::numeric
  from jsonb_array_elements(p_settings) e
  where nullif(e->>'selling_price', '') is not null
  on conflict (store_id, item_id) do update set selling_price = excluded.selling_price, updated_at = now();

  insert into public.stock_levels (tenant_id, item_id, store_id)
  select v_tenant_id, p_item, (e->>'store_id')::uuid
  from jsonb_array_elements(p_settings) e
  where nullif(e->>'low_stock_threshold', '') is not null
  on conflict do nothing;
  update public.stock_levels l
  set low_stock_threshold = (select nullif(e->>'low_stock_threshold', '')::numeric
                             from jsonb_array_elements(p_settings) e where (e->>'store_id')::uuid = l.store_id limit 1)
  where l.item_id = p_item;
end;
$$;
revoke all on function private.set_item_stock(uuid, uuid, numeric, text) from public, anon;
revoke all on function private.set_item_store_settings(uuid, jsonb) from public, anon;
grant execute on function private.set_item_stock(uuid, uuid, numeric, text) to authenticated;
grant execute on function private.set_item_store_settings(uuid, jsonb) to authenticated;

create function public.save_inventory_item(
  p_sku text, p_name text, p_category_id uuid, p_cost_price numeric, p_selling_price numeric,
  p_quantity_on_hand numeric, p_low_stock_threshold numeric, p_is_universal boolean,
  p_item_id uuid default null, p_description text default null, p_vehicle_ids integer[] default '{}',
  p_price_includes_tax boolean default true, p_vendor_name text default null, p_attributes jsonb default '{}',
  p_base_uom_id uuid default null, p_purchase_uom_id uuid default null, p_sale_uom_id uuid default null,
  p_conversions jsonb default null, p_store_id uuid default null, p_store_settings jsonb default null
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
begin
  if v_tenant_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  v_fitment := private.tenant_has_module(v_tenant_id, 'vehicle_fitment');

  if v_fitment and not p_is_universal and coalesce(cardinality(p_vehicle_ids), 0) = 0 then
    raise exception 'Vehicle-specific items need at least one vehicle.' using errcode = '22023';
  end if;
  if p_conversions is not null and jsonb_typeof(p_conversions) <> 'array' then
    raise exception 'Unit conversions must be a list.' using errcode = '22023';
  end if;
  if p_store_settings is not null and (jsonb_typeof(p_store_settings) <> 'array' or not private.is_shop_admin()) then
    raise exception 'Only admins can set store prices and store low-stock levels.' using errcode = '42501';
  end if;
  -- The stock entered is the current store's (the app passes it); null leaves stock alone.
  if p_quantity_on_hand is not null then
    v_store := coalesce(p_store_id, private.default_store_id());
    if v_store is null or not private.can_work_in_store(v_store) then
      raise exception 'You can''t change stock in that store.' using errcode = '42501';
    end if;
    if p_quantity_on_hand < 0 then
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
      base_uom_id, purchase_uom_id, sale_uom_id
    )
    values (
      v_tenant_id, p_sku, p_name, p_description, p_category_id, p_cost_price, p_selling_price,
      p_low_stock_threshold, p_is_universal or not v_fitment, p_price_includes_tax,
      nullif(btrim(p_vendor_name), ''), coalesce(p_attributes, '{}'),
      v_base, nullif(p_purchase_uom_id, v_base), nullif(p_sale_uom_id, v_base)
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
        purchase_uom_id = nullif(p_purchase_uom_id, v_base),
        sale_uom_id = nullif(p_sale_uom_id, v_base),
        updated_at = now()
    where id = p_item_id and tenant_id = v_tenant_id
    returning id into v_item_id;

    if v_item_id is null then
      raise exception 'Inventory item not found.' using errcode = 'P0002';
    end if;

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

  if p_conversions is not null then
    -- Conversions removed from the list go (clearing them as purchase / sale unit is done by the trigger,
    -- after which the values just saved are put back if they still point at a kept conversion).
    delete from public.item_uom_conversions c
    where c.item_id = v_item_id
      and not exists (select 1 from jsonb_array_elements(p_conversions) e where (e->>'uom_id')::uuid = c.uom_id);
    insert into public.item_uom_conversions (tenant_id, item_id, uom_id, factor, selling_price, barcode, sort_order)
    select v_tenant_id, v_item_id, (e->>'uom_id')::uuid, (e->>'factor')::numeric,
           nullif(e->>'selling_price', '')::numeric, nullif(btrim(e->>'barcode'), ''), ord::integer
    from jsonb_array_elements(p_conversions) with ordinality as x(e, ord)
    on conflict (item_id, uom_id) do update
      set factor = excluded.factor, selling_price = excluded.selling_price,
          barcode = excluded.barcode, sort_order = excluded.sort_order;
    update public.inventory_items
    set purchase_uom_id = nullif(p_purchase_uom_id, v_base), sale_uom_id = nullif(p_sale_uom_id, v_base)
    where id = v_item_id;
  end if;

  -- Stock at the current store: opening stock for a new product, else an adjustment to the figure entered.
  if p_quantity_on_hand is not null then
    perform private.set_item_stock(v_item_id, v_store, p_quantity_on_hand, case when p_item_id is null then 'opening' else 'adjustment' end);
  end if;

  -- RF-20.1 store prices and per-store low-stock levels (admins): the list replaces what was set.
  if p_store_settings is not null then
    perform private.set_item_store_settings(v_item_id, p_store_settings);
  end if;

  return v_item_id;
end;
$$
;

revoke all on function public.save_quote(uuid, jsonb, uuid, text, integer, text, text, numeric, text, text, text, text, date, uuid) from public, anon;
grant execute on function public.save_quote(uuid, jsonb, uuid, text, integer, text, text, numeric, text, text, text, text, date, uuid) to authenticated;
revoke all on function public.next_document_number(text, uuid) from public, anon;
grant execute on function public.next_document_number(text, uuid) to authenticated;
revoke all on function public.save_inventory_item(text, text, uuid, numeric, numeric, numeric, numeric, boolean, uuid, text, integer[], boolean, text, jsonb, uuid, uuid, uuid, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.save_inventory_item(text, text, uuid, numeric, numeric, numeric, numeric, boolean, uuid, text, integer[], boolean, text, jsonb, uuid, uuid, uuid, jsonb, uuid, jsonb) to authenticated;

-- The console's Products tab (service role): set a product's stock at one store.
create function public.admin_set_store_stock(p_tenant uuid, p_item uuid, p_store uuid, p_on_hand numeric)
returns public.stock_levels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current numeric;
  v_level public.stock_levels;
begin
  if not exists (select 1 from public.inventory_items i where i.id = p_item and i.tenant_id = p_tenant)
     or not exists (select 1 from public.stores s where s.id = p_store and s.tenant_id = p_tenant) then
    raise exception 'That product or store isn''t in this organization.' using errcode = '23503';
  end if;
  if p_on_hand is null or p_on_hand < 0 then
    raise exception 'Stock can''t be negative.' using errcode = '22023';
  end if;
  select coalesce((select l.on_hand from public.stock_levels l where l.item_id = p_item and l.store_id = p_store), 0) into v_current;
  v_level := private.apply_stock(p_item, p_store, p_on_hand - v_current, 0, 'adjustment', null, 'Set in the ProductLogik console');
  return v_level;
end;
$$;
revoke all on function public.admin_set_store_stock(uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.admin_set_store_stock(uuid, uuid, uuid, numeric) to service_role;

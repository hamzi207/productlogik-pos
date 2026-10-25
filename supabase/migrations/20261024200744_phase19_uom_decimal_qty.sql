-- Phase 19 (1/3): units of measure, decimal quantities, purchase / sale units (RF-19.1).
--
-- * uom_presets: the platform's names and decimals for unit codes (industries.default_uoms holds codes).
-- * units_of_measure: each organization's own units, seeded from its industry; org admins add / edit them.
-- * inventory_items.base_uom_id (stock is counted in it), purchase_uom_id / sale_uom_id (RF-19.1).
-- * item_uom_conversions: 1 <unit> = <factor> base units, with an optional own price and barcode.
-- * Quantities become numeric(14,3); document lines remember the unit, its label and factor, and stock
--   moves in base units (quantity × factor).

-- ---------------------------------------------------------------------------------------------------
-- Platform unit presets
-- ---------------------------------------------------------------------------------------------------
create table public.uom_presets (
  code text primary key check (char_length(code) between 1 and 12),
  name text not null check (char_length(name) between 1 and 40),
  decimals smallint not null default 0 check (decimals between 0 and 3),
  sort_order integer not null default 0
);
alter table public.uom_presets enable row level security;
create policy "Anyone signed in reads unit presets" on public.uom_presets for select to authenticated using (true);
grant select on public.uom_presets to authenticated;

insert into public.uom_presets (code, name, decimals, sort_order) values
  ('pcs', 'Pieces', 0, 10), ('pack', 'Pack', 0, 20), ('box', 'Box', 0, 30), ('carton', 'Carton', 0, 40),
  ('dozen', 'Dozen', 0, 50), ('set', 'Set', 0, 60), ('pair', 'Pair', 0, 70), ('suit', 'Suit', 0, 80),
  ('kg', 'Kilogram', 3, 100), ('g', 'Gram', 0, 110), ('l', 'Litre', 3, 120), ('ml', 'Millilitre', 0, 130),
  ('m', 'Metre', 2, 140), ('cm', 'Centimetre', 0, 150), ('ft', 'Foot', 2, 160), ('yd', 'Yard', 2, 170),
  ('sqft', 'Square foot', 2, 180), ('than', 'Than', 0, 190), ('strip', 'Strip', 0, 200), ('tablet', 'Tablet', 0, 210),
  ('bottle', 'Bottle', 0, 220), ('bag', 'Bag', 0, 230), ('coil', 'Coil', 0, 240), ('ream', 'Ream', 0, 250);

-- ---------------------------------------------------------------------------------------------------
-- Organization units
-- ---------------------------------------------------------------------------------------------------
create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 12),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  decimals smallint not null default 0 check (decimals between 0 and 3),
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index units_of_measure_code_key on public.units_of_measure (tenant_id, lower(code));
alter table public.units_of_measure enable row level security;
create policy "Members read their units" on public.units_of_measure for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Admins add units" on public.units_of_measure for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.is_shop_admin()));
create policy "Admins edit units" on public.units_of_measure for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_shop_admin()))
  with check (tenant_id = (select private.current_tenant_id()));
create policy "Admins delete units" on public.units_of_measure for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_shop_admin()));
grant select, insert, update, delete on public.units_of_measure to authenticated;

-- Seeds an organization's units from its industry (always including pcs). Never removes anything, so it
-- also runs when the superadmin changes the industry. Phase 19 (2/3) adds customer types here.
create function private.seed_tenant_lists(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.units_of_measure (tenant_id, code, name, decimals, sort_order)
  select p_tenant, c.code, coalesce(p.name, c.code), coalesce(p.decimals, 0), coalesce(p.sort_order, 1000 + c.ord::integer)
  from public.tenants t
  join public.industries ind on ind.id = t.industry_id
  cross join lateral unnest(array['pcs'] || ind.default_uoms) with ordinality as c(code, ord)
  left join public.uom_presets p on p.code = lower(c.code)
  where t.id = p_tenant
  on conflict (tenant_id, lower(code)) do nothing;
end;
$$;
revoke all on function private.seed_tenant_lists(uuid) from public, anon, authenticated;

select private.seed_tenant_lists(id) from public.tenants;

-- New organizations get their lists before the walk-in customer is created (same AFTER INSERT trigger).
create or replace function public.create_walk_in_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_tenant_lists(new.id);
  insert into public.customers (tenant_id, name, customer_type, is_walk_in)
  values (new.id, 'Walk-in / Cash Customer', 'Retail Customer', true);
  return new;
end;
$$;

create function private.tenants_seed_lists_on_industry_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_tenant_lists(new.id);
  return null;
end;
$$;
revoke all on function private.tenants_seed_lists_on_industry_change() from public, anon, authenticated;
create trigger tenants_seed_lists_on_industry_change after update of industry_id on public.tenants
  for each row when (old.industry_id is distinct from new.industry_id)
  execute function private.tenants_seed_lists_on_industry_change();

-- ---------------------------------------------------------------------------------------------------
-- Items: base / purchase / sale unit and conversions
-- ---------------------------------------------------------------------------------------------------
alter table public.inventory_items
  add constraint inventory_items_tenant_id_id_key unique (tenant_id, id),
  add column base_uom_id uuid,
  add column purchase_uom_id uuid,
  add column sale_uom_id uuid;

update public.inventory_items i
set base_uom_id = u.id
from public.units_of_measure u
where u.tenant_id = i.tenant_id and lower(u.code) = 'pcs';

alter table public.inventory_items
  alter column base_uom_id set not null,
  add constraint inventory_items_base_uom_fkey foreign key (tenant_id, base_uom_id) references public.units_of_measure (tenant_id, id),
  add constraint inventory_items_purchase_uom_fkey foreign key (tenant_id, purchase_uom_id) references public.units_of_measure (tenant_id, id),
  add constraint inventory_items_sale_uom_fkey foreign key (tenant_id, sale_uom_id) references public.units_of_measure (tenant_id, id);
create index inventory_items_base_uom_idx on public.inventory_items (base_uom_id);

create table public.item_uom_conversions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid not null,
  uom_id uuid not null,
  factor numeric(18,6) not null check (factor > 0),
  selling_price numeric(12,2) check (selling_price >= 0),
  barcode text check (barcode is null or char_length(btrim(barcode)) between 1 and 64),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (item_id, uom_id),
  foreign key (tenant_id, item_id) references public.inventory_items (tenant_id, id) on delete cascade,
  foreign key (tenant_id, uom_id) references public.units_of_measure (tenant_id, id)
);
create index item_uom_conversions_uom_idx on public.item_uom_conversions (uom_id);
create unique index item_uom_conversions_barcode_key on public.item_uom_conversions (tenant_id, barcode) where barcode is not null;
alter table public.item_uom_conversions enable row level security;
create policy "Members read conversions" on public.item_uom_conversions for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Members add conversions" on public.item_uom_conversions for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()));
create policy "Members edit conversions" on public.item_uom_conversions for update to authenticated
  using (tenant_id = (select private.current_tenant_id())) with check (tenant_id = (select private.current_tenant_id()));
create policy "Members delete conversions" on public.item_uom_conversions for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()));
grant select, insert, update, delete on public.item_uom_conversions to authenticated;

-- A conversion can't be the item's own base unit.
create function private.check_item_conversion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.inventory_items i where i.id = new.item_id and i.base_uom_id = new.uom_id) then
    raise exception 'A unit conversion can''t use the product''s base unit.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger item_uom_conversions_check before insert or update of uom_id, item_id on public.item_uom_conversions
  for each row execute function private.check_item_conversion();

-- Removing a conversion clears it as the item's purchase / sale unit (they fall back to the base unit).
create function private.conversion_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory_items
  set purchase_uom_id = case when purchase_uom_id = old.uom_id then null else purchase_uom_id end,
      sale_uom_id = case when sale_uom_id = old.uom_id then null else sale_uom_id end
  where id = old.item_id and old.uom_id in (purchase_uom_id, sale_uom_id);
  return old;
end;
$$;
revoke all on function private.conversion_removed() from public, anon, authenticated;
create trigger item_uom_conversions_removed after delete on public.item_uom_conversions
  for each row execute function private.conversion_removed();

-- Purchase / sale unit must be the base unit or one of the item's conversions. Checked at commit so a
-- save can write the item and its conversions in any order.
create function private.check_item_units()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item public.inventory_items;
begin
  select * into v_item from public.inventory_items where id = new.id;
  if not found then
    return null;
  end if;
  if v_item.purchase_uom_id is not null and v_item.purchase_uom_id <> v_item.base_uom_id
     and not exists (select 1 from public.item_uom_conversions c where c.item_id = v_item.id and c.uom_id = v_item.purchase_uom_id) then
    raise exception 'The purchase unit must be the base unit or one of the product''s unit conversions.' using errcode = '23514';
  end if;
  if v_item.sale_uom_id is not null and v_item.sale_uom_id <> v_item.base_uom_id
     and not exists (select 1 from public.item_uom_conversions c where c.item_id = v_item.id and c.uom_id = v_item.sale_uom_id) then
    raise exception 'The sale unit must be the base unit or one of the product''s unit conversions.' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger inventory_items_check_units after insert or update of base_uom_id, purchase_uom_id, sale_uom_id
  on public.inventory_items deferrable initially deferred
  for each row execute function private.check_item_units();

-- ---------------------------------------------------------------------------------------------------
-- Decimal quantities
-- ---------------------------------------------------------------------------------------------------
alter table public.inventory_items drop column available_quantity, drop column is_low_stock;
alter table public.inventory_items
  alter column quantity_on_hand type numeric(14,3),
  alter column reserved_quantity type numeric(14,3),
  alter column low_stock_threshold type numeric(14,3);
alter table public.inventory_items
  add column available_quantity numeric(14,3) generated always as (quantity_on_hand - reserved_quantity) stored,
  add column is_low_stock boolean generated always as ((quantity_on_hand - reserved_quantity) <= low_stock_threshold) stored;

alter table public.quote_items drop constraint quote_items_whole_part_quantity_check;
alter table public.quote_items
  alter column quantity type numeric(14,3),
  alter column reserved_qty type numeric(14,3),
  alter column deducted_qty type numeric(14,3),
  add column uom_id uuid references public.units_of_measure (id) on delete set null,
  add column uom_label text check (uom_label is null or char_length(uom_label) between 1 and 12),
  add column uom_factor numeric(18,6) not null default 1 check (uom_factor > 0);
create index quote_items_uom_idx on public.quote_items (uom_id);
alter table public.invoice_payment_items alter column quantity type numeric(14,3);

-- Existing lines were sold in pieces.
update public.quote_items qi
set uom_id = i.base_uom_id, uom_label = u.code
from public.inventory_items i
join public.units_of_measure u on u.id = i.base_uom_id
where qi.item_id = i.id;

-- Stock and the low-stock level can't have more decimals than the base unit allows; the base unit can't
-- change once the item is on a document (its history would be read in the wrong unit).
create function private.check_item_quantities()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_decimals smallint;
begin
  if tg_op = 'UPDATE' and new.base_uom_id is distinct from old.base_uom_id
     and exists (select 1 from public.quote_items qi where qi.item_id = new.id) then
    raise exception 'This product is already on documents, so its base unit can''t change.' using errcode = '23514';
  end if;
  select decimals into v_decimals from public.units_of_measure where id = new.base_uom_id;
  if new.quantity_on_hand <> round(new.quantity_on_hand, coalesce(v_decimals, 3))
     or new.low_stock_threshold <> round(new.low_stock_threshold, coalesce(v_decimals, 3)) then
    raise exception 'Use at most % decimal places for this unit.', coalesce(v_decimals, 3) using errcode = '22023';
  end if;
  if new.low_stock_threshold < 0 then
    raise exception 'The low-stock level can''t be negative.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger inventory_items_check_quantities before insert or update of quantity_on_hand, low_stock_threshold, base_uom_id
  on public.inventory_items for each row execute function private.check_item_quantities();

-- Stock follows document lines in base units (quantity × the unit's factor).
create or replace function public.quote_items_sync_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_base numeric;
  v_reserve numeric := 0;
  v_deduct numeric := 0;
  v_item record;
  v_available numeric;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.item_id is not null and (old.reserved_qty > 0 or old.deducted_qty > 0) then
    update public.inventory_items
    set reserved_quantity = reserved_quantity - old.reserved_qty,
        quantity_on_hand = quantity_on_hand + old.deducted_qty
    where id = old.item_id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  new.reserved_qty := 0;
  new.deducted_qty := 0;
  if new.item_id is null or new.is_labor then
    return new;
  end if;

  v_base := round(new.quantity * new.uom_factor, 3);
  select status into v_status from public.quotes where id = new.quote_id;
  if v_status in ('sent', 'accepted') then
    v_reserve := v_base;
  elsif v_status in ('invoiced', 'paid') then
    v_deduct := v_base;
  else
    return new;
  end if;

  select i.name, i.quantity_on_hand, i.reserved_quantity, u.code as unit into v_item
  from public.inventory_items i left join public.units_of_measure u on u.id = i.base_uom_id
  where i.id = new.item_id for update of i;
  if not found then
    return new;
  end if;

  v_available := v_item.quantity_on_hand - v_item.reserved_quantity;
  if v_reserve + v_deduct > v_available then
    raise exception 'Not enough stock for %: % % available (% on hand, % reserved on quotations).',
      v_item.name, trim_scale(greatest(v_available, 0)), coalesce(v_item.unit, ''),
      trim_scale(v_item.quantity_on_hand), trim_scale(v_item.reserved_quantity)
      using errcode = '23514';
  end if;

  update public.inventory_items
  set reserved_quantity = reserved_quantity + v_reserve,
      quantity_on_hand = quantity_on_hand - v_deduct
  where id = new.item_id;

  new.reserved_qty := v_reserve;
  new.deducted_qty := v_deduct;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- save_inventory_item: numeric quantities, units and conversions
-- ---------------------------------------------------------------------------------------------------
drop function public.save_inventory_item(text, text, uuid, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean, text, jsonb);

-- p_conversions: null keeps the item's conversions as they are; an array replaces them
-- ([{uom_id, factor, selling_price?, barcode?}]). p_base_uom_id null = the organization's pcs.
create function public.save_inventory_item(
  p_sku text, p_name text, p_category_id uuid, p_cost_price numeric, p_selling_price numeric,
  p_quantity_on_hand numeric, p_low_stock_threshold numeric, p_is_universal boolean,
  p_item_id uuid default null, p_description text default null, p_vehicle_ids integer[] default '{}',
  p_price_includes_tax boolean default true, p_vendor_name text default null, p_attributes jsonb default '{}',
  p_base_uom_id uuid default null, p_purchase_uom_id uuid default null, p_sale_uom_id uuid default null,
  p_conversions jsonb default null
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
      quantity_on_hand, low_stock_threshold, is_universal, price_includes_tax, vendor_name, attributes,
      base_uom_id, purchase_uom_id, sale_uom_id
    )
    values (
      v_tenant_id, p_sku, p_name, p_description, p_category_id, p_cost_price, p_selling_price,
      p_quantity_on_hand, p_low_stock_threshold, p_is_universal or not v_fitment, p_price_includes_tax,
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
        quantity_on_hand = p_quantity_on_hand,
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

  return v_item_id;
end;
$$;
revoke all on function public.save_inventory_item(text, text, uuid, numeric, numeric, numeric, numeric, boolean, uuid, text, integer[], boolean, text, jsonb, uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_inventory_item(text, text, uuid, numeric, numeric, numeric, numeric, boolean, uuid, text, integer[], boolean, text, jsonb, uuid, uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- save_quote: lines carry a unit (p_items[].uom_id); stock lines may be decimal within the unit's decimals
-- ---------------------------------------------------------------------------------------------------
create or replace function public.save_quote(p_customer_id uuid, p_items jsonb, p_quote_id uuid default null::uuid, p_stage text default 'draft'::text, p_vehicle_id integer default null::integer, p_custom_vehicle_notes text default null::text, p_discount_type text default 'amount'::text, p_discount_value numeric default 0, p_notes text default null::text, p_discount_reason text default null::text, p_walk_in_name text default null::text, p_walk_in_phone text default null::text, p_due_date date default null::date)
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
  elsif p_stage is null or p_stage not in ('draft', 'quotation', 'invoice') then
    raise exception 'Unknown document type.' using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.save_quote_lines (
    item_id uuid, description text, is_labor boolean, quantity numeric, unit_price numeric,
    discount_type text, discount_value numeric, unit_discount numeric, sale_price numeric,
    gross numeric, net numeric, unit_cost numeric, price_includes_tax boolean, sort_order integer,
    requested_uom uuid, uom_id uuid, uom_label text, uom_factor numeric, uom_decimals smallint, base_decimals smallint
  ) on commit drop;
  truncate pg_temp.save_quote_lines;

  -- Stock lines are priced from the catalogue: the base price, or the conversion's own price
  -- (else base price × factor) when sold in another unit. Cost follows the same factor.
  insert into pg_temp.save_quote_lines (
    item_id, description, is_labor, quantity, unit_price, discount_type, discount_value,
    unit_cost, price_includes_tax, sort_order,
    requested_uom, uom_id, uom_label, uom_factor, uom_decimals, base_decimals
  )
  select
    s.item_id,
    btrim(coalesce(l.description, '')),
    coalesce(l.is_labor, false),
    l.quantity,
    case when s.item_id is not null then coalesce(c.selling_price, round(i.selling_price * coalesce(c.factor, 1), 2)) else l.unit_price end,
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
    case when s.item_id is null then 3 else bu.decimals end
  from rows from (
    jsonb_to_recordset(p_items) as (
      item_id uuid, description text, is_labor boolean, quantity numeric, unit_price numeric,
      discount_type text, discount_value numeric, uom_id uuid
    )
  ) with ordinality as l(item_id, description, is_labor, quantity, unit_price, discount_type, discount_value, uom_id, ord)
  cross join lateral (select case when coalesce(l.is_labor, false) then null else l.item_id end as item_id) s
  left join public.inventory_items i on i.id = s.item_id
  left join public.units_of_measure bu on bu.id = i.base_uom_id
  left join public.item_uom_conversions c on c.item_id = i.id and c.uom_id = l.uom_id and l.uom_id <> i.base_uom_id
  left join public.units_of_measure cu on cu.id = c.uom_id;

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
      tenant_id, customer_id, vehicle_id, custom_vehicle_notes, status,
      draft_number, quotation_number, invoice_number, quoted_at, invoiced_at, valid_until, due_date,
      subtotal, tax_rate, tax_amount, discount_type, discount_value, discount_amount, discount_reason,
      total_amount, notes, walk_in_name, walk_in_phone, created_by
    )
    values (
      v_tenant_id, p_customer_id, p_vehicle_id, nullif(btrim(p_custom_vehicle_notes), ''),
      case p_stage when 'draft' then 'draft' when 'quotation' then 'sent' else 'invoiced' end,
      case when p_stage = 'draft' then public.next_document_number('D') end,
      case when p_stage = 'quotation' then public.next_document_number('Q') end,
      case when p_stage = 'invoice' then public.next_document_number('INV') end,
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
    uom_id, uom_label, uom_factor
  )
  select v_tenant_id, v_quote.id, item_id, description, is_labor, quantity, unit_cost, unit_price,
         discount_type, discount_value, gross - net, sale_price, net, price_includes_tax, sort_order,
         uom_id, uom_label, uom_factor
  from pg_temp.save_quote_lines;

  return v_quote;
end;
$function$;

-- Phase 19 (3/3): default customer type switch, clearer unit messages, units in alerts, and the report's
-- customer-tag filter (RF-19.2) with product quantities in base units.

-- ---------------------------------------------------------------------------------------------------
-- Default customer type: changed only through set_default_customer_type (clears the old one and sets the
-- new one together), so "exactly one default" holds without a deadlock between the two rules.
-- ---------------------------------------------------------------------------------------------------
revoke update on public.customer_types from authenticated;
grant update (name, requires_tax_details, is_archived, sort_order) on public.customer_types to authenticated;

create or replace function private.check_customer_type_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default and new.is_archived then
    raise exception 'The default customer type can''t be archived.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Org admins for their own organization; the service role (superadmin console) for any.
create function public.set_default_customer_type(p_type_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.customer_types;
begin
  select * into v_type from public.customer_types where id = p_type_id;
  if not found then
    raise exception 'Customer type not found.' using errcode = 'P0002';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and not (v_type.tenant_id = private.current_tenant_id() and private.is_shop_admin()) then
    raise exception 'Only organization admins can change the default customer type.' using errcode = '42501';
  end if;
  if v_type.is_archived then
    raise exception 'Restore this type before making it the default.' using errcode = '23514';
  end if;
  update public.customer_types set is_default = false where tenant_id = v_type.tenant_id and is_default and id <> p_type_id;
  update public.customer_types set is_default = true where id = p_type_id;
end;
$$;
revoke all on function public.set_default_customer_type(uuid) from public, anon;
grant execute on function public.set_default_customer_type(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- Unit messages: "pcs is counted in whole numbers" instead of "at most 0 decimal places"
-- ---------------------------------------------------------------------------------------------------
create or replace function private.check_item_quantities()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unit public.units_of_measure;
begin
  if tg_op = 'UPDATE' and new.base_uom_id is distinct from old.base_uom_id
     and exists (select 1 from public.quote_items qi where qi.item_id = new.id) then
    raise exception 'This product is already on documents, so its base unit can''t change.' using errcode = '23514';
  end if;
  select * into v_unit from public.units_of_measure where id = new.base_uom_id;
  if new.quantity_on_hand <> round(new.quantity_on_hand, coalesce(v_unit.decimals, 3))
     or new.low_stock_threshold <> round(new.low_stock_threshold, coalesce(v_unit.decimals, 3)) then
    if coalesce(v_unit.decimals, 3) = 0 then
      raise exception '% is counted in whole numbers.', v_unit.code using errcode = '22023';
    end if;
    raise exception '% allows at most % decimal places.', v_unit.code, v_unit.decimals using errcode = '22023';
  end if;
  if new.low_stock_threshold < 0 then
    raise exception 'The low-stock level can''t be negative.' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Bell / low-stock alerts carry the base unit
-- ---------------------------------------------------------------------------------------------------
create or replace function public.shop_alerts()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with shop as (
    select timezone as tz, (now() at time zone timezone)::date as today
    from public.tenants where id = public.current_tenant_id()
  ),
  docs as (
    select q.id, q.quote_number, q.status, q.total_amount - q.amount_paid as balance, q.total_amount,
           q.due_date, (q.valid_until at time zone s.tz)::date as valid_day, s.today,
           case when c.is_walk_in then coalesce(nullif(q.walk_in_name, ''), 'Walk-in customer') else c.name end as customer
    from public.quotes q
    join public.customers c on c.id = q.customer_id
    cross join shop s
    where q.status in ('invoiced', 'sent', 'accepted')
  )
  select jsonb_build_object(
    'lowStock', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'sku', i.sku,
                    'free', i.quantity_on_hand - i.reserved_quantity, 'threshold', i.low_stock_threshold, 'unit', i.unit)
                    order by i.quantity_on_hand - i.reserved_quantity, i.name), '[]'::jsonb)
                 from (select it.*, u.code as unit from public.inventory_items it
                       left join public.units_of_measure u on u.id = it.base_uom_id
                       where it.quantity_on_hand - it.reserved_quantity <= it.low_stock_threshold
                       order by it.quantity_on_hand - it.reserved_quantity, it.name limit 25) i),
    'overdue', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', quote_number, 'customer', customer,
                   'balance', balance, 'days', today - due_date) order by due_date), '[]'::jsonb)
                from (select * from docs where status = 'invoiced' and due_date < today order by due_date limit 25) d),
    'dueSoon', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', quote_number, 'customer', customer,
                   'balance', balance, 'days', due_date - today) order by due_date), '[]'::jsonb)
                from (select * from docs where status = 'invoiced' and due_date between today and today + 3 order by due_date limit 25) d),
    'expiring', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', quote_number, 'customer', customer,
                    'total', total_amount, 'days', valid_day - today) order by valid_day), '[]'::jsonb)
                 from (select * from docs where status in ('sent', 'accepted') and valid_day between today and today + 3 order by valid_day limit 25) d),
    'expired', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', quote_number, 'customer', customer,
                   'total', total_amount, 'days', today - valid_day) order by valid_day), '[]'::jsonb)
                from (select * from docs where status in ('sent', 'accepted') and valid_day < today order by valid_day limit 25) d)
  );
$$;

-- ---------------------------------------------------------------------------------------------------
-- Reports: optional customer tag (invoices, payments and receivables of tagged customers only);
-- product quantities are summed in each product's base unit.
-- ---------------------------------------------------------------------------------------------------
drop function public.report_data(text, date, date);

create function public.report_data(p_range text default 'month', p_from date default null, p_to date default null, p_tag uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with shop as (
    select timezone as tz, (now() at time zone timezone)::date as today, week_start
    from public.tenants where id = public.current_tenant_id()
  ),
  tagged as (
    select customer_id from public.customer_tag_links where tag_id = p_tag
  ),
  span as (
    select s.tz, s.today,
      case p_range
        when 'today' then s.today
        when 'week' then s.today - ((extract(isodow from s.today)::int - s.week_start + 7) % 7)
        when 'year' then date_trunc('year', s.today::timestamp)::date
        when 'all' then coalesce(
          (select min((coalesce(q.invoiced_at, q.quoted_at) at time zone s.tz)::date)
           from public.quotes q where coalesce(q.invoiced_at, q.quoted_at) is not null),
          s.today)
        when 'custom' then coalesce(least(p_from, p_to), p_from, p_to, s.today)
        else date_trunc('month', s.today::timestamp)::date
      end as d_from,
      case p_range
        when 'custom' then coalesce(greatest(p_from, p_to), p_to, p_from, s.today)
        else s.today
      end as d_to
    from shop s
  ),
  bounds as (
    select tz, today, d_from, d_to,
      d_from::timestamp at time zone tz as t_from,
      (d_to + 1)::timestamp at time zone tz as t_to,
      case when d_to - d_from <= 31 then 'day' when d_to - d_from <= 731 then 'month' else 'year' end as grain
    from span
  ),
  inv as (
    select q.id, q.customer_id, q.walk_in_name, q.total_amount, q.tax_amount, q.amount_paid,
           (q.invoiced_at at time zone b.tz)::date as local_day
    from public.quotes q, bounds b
    where q.status in ('invoiced', 'paid') and q.invoiced_at >= b.t_from and q.invoiced_at < b.t_to
      and (p_tag is null or q.customer_id in (select customer_id from tagged))
  ),
  lines as (
    -- Each line's net revenue = its share of the invoice total excluding tax (so invoice discounts count).
    select i.item_id, i.description, i.quantity * i.uom_factor as base_qty, i.unit_cost * i.quantity as cost,
           case when sum(i.total_price) over (partition by i.quote_id) > 0
                then i.total_price / sum(i.total_price) over (partition by i.quote_id) * (v.total_amount - v.tax_amount)
                else 0 end as revenue
    from public.quote_items i join inv v on v.id = i.quote_id
  ),
  buckets as (
    select g::date as b_start, (g + ('1 ' || b.grain)::interval)::date as b_end
    from bounds b, generate_series(date_trunc(b.grain, b.d_from::timestamp), b.d_to::timestamp, ('1 ' || b.grain)::interval) as g
  ),
  pay as (
    select p.payment_method, p.amount
    from public.invoice_payments p
    join public.quotes q on q.id = p.quote_id, bounds b
    where p.paid_on between b.d_from and b.d_to
      and (p_tag is null or q.customer_id in (select customer_id from tagged))
  ),
  open_inv as (
    select q.total_amount - q.amount_paid as balance, q.due_date, b.today
    from public.quotes q, bounds b
    where q.status = 'invoiced' and (p_tag is null or q.customer_id in (select customer_id from tagged))
  )
  select jsonb_build_object(
    'from', b.d_from, 'to', b.d_to, 'grain', b.grain,
    'summary', jsonb_build_object(
      'sales', (select coalesce(sum(total_amount), 0) from inv),
      'tax', (select coalesce(sum(tax_amount), 0) from inv),
      'cost', (select coalesce(sum(cost), 0) from lines),
      'invoices', (select count(*) from inv),
      'outstanding', (select coalesce(sum(total_amount - amount_paid), 0) from inv),
      'collected', (select coalesce(sum(amount), 0) from pay)),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('start', k.b_start,
        'sales', coalesce((select sum(v.total_amount) from inv v where v.local_day >= k.b_start and v.local_day < k.b_end), 0))
        order by k.b_start), '[]'::jsonb) from buckets k),
    'products', (select coalesce(jsonb_agg(p order by (p->>'revenue')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('name', max(l.description), 'sku', max(it.sku), 'custom', l.item_id is null,
                 'qty', round(sum(l.base_qty), 3), 'unit', max(u.code),
                 'revenue', round(sum(l.revenue), 2), 'profit', round(sum(l.revenue - l.cost), 2)) as p
        from lines l
        left join public.inventory_items it on it.id = l.item_id
        left join public.units_of_measure u on u.id = it.base_uom_id
        group by l.item_id, case when l.item_id is null then l.description end
        order by sum(l.revenue) desc limit 50) t),
    'customers', (select coalesce(jsonb_agg(c order by (c->>'sales')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('id', cu.id, 'name', case when cu.is_walk_in then 'Walk-in / cash sales' else cu.name end,
                 'invoices', count(*), 'sales', sum(v.total_amount), 'outstanding', sum(v.total_amount - v.amount_paid)) as c
        from inv v join public.customers cu on cu.id = v.customer_id
        group by cu.id, cu.name, cu.is_walk_in
        order by sum(v.total_amount) desc limit 50) t),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'count', n, 'amount', total) order by total desc), '[]'::jsonb)
                 from (select payment_method, count(*) as n, sum(amount) as total from pay group by payment_method) t),
    'aging', (select jsonb_build_object(
        'notDue', jsonb_build_object('count', count(*) filter (where due_date is null or due_date >= today), 'total', coalesce(sum(balance) filter (where due_date is null or due_date >= today), 0)),
        'd30', jsonb_build_object('count', count(*) filter (where due_date < today and due_date >= today - 30), 'total', coalesce(sum(balance) filter (where due_date < today and due_date >= today - 30), 0)),
        'd60', jsonb_build_object('count', count(*) filter (where due_date < today - 30 and due_date >= today - 60), 'total', coalesce(sum(balance) filter (where due_date < today - 30 and due_date >= today - 60), 0)),
        'd60plus', jsonb_build_object('count', count(*) filter (where due_date < today - 60), 'total', coalesce(sum(balance) filter (where due_date < today - 60), 0)))
      from open_inv),
    'stock', (select jsonb_build_object(
        'items', count(*),
        'units', coalesce(sum(quantity_on_hand), 0),
        'reserved', coalesce(sum(reserved_quantity), 0),
        'costValue', coalesce(sum(quantity_on_hand * cost_price), 0),
        'retailValue', coalesce(sum(quantity_on_hand * selling_price), 0),
        'low', coalesce(jsonb_agg(jsonb_build_object('name', it.name, 'sku', it.sku, 'free', it.quantity_on_hand - it.reserved_quantity,
                   'threshold', it.low_stock_threshold, 'unit', u.code)
                 order by it.quantity_on_hand - it.reserved_quantity) filter (where it.quantity_on_hand - it.reserved_quantity <= it.low_stock_threshold), '[]'::jsonb))
      from public.inventory_items it left join public.units_of_measure u on u.id = it.base_uom_id)
  )
  from bounds b;
$$;

revoke all on function public.report_data(text, date, date, uuid) from public, anon;
grant execute on function public.report_data(text, date, date, uuid) to authenticated;

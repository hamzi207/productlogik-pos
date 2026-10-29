-- Phase 21: dashboard, reports and alerts leave kits (their components have the stock) and archived
-- variants out of stock figures and the product count. Otherwise as in Phase 20 (store filters).

create or replace function public.dashboard_metrics(p_range text default 'month', p_from date default null, p_to date default null, p_store_id uuid default null)
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
  span as (
    select s.tz, s.today,
      case p_range
        when 'today' then s.today
        when 'week' then s.today - ((extract(isodow from s.today)::int - s.week_start + 7) % 7)
        when 'year' then date_trunc('year', s.today::timestamp)::date
        when 'all' then coalesce(
          (select min((coalesce(q.invoiced_at, q.quoted_at) at time zone s.tz)::date)
           from public.quotes q where coalesce(q.invoiced_at, q.quoted_at) is not null and (p_store_id is null or q.store_id = p_store_id)),
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
  invoices as (
    select (q.invoiced_at at time zone b.tz)::date as local_day, q.status, q.total_amount, q.tax_amount, q.due_date,
           q.total_amount - q.amount_paid as balance,
           q.total_amount - q.tax_amount
           - coalesce((select sum(i.unit_cost * i.quantity) from public.quote_items i where i.quote_id = q.id), 0) as profit
    from public.quotes q, bounds b
    where q.status in ('invoiced', 'paid') and q.invoiced_at >= b.t_from and q.invoiced_at < b.t_to and (p_store_id is null or q.store_id = p_store_id)
  ),
  open_quotes as (
    select q.status, q.total_amount
    from public.quotes q, bounds b
    where q.status in ('sent', 'accepted') and (q.valid_until is null or q.valid_until >= now())
      and q.quoted_at >= b.t_from and q.quoted_at < b.t_to and (p_store_id is null or q.store_id = p_store_id)
  ),
  buckets as (
    select g::date as b_start,
      (g + ('1 ' || b.grain)::interval)::date as b_end
    from bounds b, generate_series(date_trunc(b.grain, b.d_from::timestamp), b.d_to::timestamp, ('1 ' || b.grain)::interval) as g
  )
  select jsonb_build_object(
    'from', b.d_from,
    'to', b.d_to,
    'grain', b.grain,
    'sales', (select coalesce(sum(total_amount), 0) from invoices),
    'tax', (select coalesce(sum(tax_amount), 0) from invoices),
    'profit', (select coalesce(sum(profit), 0) from invoices),
    'invoiceCount', (select count(*) from invoices),
    'pendingInvoices', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(balance), 0))
      from invoices where status = 'invoiced'),
    'pendingQuotations', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(total_amount), 0))
      from open_quotes),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
          'start', k.b_start,
          'sales', coalesce((select sum(i.total_amount) from invoices i where i.local_day >= k.b_start and i.local_day < k.b_end), 0),
          'profit', coalesce((select sum(i.profit) from invoices i where i.local_day >= k.b_start and i.local_day < k.b_end), 0)
        ) order by k.b_start), '[]'::jsonb)
      from buckets k),
    'aging', (select jsonb_build_object(
        'notDue', jsonb_build_object('count', count(*) filter (where i.due_date is null or i.due_date >= b.today),
                                     'total', coalesce(sum(i.balance) filter (where i.due_date is null or i.due_date >= b.today), 0)),
        'overdue30', jsonb_build_object('count', count(*) filter (where i.due_date < b.today and i.due_date >= b.today - 30),
                                        'total', coalesce(sum(i.balance) filter (where i.due_date < b.today and i.due_date >= b.today - 30), 0)),
        'overdue60', jsonb_build_object('count', count(*) filter (where i.due_date < b.today - 30 and i.due_date >= b.today - 60),
                                        'total', coalesce(sum(i.balance) filter (where i.due_date < b.today - 30 and i.due_date >= b.today - 60), 0)),
        'overdue60plus', jsonb_build_object('count', count(*) filter (where i.due_date < b.today - 60),
                                            'total', coalesce(sum(i.balance) filter (where i.due_date < b.today - 60), 0)))
      from invoices i where i.status = 'invoiced'),
    'quotesByStatus', (select jsonb_build_object(
        'sent', jsonb_build_object('count', count(*) filter (where status = 'sent'), 'total', coalesce(sum(total_amount) filter (where status = 'sent'), 0)),
        'accepted', jsonb_build_object('count', count(*) filter (where status = 'accepted'), 'total', coalesce(sum(total_amount) filter (where status = 'accepted'), 0)))
      from open_quotes),
    'counts', jsonb_build_object(
      'customers', (select count(*) from public.customers where not is_walk_in),
      'products', (select count(*) from public.inventory_items where not is_archived),
      'quotations', (select count(*) from public.quotes q
                     where q.status in ('sent', 'accepted', 'cancelled') and q.quoted_at >= b.t_from and q.quoted_at < b.t_to and (p_store_id is null or q.store_id = p_store_id)),
      'invoices', (select count(*) from public.quotes q
                   where q.status in ('invoiced', 'paid', 'void') and q.invoiced_at >= b.t_from and q.invoiced_at < b.t_to and (p_store_id is null or q.store_id = p_store_id))
    )
  )
  from bounds b;
$$
;

create or replace function public.report_data(p_range text default 'month', p_from date default null, p_to date default null, p_tag uuid default null, p_store_id uuid default null)
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
           from public.quotes q where coalesce(q.invoiced_at, q.quoted_at) is not null and (p_store_id is null or q.store_id = p_store_id)),
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
    where q.status in ('invoiced', 'paid') and q.invoiced_at >= b.t_from and q.invoiced_at < b.t_to and (p_store_id is null or q.store_id = p_store_id)
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
    where p.paid_on between b.d_from and b.d_to and (p_store_id is null or q.store_id = p_store_id)
      and (p_tag is null or q.customer_id in (select customer_id from tagged))
  ),
  open_inv as (
    select q.total_amount - q.amount_paid as balance, q.due_date, b.today
    from public.quotes q, bounds b
    where q.status = 'invoiced' and (p_store_id is null or q.store_id = p_store_id) and (p_tag is null or q.customer_id in (select customer_id from tagged))
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
      from (
        select i.id, i.name, i.sku, i.cost_price, i.base_uom_id,
               coalesce(sp.selling_price, i.selling_price) as selling_price,
               case when p_store_id is null then i.quantity_on_hand else sl.on_hand end as quantity_on_hand,
               case when p_store_id is null then i.reserved_quantity else sl.reserved end as reserved_quantity,
               coalesce(sl.low_stock_threshold, i.low_stock_threshold) as low_stock_threshold
        from public.inventory_items i
        left join public.stock_levels sl on sl.item_id = i.id and sl.store_id = p_store_id
        left join public.store_item_prices sp on sp.item_id = i.id and sp.store_id = p_store_id
        where (p_store_id is null or sl.item_id is not null) and not i.is_kit and not i.is_archived
      ) it left join public.units_of_measure u on u.id = it.base_uom_id)
  )
  from bounds b;
$$
;

create or replace function public.shop_alerts(p_store_id uuid default null)
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
    where q.status in ('invoiced', 'sent', 'accepted') and (p_store_id is null or q.store_id = p_store_id)
  )
  select jsonb_build_object(
    'lowStock', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'sku', i.sku,
                    'free', i.quantity_on_hand - i.reserved_quantity, 'threshold', i.low_stock_threshold, 'unit', i.unit)
                    order by i.quantity_on_hand - i.reserved_quantity, i.name), '[]'::jsonb)
                 from (select it.*, u.code as unit
                       from (
                         -- One store: the products it carries, at its own low-stock level if it has one.
                         select x.id, x.name, x.sku, x.base_uom_id,
                                case when p_store_id is null then x.quantity_on_hand else sl.on_hand end as quantity_on_hand,
                                case when p_store_id is null then x.reserved_quantity else sl.reserved end as reserved_quantity,
                                coalesce(sl.low_stock_threshold, x.low_stock_threshold) as low_stock_threshold
                         from public.inventory_items x
                         left join public.stock_levels sl on sl.item_id = x.id and sl.store_id = p_store_id
                         where (p_store_id is null or sl.item_id is not null) and not x.is_kit and not x.is_archived
                       ) it
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
$$
;

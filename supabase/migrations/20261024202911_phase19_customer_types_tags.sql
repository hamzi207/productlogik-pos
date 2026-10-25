-- Phase 19 (2/3): customer types per organization and customer tags (RF-19.2).
--
-- * customer_types: each organization's list, seeded from its industry (industries.default_customer_types).
--   customers.customer_type stays the type's name, now a foreign key (tenant_id, name) that follows renames.
--   One type is the default (walk-in customer, new customers). "Needs tax details" replaces V1's
--   "dealerships and fleet accounts need a CNIC / NTN" check.
-- * customer_tags + customer_tag_links: free tags with a palette colour, many per customer.

-- ---------------------------------------------------------------------------------------------------
-- Industry defaults
-- ---------------------------------------------------------------------------------------------------
alter table public.industries
  add column default_customer_types jsonb not null
    default '[{"name": "Retail Customer"}, {"name": "Wholesale"}, {"name": "Corporate (B2B)", "requires_tax_details": true}]'
    check (jsonb_typeof(default_customer_types) = 'array' and jsonb_array_length(default_customer_types) between 1 and 20);
update public.industries
set default_customer_types = default_customer_types
  || '[{"name": "Dealership", "requires_tax_details": true}, {"name": "Fleet Account", "requires_tax_details": true}]'::jsonb
where slug = 'automotive';

-- ---------------------------------------------------------------------------------------------------
-- Customer types
-- ---------------------------------------------------------------------------------------------------
create table public.customer_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40 and name = btrim(name)),
  requires_tax_details boolean not null default false,
  is_default boolean not null default false,
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, name),
  check (not (is_default and is_archived))
);
create unique index customer_types_name_key on public.customer_types (tenant_id, lower(name));
create unique index customer_types_one_default on public.customer_types (tenant_id) where is_default;
alter table public.customer_types enable row level security;
create policy "Members read their customer types" on public.customer_types for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Admins add customer types" on public.customer_types for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.is_shop_admin()));
create policy "Admins edit customer types" on public.customer_types for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_shop_admin()))
  with check (tenant_id = (select private.current_tenant_id()));
create policy "Admins delete customer types" on public.customer_types for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_shop_admin()) and not is_default);
grant select, insert, update, delete on public.customer_types to authenticated;

-- Units (1/3) plus customer types; existing customers' types are kept even if the industry lacks them.
create or replace function private.seed_tenant_lists(p_tenant uuid)
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

  insert into public.customer_types (tenant_id, name, requires_tax_details, sort_order)
  select p_tenant, btrim(e->>'name'), coalesce((e->>'requires_tax_details')::boolean, false), ord::integer * 10
  from public.tenants t
  join public.industries ind on ind.id = t.industry_id
  cross join lateral jsonb_array_elements(ind.default_customer_types) with ordinality as x(e, ord)
  where t.id = p_tenant and nullif(btrim(e->>'name'), '') is not null
  on conflict (tenant_id, lower(name)) do nothing;

  insert into public.customer_types (tenant_id, name, requires_tax_details, sort_order)
  select distinct p_tenant, c.customer_type, c.customer_type in ('Dealership', 'Fleet Account'), 900
  from public.customers c
  where c.tenant_id = p_tenant
  on conflict (tenant_id, lower(name)) do nothing;

  if not exists (select 1 from public.customer_types where tenant_id = p_tenant and is_default) then
    update public.customer_types set is_default = true
    where id = (select id from public.customer_types where tenant_id = p_tenant and not is_archived
                order by requires_tax_details, sort_order, name limit 1);
  end if;
end;
$$;
revoke all on function private.seed_tenant_lists(uuid) from public, anon, authenticated;

select private.seed_tenant_lists(id) from public.tenants;

-- customers.customer_type → the organization's list (renames follow; a type in use can't be deleted).
alter table public.customers
  drop constraint customers_customer_type_check,
  drop constraint customers_tax_identity_check,
  alter column customer_type drop default,
  add constraint customers_tenant_id_id_key unique (tenant_id, id),
  add constraint customers_customer_type_fkey foreign key (tenant_id, customer_type)
    references public.customer_types (tenant_id, name) on update cascade;

-- Tax details: customers of a type that needs them, or tax-registered customers, need a CNIC / NTN.
-- An archived type can't be given to a customer (customers already on it keep it).
create function private.check_customer_type()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type public.customer_types;
begin
  select * into v_type from public.customer_types where tenant_id = new.tenant_id and name = new.customer_type;
  -- (A rename of the type itself cascades here too; the old name is gone then, so it isn't a re-assignment.)
  if v_type.is_archived and (tg_op = 'INSERT' or (new.customer_type is distinct from old.customer_type
     and exists (select 1 from public.customer_types where tenant_id = old.tenant_id and name = old.customer_type))) then
    raise exception 'The customer type "%" is archived. Choose another type.', new.customer_type using errcode = '23514';
  end if;
  if not new.is_walk_in and new.cnic_or_ntn is null
     and (coalesce(v_type.requires_tax_details, false) or new.tax_registration_status = 'registered') then
    raise exception '% customers need a CNIC or NTN for tax invoices.', new.customer_type using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger customers_check_type before insert or update of customer_type, cnic_or_ntn, tax_registration_status, is_walk_in
  on public.customers for each row execute function private.check_customer_type();

-- The default type can't be archived, and there is always one.
create function private.check_customer_type_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.is_default and not new.is_default
     and not exists (select 1 from public.customer_types where tenant_id = new.tenant_id and is_default and id <> new.id) then
    raise exception 'Make another type the default first.' using errcode = '23514';
  end if;
  if new.is_default and new.is_archived then
    raise exception 'The default customer type can''t be archived.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger customer_types_check_change before update on public.customer_types
  for each row execute function private.check_customer_type_change();

create or replace function public.create_walk_in_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_tenant_lists(new.id);
  insert into public.customers (tenant_id, name, customer_type, is_walk_in)
  select new.id, 'Walk-in / Cash Customer', name, true
  from public.customer_types where tenant_id = new.id and is_default;
  return new;
end;
$$;

-- "B2B" on the customer directory = customers of a type that needs tax details.
create or replace function public.customer_directory_stats()
returns table(total bigint, b2b bigint, outstanding numeric)
language sql
stable
set search_path = ''
as $$
  select
    (select count(*) from public.customers c where not c.is_walk_in),
    (select count(*) from public.customers c
     join public.customer_types t on t.tenant_id = c.tenant_id and t.name = c.customer_type
     where not c.is_walk_in and t.requires_tax_details),
    (select coalesce(sum(q.total_amount - q.amount_paid), 0)
     from public.quotes q join public.customers c on c.id = q.customer_id
     where q.status = 'invoiced' and not c.is_walk_in);
$$;

-- ---------------------------------------------------------------------------------------------------
-- Customer tags (RF-19.2)
-- ---------------------------------------------------------------------------------------------------
create table public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30 and name = btrim(name)),
  color text check (color in ('slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
    'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index customer_tags_name_key on public.customer_tags (tenant_id, lower(name));
alter table public.customer_tags enable row level security;
create policy "Members read their customer tags" on public.customer_tags for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Admins add customer tags" on public.customer_tags for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()) and (select private.is_shop_admin()));
create policy "Admins edit customer tags" on public.customer_tags for update to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_shop_admin()))
  with check (tenant_id = (select private.current_tenant_id()));
create policy "Admins delete customer tags" on public.customer_tags for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()) and (select private.is_shop_admin()));
grant select, insert, update, delete on public.customer_tags to authenticated;

create table public.customer_tag_links (
  tenant_id uuid not null,
  customer_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (customer_id, tag_id),
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete cascade,
  foreign key (tenant_id, tag_id) references public.customer_tags (tenant_id, id) on delete cascade
);
create index customer_tag_links_tag_idx on public.customer_tag_links (tag_id);
alter table public.customer_tag_links enable row level security;
create policy "Members read customer tag links" on public.customer_tag_links for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Members tag customers" on public.customer_tag_links for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()));
create policy "Members untag customers" on public.customer_tag_links for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()));
grant select, insert, delete on public.customer_tag_links to authenticated;

-- Replaces a customer's tags in one call (the customer dialog). RLS limits it to the caller's organization.
create function public.set_customer_tags(p_customer_id uuid, p_tag_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;
  if coalesce(cardinality(p_tag_ids), 0) > 20 then
    raise exception 'A customer can have at most 20 tags.' using errcode = '22023';
  end if;
  delete from public.customer_tag_links
  where customer_id = p_customer_id and not (tag_id = any (coalesce(p_tag_ids, '{}')));
  insert into public.customer_tag_links (tenant_id, customer_id, tag_id)
  select v_tenant, p_customer_id, t.id
  from public.customer_tags t
  where t.id = any (coalesce(p_tag_ids, '{}')) and t.tenant_id = v_tenant
  on conflict do nothing;
end;
$$;
revoke all on function public.set_customer_tags(uuid, uuid[]) from public, anon;
grant execute on function public.set_customer_tags(uuid, uuid[]) to authenticated;

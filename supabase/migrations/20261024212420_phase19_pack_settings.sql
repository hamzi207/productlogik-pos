-- Phase 19, owner request 2026-10-25: packs (boxes, cartons…) are switched on per organization, and
-- the organization chooses which of its units can be packs.
-- * tenants.packs_enabled: off by default. Turning it on adds Box, Carton, Pack and Dozen if missing.
--   Turning it off keeps every product's packs (they come back when it's on again); while off, no new
--   pack can be set up and the app offers only each product's base unit.
-- * units_of_measure.is_pack (and uom_presets.is_pack): only these can be a product's pack.
-- Both rules apply to new packs only, so existing packs and documents keep working.

alter table public.tenants add column packs_enabled boolean not null default false;
grant update (packs_enabled) on public.tenants to authenticated;

alter table public.uom_presets add column is_pack boolean not null default false;
update public.uom_presets set is_pack = true
where code in ('pack', 'box', 'carton', 'dozen', 'set', 'pair', 'suit', 'strip', 'bag', 'coil', 'ream', 'than');

alter table public.units_of_measure add column is_pack boolean not null default false;
update public.units_of_measure u set is_pack = true
from public.uom_presets p
where p.code = lower(u.code) and p.is_pack;

-- Seeding copies the preset's pack flag.
create or replace function private.seed_tenant_lists(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.units_of_measure (tenant_id, code, name, decimals, sort_order, is_pack)
  select p_tenant, c.code, coalesce(p.name, c.code), coalesce(p.decimals, 0), coalesce(p.sort_order, 1000 + c.ord::integer),
         coalesce(p.is_pack, false)
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

-- Turning packs on: the common pack units, if the organization doesn't have them (its own choices stay).
create or replace function private.seed_pack_units()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.units_of_measure (tenant_id, code, name, decimals, sort_order, is_pack)
  select new.id, p.code, p.name, p.decimals, p.sort_order, true
  from public.uom_presets p
  where p.code in ('box', 'carton', 'pack', 'dozen')
  on conflict (tenant_id, lower(code)) do nothing;
  return new;
end;
$$;
revoke all on function private.seed_pack_units() from public, anon, authenticated;

create trigger tenants_seed_pack_units after update of packs_enabled on public.tenants
for each row when (new.packs_enabled and not old.packs_enabled)
execute function private.seed_pack_units();

-- A new pack needs packs switched on and a unit marked as a pack. An upsert of a pack the product
-- already has (saving the product again) isn't new.
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

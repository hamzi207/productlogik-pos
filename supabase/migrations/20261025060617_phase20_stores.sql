-- Phase 20 (1/3): stores, who works where, per-store stock and the stock ledger.
--
-- * stores: every organization has a Main Store (created with the organization), so a single-store
--   organization sees no difference from V1. Admins add more (plan limit `stores`).
-- * profile_stores: the stores a member can work in (create documents there); admins work in every
--   active store. profiles.default_store_id is where they start. Viewing stock is never restricted.
-- * stock_levels: on hand / reserved per product and store. inventory_items.quantity_on_hand and
--   reserved_quantity stay as the organization totals, always equal to the sum over stores; only
--   private.apply_stock changes stock, and it writes stock_movements (the ledger, UI in Phase 24).
-- * store_item_prices (RF-20.1): a store's own selling price for a product.
-- * tenants: cross-store invoicing switch and who may use it; per-store numbering (RF-20.2).

-- ---------------------------------------------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  code text check (code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' and char_length(code) <= 8),
  address text check (char_length(address) <= 300),
  phone text check (char_length(phone) <= 30),
  ntn varchar(20) check (ntn is null or ntn ~ '^[0-9]{7}(-[0-9])?$'),
  strn varchar(20) check (strn is null or strn ~ '^[0-9]{13}$'),
  is_main boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint stores_main_active check (is_active or not is_main)
);
create unique index stores_name_key on public.stores (tenant_id, lower(btrim(name)));
create unique index stores_code_key on public.stores (tenant_id, code) where code is not null;
create unique index stores_one_main on public.stores (tenant_id) where is_main;

alter table public.stores enable row level security;
create policy "Members read their stores" on public.stores for select to authenticated
  using (tenant_id = private.current_tenant_id());
create policy "Admins add stores" on public.stores for insert to authenticated
  with check (tenant_id = private.current_tenant_id() and private.is_shop_admin());
create policy "Admins edit stores" on public.stores for update to authenticated
  using (tenant_id = private.current_tenant_id() and private.is_shop_admin())
  with check (tenant_id = private.current_tenant_id() and private.is_shop_admin());
create policy "Admins delete stores" on public.stores for delete to authenticated
  using (tenant_id = private.current_tenant_id() and private.is_shop_admin() and not is_main);
grant select, delete on public.stores to authenticated;
grant insert (tenant_id, name, code, address, phone, ntn, strn, is_active, sort_order) on public.stores to authenticated;
grant update (name, code, address, phone, ntn, strn, is_active, sort_order, updated_at) on public.stores to authenticated;

-- Members: the stores they can work in. (No direct tenants FK: with profiles and tenants both
-- referenced, PostgREST would see a second profiles↔tenants path and existing embeds turn ambiguous.)
create table public.profile_stores (
  tenant_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  store_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, store_id),
  foreign key (tenant_id, store_id) references public.stores (tenant_id, id) on delete cascade
);
create index profile_stores_store_idx on public.profile_stores (store_id);
alter table public.profile_stores enable row level security;
create policy "Members read store access" on public.profile_stores for select to authenticated
  using (tenant_id = private.current_tenant_id());
create policy "Admins give store access" on public.profile_stores for insert to authenticated
  with check (tenant_id = private.current_tenant_id() and private.is_shop_admin());
create policy "Admins remove store access" on public.profile_stores for delete to authenticated
  using (tenant_id = private.current_tenant_id() and private.is_shop_admin());
grant select, insert, delete on public.profile_stores to authenticated;

alter table public.profiles add column default_store_id uuid references public.stores (id) on delete set null;

-- Organization settings (Settings → Stores).
alter table public.tenants
  add column allow_cross_store_invoicing boolean not null default false,
  add column cross_store_invoicing_roles text not null default 'managers' check (cross_store_invoicing_roles in ('all', 'managers')),
  add column number_per_store boolean not null default false;
grant update (allow_cross_store_invoicing, cross_store_invoicing_roles, number_per_store) on public.tenants to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Stock per store, the ledger and store prices
-- ---------------------------------------------------------------------------------------------------
create table public.stock_levels (
  tenant_id uuid not null,
  item_id uuid not null,
  store_id uuid not null,
  on_hand numeric(14,3) not null default 0 check (on_hand >= 0),
  reserved numeric(14,3) not null default 0 check (reserved >= 0),
  -- This store's own low-stock level (null = the product's).
  low_stock_threshold numeric(14,3) check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now(),
  primary key (item_id, store_id),
  foreign key (tenant_id, item_id) references public.inventory_items (tenant_id, id) on delete cascade,
  foreign key (tenant_id, store_id) references public.stores (tenant_id, id) on delete restrict,
  constraint stock_levels_reserved_within check (reserved <= on_hand)
);
create index stock_levels_store_idx on public.stock_levels (store_id);
alter table public.stock_levels enable row level security;
create policy "Members read stock in every store" on public.stock_levels for select to authenticated
  using (tenant_id = private.current_tenant_id());
grant select on public.stock_levels to authenticated;

create table public.stock_movements (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  item_id uuid not null,
  store_id uuid not null,
  type text not null check (type in ('sale', 'sale_cancel', 'reserve', 'release', 'delivery', 'return', 'adjustment', 'count',
                                     'transfer_out', 'transfer_in', 'purchase_receipt', 'supplier_return', 'opening', 'import')),
  -- Change in on hand / in reserved, in the product's base unit.
  quantity numeric(14,3) not null default 0,
  reserved numeric(14,3) not null default 0,
  on_hand_after numeric(14,3) not null,
  reserved_after numeric(14,3) not null,
  unit_cost numeric(12,2),
  quote_id uuid references public.quotes (id) on delete set null,
  note text check (char_length(note) <= 300),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, item_id) references public.inventory_items (tenant_id, id) on delete cascade,
  foreign key (tenant_id, store_id) references public.stores (tenant_id, id) on delete restrict
);
create index stock_movements_item_idx on public.stock_movements (tenant_id, item_id, created_at desc);
create index stock_movements_store_idx on public.stock_movements (store_id);
create index stock_movements_quote_idx on public.stock_movements (quote_id);
alter table public.stock_movements enable row level security;
create policy "Members read the stock ledger" on public.stock_movements for select to authenticated
  using (tenant_id = private.current_tenant_id());
grant select on public.stock_movements to authenticated;

-- RF-20.1: a store's own selling price (base unit) for a product.
create table public.store_item_prices (
  tenant_id uuid not null,
  store_id uuid not null,
  item_id uuid not null,
  selling_price numeric(10,2) not null check (selling_price >= 0),
  updated_at timestamptz not null default now(),
  primary key (store_id, item_id),
  foreign key (tenant_id, item_id) references public.inventory_items (tenant_id, id) on delete cascade,
  foreign key (tenant_id, store_id) references public.stores (tenant_id, id) on delete cascade
);
create index store_item_prices_item_idx on public.store_item_prices (item_id);
alter table public.store_item_prices enable row level security;
create policy "Members read store prices" on public.store_item_prices for select to authenticated
  using (tenant_id = private.current_tenant_id());
grant select on public.store_item_prices to authenticated;

-- Documents belong to a store; each stock line names the store its stock comes from.
alter table public.quotes add column store_id uuid;
alter table public.quote_items add column source_store_id uuid;

-- ---------------------------------------------------------------------------------------------------
-- Backfill: one Main Store per organization, V1 stock and documents moved into it
-- ---------------------------------------------------------------------------------------------------
insert into public.stores (tenant_id, name, is_main, sort_order)
select id, 'Main Store', true, 0 from public.tenants;

insert into public.stock_levels (tenant_id, item_id, store_id, on_hand, reserved)
select i.tenant_id, i.id, s.id, i.quantity_on_hand, i.reserved_quantity
from public.inventory_items i
join public.stores s on s.tenant_id = i.tenant_id and s.is_main
where i.quantity_on_hand <> 0 or i.reserved_quantity <> 0;

insert into public.stock_movements (tenant_id, item_id, store_id, type, quantity, reserved, on_hand_after, reserved_after, unit_cost, note, created_by)
select l.tenant_id, l.item_id, l.store_id, 'opening', l.on_hand, l.reserved, l.on_hand, l.reserved, i.cost_price,
       'Stock when stores were introduced', null
from public.stock_levels l join public.inventory_items i on i.id = l.item_id;

update public.quotes q set store_id = s.id
from public.stores s where s.tenant_id = q.tenant_id and s.is_main;
-- Only labels where existing holdings already are: the stock trigger must not re-sync them.
alter table public.quote_items disable trigger quote_items_sync_stock;
update public.quote_items qi set source_store_id = q.store_id
from public.quotes q where q.id = qi.quote_id and qi.item_id is not null;
alter table public.quote_items enable trigger quote_items_sync_stock;

insert into public.profile_stores (tenant_id, profile_id, store_id)
select p.tenant_id, p.id, s.id
from public.profiles p join public.stores s on s.tenant_id = p.tenant_id and s.is_main;
update public.profiles p set default_store_id = s.id
from public.stores s where s.tenant_id = p.tenant_id and s.is_main;

-- Abort if any product's stock changed.
do $$
begin
  if exists (
    select 1 from public.inventory_items i
    left join (select item_id, sum(on_hand) as on_hand, sum(reserved) as reserved from public.stock_levels group by item_id) l on l.item_id = i.id
    where i.quantity_on_hand <> coalesce(l.on_hand, 0) or i.reserved_quantity <> coalesce(l.reserved, 0)
  ) or exists (
    select 1 from public.quote_items qi
    where (qi.reserved_qty > 0 or qi.deducted_qty > 0) and qi.source_store_id is null
  ) then
    raise exception 'Phase 20 backfill: stock totals changed.';
  end if;
end;
$$;

alter table public.quotes
  alter column store_id set not null,
  add constraint quotes_store_fkey foreign key (tenant_id, store_id) references public.stores (tenant_id, id) on delete restrict;
alter table public.quote_items
  add constraint quote_items_source_store_fkey foreign key (tenant_id, source_store_id) references public.stores (tenant_id, id) on delete restrict;
create index idx_quotes_tenant_store_status on public.quotes (tenant_id, store_id, status);
create index quote_items_source_store_idx on public.quote_items (source_store_id);

-- ---------------------------------------------------------------------------------------------------
-- Who works where
-- ---------------------------------------------------------------------------------------------------
-- The caller's work stores: admins (and a superadmin acting as the organization) every active store,
-- members the active stores they were given.
create function private.my_work_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.stores s
  where s.tenant_id = private.current_tenant_id()
    and s.is_active
    and (private.is_shop_admin()
         or exists (select 1 from public.profile_stores ps where ps.store_id = s.id and ps.profile_id = auth.uid()));
$$;

-- Service-role and migration calls (no signed-in user) aren't limited.
create function private.can_work_in_store(p_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null or p_store in (select private.my_work_store_ids());
$$;

-- Where a new document goes when the app doesn't say: the member's default store if they can work
-- there, else their first work store (Main Store first).
create function private.default_store_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.stores s
  where s.id in (select private.my_work_store_ids())
  order by s.id = (select p.default_store_id from public.profiles p where p.id = auth.uid()) desc nulls last,
           s.is_main desc, s.sort_order, s.name
  limit 1;
$$;

-- Lines from another store's stock: the organization allows it, for everyone or admins only
-- ("managers" until Phase 22 adds the manager role).
create function private.can_invoice_other_store(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null
    or exists (select 1 from public.tenants t
               where t.id = p_tenant and t.allow_cross_store_invoicing
                 and (t.cross_store_invoicing_roles = 'all' or private.is_shop_admin()));
$$;

revoke all on function private.my_work_store_ids() from public, anon;
revoke all on function private.can_work_in_store(uuid) from public, anon;
revoke all on function private.default_store_id() from public, anon;
revoke all on function private.can_invoice_other_store(uuid) from public, anon;
grant execute on function private.my_work_store_ids() to authenticated;
grant execute on function private.can_work_in_store(uuid) to authenticated;
grant execute on function private.default_store_id() to authenticated;
grant execute on function private.can_invoice_other_store(uuid) to authenticated;

-- The app's store switcher: the stores this member can work in.
create function public.my_work_stores()
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select private.my_work_store_ids();
$$;
revoke all on function public.my_work_stores() from public, anon;
grant execute on function public.my_work_stores() to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Store rules
-- ---------------------------------------------------------------------------------------------------
create function private.stores_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  new.name := btrim(new.name);
  new.code := nullif(upper(btrim(new.code)), '');
  if tg_op = 'UPDATE' and old.is_main and not new.is_active then
    raise exception 'The main store can''t be switched off.' using errcode = '23514';
  end if;
  if new.is_active and new.code is null
     and exists (select 1 from public.tenants t where t.id = new.tenant_id and t.number_per_store) then
    raise exception 'Give the store a code: documents are numbered per store (e.g. LHR1-INV-1001).' using errcode = '23514';
  end if;
  -- Plan limit on active stores.
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    v_limit := private.tenant_limit(new.tenant_id, 'stores');
    if v_limit is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.tenant_id::text || ':stores', 0));
      select count(*) into v_count from public.stores s where s.tenant_id = new.tenant_id and s.is_active and s.id <> new.id;
      if v_count >= v_limit then
        raise exception 'This organization''s plan allows % %.', v_limit, case when v_limit = 1 then 'store' else 'stores' end
          using errcode = 'P0001', detail = 'plan_limit:stores', hint = 'Switch off a store or ask ProductLogik to change the plan.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.stores_check() from public, anon, authenticated;
create trigger stores_check before insert or update on public.stores
for each row execute function private.stores_check();

-- A store with stock, documents or stock history can only be switched off. The main store stays
-- (unless the whole organization is being deleted).
create function private.stores_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
    return old;
  end if;
  if old.is_main then
    raise exception 'The main store can''t be deleted.' using errcode = '23514';
  end if;
  if exists (select 1 from public.stock_levels l where l.store_id = old.id and (l.on_hand <> 0 or l.reserved <> 0))
     or exists (select 1 from public.quotes q where q.store_id = old.id)
     or exists (select 1 from public.stock_movements m where m.store_id = old.id) then
    raise exception '% has stock, documents or stock history. Switch it off instead.', old.name using errcode = '23503';
  end if;
  delete from public.stock_levels where store_id = old.id;
  update public.profiles set default_store_id = null where default_store_id = old.id;
  return old;
end;
$$;
revoke all on function private.stores_before_delete() from public, anon, authenticated;
create trigger stores_before_delete before delete on public.stores
for each row execute function private.stores_before_delete();

-- Per-store numbering needs a code on every active store.
create function private.tenants_check_store_numbering()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number_per_store and not old.number_per_store
     and exists (select 1 from public.stores s where s.tenant_id = new.id and s.is_active and s.code is null) then
    raise exception 'Give every store a code first (Settings → Stores): documents will be numbered like LHR1-INV-1001.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.tenants_check_store_numbering() from public, anon, authenticated;
create trigger tenants_check_store_numbering before update of number_per_store on public.tenants
for each row execute function private.tenants_check_store_numbering();

-- New organizations get their Main Store; new members work in it.
create function private.tenants_create_main_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stores (tenant_id, name, is_main, sort_order) values (new.id, 'Main Store', true, 0);
  return new;
end;
$$;
revoke all on function private.tenants_create_main_store() from public, anon, authenticated;
create trigger tenants_create_main_store after insert on public.tenants
for each row execute function private.tenants_create_main_store();

create function private.profiles_default_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_main uuid;
begin
  select id into v_main from public.stores where tenant_id = new.tenant_id and is_main;
  if v_main is null then
    return new;
  end if;
  insert into public.profile_stores (tenant_id, profile_id, store_id) values (new.tenant_id, new.id, v_main)
  on conflict do nothing;
  if new.default_store_id is null then
    update public.profiles set default_store_id = v_main where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.profiles_default_store() from public, anon, authenticated;
create trigger profiles_default_store after insert on public.profiles
for each row execute function private.profiles_default_store();

-- Store access rows and a member's default store stay inside the member's organization.
create function private.profile_stores_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.profile_id and p.tenant_id = new.tenant_id) then
    raise exception 'That member isn''t in this organization.' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function private.profile_stores_check() from public, anon, authenticated;
create trigger profile_stores_check before insert on public.profile_stores
for each row execute function private.profile_stores_check();

create function private.profiles_check_default_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.default_store_id is not null
     and not exists (select 1 from public.stores s where s.id = new.default_store_id and s.tenant_id = new.tenant_id) then
    raise exception 'That store isn''t in this organization.' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function private.profiles_check_default_store() from public, anon, authenticated;
create trigger profiles_check_default_store before insert or update of default_store_id, tenant_id on public.profiles
for each row execute function private.profiles_check_default_store();

-- ---------------------------------------------------------------------------------------------------
-- The one way stock changes
-- ---------------------------------------------------------------------------------------------------
-- Adds p_on_hand to on hand and p_reserved to reserved at one store, writes the ledger and keeps the
-- product's totals. Locks the store's row, so parallel documents for the last unit queue up.
create function private.apply_stock(
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
  select i.id, i.tenant_id, i.name, i.cost_price, u.code as unit into v_item
  from public.inventory_items i left join public.units_of_measure u on u.id = i.base_uom_id
  where i.id = p_item;
  if not found then
    raise exception 'That product no longer exists.' using errcode = 'P0002';
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
revoke all on function private.apply_stock(uuid, uuid, numeric, numeric, text, uuid, text, numeric) from public, anon, authenticated;

-- inventory_items totals = Σ stock_levels. Only apply_stock moves them; a new product's starting
-- quantity (inserted directly, e.g. by the console) goes into the Main Store as opening stock.
create function private.inventory_items_stock_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.reserved_quantity := 0;
    return new;
  end if;
  if coalesce(current_setting('app.stock_sync', true), '') = 'on' then
    select coalesce(sum(l.on_hand), 0), coalesce(sum(l.reserved), 0)
    into new.quantity_on_hand, new.reserved_quantity
    from public.stock_levels l where l.item_id = new.id;
  elsif new.quantity_on_hand is distinct from old.quantity_on_hand or new.reserved_quantity is distinct from old.reserved_quantity then
    raise exception 'Stock is kept per store: change it in a store.' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.inventory_items_stock_totals() from public, anon, authenticated;
create trigger inventory_items_a_stock_totals before insert or update on public.inventory_items
for each row execute function private.inventory_items_stock_totals();

create function private.inventory_items_opening_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qty numeric := new.quantity_on_hand;
begin
  if v_qty > 0 then
    -- Starts at 0 and is added as opening stock, so the total is the sum over stores.
    perform pg_catalog.set_config('app.stock_sync', 'on', true);
    update public.inventory_items set quantity_on_hand = 0 where id = new.id;
    perform private.apply_stock(new.id, (select s.id from public.stores s where s.tenant_id = new.tenant_id and s.is_main),
                                v_qty, 0, 'opening');
  end if;
  return null;
end;
$$;
revoke all on function private.inventory_items_opening_stock() from public, anon, authenticated;
create trigger inventory_items_opening_stock after insert on public.inventory_items
for each row execute function private.inventory_items_opening_stock();

-- Totals are no longer written by members (column grants).
revoke insert (quantity_on_hand), update (quantity_on_hand) on public.inventory_items from authenticated;

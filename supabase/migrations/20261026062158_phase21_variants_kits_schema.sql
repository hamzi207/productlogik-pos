-- Phase 21 (1/3): product groups with variants, kits (RF-21.1) and one barcode per product.
--
-- * product_groups: the parent product (name, category, description, vendor, unit, prices, attributes,
--   fitment) with up to 3 option types (Size, Colour…) and their ordered values; a value can add to the
--   price ("+Rs. 200 for XL").
-- * Each variant is an inventory_items row, so stock, documents, CSV and search keep working on
--   inventory_items: group_id, option_values (its value ids in option order), variant_label ("Red / L")
--   and name ("Polo Shirt – Red / L"). Its price follows the group (+ the values' price deltas) and its
--   cost the group's, unless own_price / own_cost. The rest is the group's, written by save_product_group.
-- * is_archived: a variant that was switched off but has documents or stock history. Hidden from lists
--   and search; old documents still print. Archived products don't count toward the plan's product limit.
-- * is_kit + kit_components: a kit is sold as one line and its components' stock moves (a bill of
--   materials, quantities in each component's base unit). It has no stock of its own.
-- * barcode: one per product or variant until Phase 23 moves it into item_barcodes. Never the same as a
--   pack's barcode (item_uom_conversions.barcode), so a scan always finds one thing.

-- ---------------------------------------------------------------------------------------------------
-- Product groups, options and values
-- ---------------------------------------------------------------------------------------------------
create table public.product_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 90),
  -- New variants' SKUs start with it: POLO → POLO-RED-L.
  sku_prefix text not null check (sku_prefix ~ '^[A-Z0-9][A-Z0-9._/-]*$' and char_length(sku_prefix) <= 24),
  description text check (char_length(description) <= 500),
  vendor_name varchar(255),
  category_id uuid not null references public.categories (id),
  base_uom_id uuid not null,
  cost_price numeric(10,2) not null default 0 check (cost_price >= 0),
  selling_price numeric(10,2) not null default 0 check (selling_price >= 0),
  -- New variants start with it; each variant keeps its own.
  low_stock_threshold numeric(14,3) not null default 5 check (low_stock_threshold >= 0),
  price_includes_tax boolean not null default true,
  is_universal boolean not null default true,
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'),
  -- Deleted while some variants have history: those stay archived, and the name is free again.
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint product_groups_base_uom_fkey foreign key (tenant_id, base_uom_id) references public.units_of_measure (tenant_id, id)
);
create unique index product_groups_name_key on public.product_groups (tenant_id, lower(btrim(name))) where not is_archived;
create index product_groups_category_idx on public.product_groups (category_id);

create table public.product_option_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  group_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  position smallint not null check (position between 0 and 2),
  unique (tenant_id, id),
  constraint product_option_types_group_fkey foreign key (tenant_id, group_id) references public.product_groups (tenant_id, id) on delete cascade
);
create index product_option_types_group_idx on public.product_option_types (group_id, position);

create table public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  option_type_id uuid not null,
  value text not null check (char_length(btrim(value)) between 1 and 40),
  position smallint not null default 0,
  -- Added to the group price for variants with this value (can be negative).
  price_delta numeric(10,2) not null default 0,
  unique (tenant_id, id),
  constraint product_option_values_type_fkey foreign key (tenant_id, option_type_id) references public.product_option_types (tenant_id, id) on delete cascade
);
create index product_option_values_type_idx on public.product_option_values (option_type_id, position);

-- Members manage their organization's products (as inventory_items); writes go through save_product_group.
alter table public.product_groups enable row level security;
alter table public.product_option_types enable row level security;
alter table public.product_option_values enable row level security;
create policy "Members read product groups" on public.product_groups for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Members add product groups" on public.product_groups for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()));
create policy "Members edit product groups" on public.product_groups for update to authenticated
  using (tenant_id = (select private.current_tenant_id())) with check (tenant_id = (select private.current_tenant_id()));
create policy "Members delete product groups" on public.product_groups for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Members read product options" on public.product_option_types for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Members add product options" on public.product_option_types for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()));
create policy "Members edit product options" on public.product_option_types for update to authenticated
  using (tenant_id = (select private.current_tenant_id())) with check (tenant_id = (select private.current_tenant_id()));
create policy "Members delete product options" on public.product_option_types for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Members read option values" on public.product_option_values for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Members add option values" on public.product_option_values for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()));
create policy "Members edit option values" on public.product_option_values for update to authenticated
  using (tenant_id = (select private.current_tenant_id())) with check (tenant_id = (select private.current_tenant_id()));
create policy "Members delete option values" on public.product_option_values for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()));

revoke all on public.product_groups, public.product_option_types, public.product_option_values from anon, authenticated;
grant select, insert, update, delete on public.product_groups, public.product_option_types, public.product_option_values to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Variants, archiving, barcodes and kits on inventory_items
-- ---------------------------------------------------------------------------------------------------
alter table public.inventory_items
  add column group_id uuid,
  add column option_values jsonb,
  add column variant_label text check (char_length(variant_label) <= 130),
  add column own_price boolean not null default false,
  add column own_cost boolean not null default false,
  add column is_archived boolean not null default false,
  add column barcode text check (barcode ~ '^[!-~]{1,64}$'),
  add column is_kit boolean not null default false,
  add constraint inventory_items_group_fkey foreign key (tenant_id, group_id) references public.product_groups (tenant_id, id),
  add constraint inventory_items_variant_check check (
    (group_id is null) = (option_values is null)
    and (option_values is null or jsonb_typeof(option_values) = 'array')
    and not (is_kit and group_id is not null)
  );
create unique index inventory_items_variant_key on public.inventory_items (group_id, option_values) where group_id is not null;
create index inventory_items_group_idx on public.inventory_items (group_id) where group_id is not null;
create unique index inventory_items_barcode_key on public.inventory_items (tenant_id, barcode) where barcode is not null;

grant insert (group_id, option_values, variant_label, own_price, own_cost, is_archived, barcode, is_kit),
      update (group_id, option_values, variant_label, own_price, own_cost, is_archived, barcode, is_kit)
  on public.inventory_items to authenticated;

-- Low stock never means a kit (its components have their own alerts) or a switched-off variant.
alter table public.inventory_items drop column is_low_stock;
alter table public.inventory_items add column is_low_stock boolean
  generated always as (not is_kit and not is_archived and quantity_on_hand - reserved_quantity <= low_stock_threshold) stored;

-- A kit's components (quantity in the component's base unit, per kit).
create table public.kit_components (
  tenant_id uuid not null,
  kit_id uuid not null,
  component_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  position smallint not null default 0,
  primary key (kit_id, component_id),
  constraint kit_components_kit_fkey foreign key (tenant_id, kit_id) references public.inventory_items (tenant_id, id) on delete cascade,
  -- A product that's in a kit can't be deleted until it's taken out of the kit.
  constraint kit_components_component_fkey foreign key (tenant_id, component_id) references public.inventory_items (tenant_id, id) on delete restrict,
  constraint kit_components_not_itself check (kit_id <> component_id)
);
create index kit_components_component_idx on public.kit_components (component_id);
alter table public.kit_components enable row level security;
create policy "Members read kits" on public.kit_components for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Members add kit components" on public.kit_components for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()));
create policy "Members edit kit components" on public.kit_components for update to authenticated
  using (tenant_id = (select private.current_tenant_id())) with check (tenant_id = (select private.current_tenant_id()));
create policy "Members remove kit components" on public.kit_components for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()));
revoke all on public.kit_components from anon, authenticated;
grant select, insert, update, delete on public.kit_components to authenticated;

-- Document lines: the variant's label and (kits) what one kit held, saved with the line.
alter table public.quote_items
  add column variant_label text,
  add column kit_components jsonb check (kit_components is null or jsonb_typeof(kit_components) = 'array');

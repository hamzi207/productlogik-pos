-- Phase 21 (3/3), RF-21.2: product images.
--
-- * product_images: up to 8 per product, kit or product group, in order (the first is the main image).
--   Variants show their group's images. Files live in the public product-images bucket under the
--   organization's folder (<tenant_id>/<file>), uploaded through the app (PNG / JPEG, resized in the browser).
-- * tenants.images_on_drafts / _quotations / _invoices: whether the A4 PDF and the share page of that
--   document type show each line's main image (Settings → Tax & Printing). All off to start with.

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid,
  group_id uuid,
  path text not null check (char_length(path) <= 300),
  url text not null check (char_length(url) <= 600),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint product_images_owner check (num_nonnulls(item_id, group_id) = 1),
  constraint product_images_item_fkey foreign key (tenant_id, item_id) references public.inventory_items (tenant_id, id) on delete cascade,
  constraint product_images_group_fkey foreign key (tenant_id, group_id) references public.product_groups (tenant_id, id) on delete cascade,
  -- The file is in the organization's own folder.
  constraint product_images_folder_check check (split_part(path, '/', 1) = tenant_id::text),
  unique (tenant_id, path)
);
create index product_images_item_idx on public.product_images (item_id, position) where item_id is not null;
create index product_images_group_idx on public.product_images (group_id, position) where group_id is not null;

alter table public.product_images enable row level security;
create policy "Members read product images" on public.product_images for select to authenticated
  using (tenant_id = (select private.current_tenant_id()));
create policy "Members add product images" on public.product_images for insert to authenticated
  with check (tenant_id = (select private.current_tenant_id()));
create policy "Members order product images" on public.product_images for update to authenticated
  using (tenant_id = (select private.current_tenant_id())) with check (tenant_id = (select private.current_tenant_id()));
create policy "Members remove product images" on public.product_images for delete to authenticated
  using (tenant_id = (select private.current_tenant_id()));
revoke all on public.product_images from anon, authenticated;
grant select, insert, delete on public.product_images to authenticated;
grant update (position) on public.product_images to authenticated;

create function private.product_images_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(new.item_id, new.group_id)::text || ':images', 0));
  if (select count(*) from public.product_images i
      where i.item_id is not distinct from new.item_id and i.group_id is not distinct from new.group_id) >= 8 then
    raise exception 'A product can have at most 8 images.' using errcode = '22023';
  end if;
  if new.item_id is not null and exists (select 1 from public.inventory_items i where i.id = new.item_id and i.group_id is not null) then
    raise exception 'Variants show their product group''s images: add them to the group.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.product_images_check() from public, anon, authenticated;
create trigger product_images_check before insert on public.product_images
for each row execute function private.product_images_check();

-- The bucket: public to read (documents and share links show the images), written by members into their
-- organization's folder only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Members read their product images" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (private.current_tenant_id())::text);
create policy "Members upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = (private.current_tenant_id())::text);
create policy "Members delete their product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (private.current_tenant_id())::text);

-- Images on documents, per document type.
alter table public.tenants
  add column images_on_drafts boolean not null default false,
  add column images_on_quotations boolean not null default false,
  add column images_on_invoices boolean not null default false;
grant update (images_on_drafts, images_on_quotations, images_on_invoices) on public.tenants to authenticated;

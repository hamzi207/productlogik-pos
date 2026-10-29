-- Phase 21 (RF-21.2, owner request 2026-10-26): the customer link's product images get their own
-- switch too, like the A4 PDF's. The document switches pick the documents; these pick where they show.
alter table public.tenants
  add column images_on_share boolean not null default true;
grant update (images_on_share) on public.tenants to authenticated;

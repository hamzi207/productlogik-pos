-- Phase 21 (RF-21.2, owner request 2026-10-26): a separate switch for product images on the A4 PDF.
-- The per-document switches (estimates / quotations / invoices) decide which documents show images;
-- this one decides whether their PDF does too (the customer link follows the document switches only).
alter table public.tenants
  add column images_on_pdf boolean not null default true;
grant update (images_on_pdf) on public.tenants to authenticated;

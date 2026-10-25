-- Phase 20 follow-up (owner, 2026-10-25): once an invoice exists, only organization admins change who
-- it's for (customer, walk-in buyer) and when it falls due. Staff still set them while creating it; the
-- console (service role, no auth.uid()) and "Login As" (is_shop_admin) still can.

create or replace function private.guard_invoice_facts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('invoiced', 'paid', 'void')
     and auth.uid() is not null
     and not private.is_shop_admin()
     and (new.customer_id is distinct from old.customer_id
          or new.due_date is distinct from old.due_date
          or new.walk_in_name is distinct from old.walk_in_name
          or new.walk_in_phone is distinct from old.walk_in_phone) then
    raise exception 'Only an admin can change the customer or due date of an invoice.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_invoice_facts() from public, anon, authenticated;

create trigger quotes_guard_invoice_facts
  before update of customer_id, due_date, walk_in_name, walk_in_phone on public.quotes
  for each row execute function private.guard_invoice_facts();

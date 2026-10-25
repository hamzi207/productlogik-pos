-- Phase 20 follow-up (owner, 2026-10-25): staff may swap a saved invoice's customer (it can never be
-- removed: quotes.customer_id is not null); only its due date stays the admin's to change. Replaces the
-- guard from 20261025133202_phase20_invoice_facts, which also locked the customer and walk-in buyer.

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
     and new.due_date is distinct from old.due_date then
    raise exception 'Only an admin can change the due date of an invoice.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger quotes_guard_invoice_facts on public.quotes;
create trigger quotes_guard_invoice_facts
  before update of due_date on public.quotes
  for each row execute function private.guard_invoice_facts();

-- Phase 20 (4/4): who adds stores.
--
-- Stores are part of the subscription. Organization admins add stores up to the subscription's store
-- limit (the plan's, or the organization's own override) and edit their details; deleting a store and
-- switching one off or back on is done by ProductLogik from the console (service role).
-- The Phase 20 tables also lose the full default privileges new tables get: members keep only what
-- the app uses (every stock change goes through private.apply_stock).

revoke all on public.stores, public.profile_stores, public.stock_levels, public.stock_movements, public.store_item_prices
  from anon, authenticated;
grant select on public.stores, public.profile_stores, public.stock_levels, public.stock_movements, public.store_item_prices
  to authenticated;
grant insert (tenant_id, name, code, address, phone, ntn, strn, sort_order) on public.stores to authenticated;
grant update (name, code, address, phone, ntn, strn, sort_order, updated_at) on public.stores to authenticated;
grant insert, delete on public.profile_stores to authenticated;

drop policy "Admins delete stores" on public.stores;

-- The limit message now points to the subscription (admins can't switch stores off any more).
create or replace function private.stores_check()
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
  -- Subscription limit on open stores.
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    v_limit := private.tenant_limit(new.tenant_id, 'stores');
    if v_limit is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.tenant_id::text || ':stores', 0));
      select count(*) into v_count from public.stores s where s.tenant_id = new.tenant_id and s.is_active and s.id <> new.id;
      if v_count >= v_limit then
        raise exception 'This organization''s subscription includes % %.', v_limit, case when v_limit = 1 then 'store' else 'stores' end
          using errcode = 'P0001', detail = 'plan_limit:stores', hint = 'Ask ProductLogik to add stores to the subscription.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

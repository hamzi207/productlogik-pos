-- Phase 19: inventory_items has column-level write grants; the new unit columns need them too.
grant insert (base_uom_id, purchase_uom_id, sale_uom_id) on public.inventory_items to authenticated;
grant update (base_uom_id, purchase_uom_id, sale_uom_id) on public.inventory_items to authenticated;

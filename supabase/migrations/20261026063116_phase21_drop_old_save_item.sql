-- Phase 21: save_inventory_item gets barcode and kit arguments (recreated in the next migration).
drop function public.save_inventory_item(text, text, uuid, numeric, numeric, numeric, numeric, boolean, uuid, text, integer[], boolean, text, jsonb, uuid, uuid, uuid, jsonb, uuid, jsonb);

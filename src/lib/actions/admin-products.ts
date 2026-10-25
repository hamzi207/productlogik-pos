"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { planLimitMessage } from "@/lib/plan-limits";
import { audit, changedFields, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database.types";
import { inventoryItemSchema, type InventoryItemInput } from "@/lib/validations/inventory.schema";

// The console's Products tab (Phase 18, from the superadmin review): view, add, edit and delete one
// organization's products. Service role on inventory_items; the database still checks the category (visible
// to that organization, not archived), attributes, SKU uniqueness, reserved stock and the plan's product
// limit. Vehicle fitment and pack units (Phase 19) are left as they are (edit those in the shop with Login As). Audited.

export type ProductInput = Omit<InventoryItemInput, "isUniversal" | "vehicleIds" | "conversions" | "purchaseUomId" | "saleUomId">;
export type ProductResult = { status: "success" } | { status: "error"; message: string; field?: string };

const uuid = z.uuid();

function saveError(error: { code?: string; message: string; details?: string | null }, sku: string): ProductResult {
  const limit = planLimitMessage(error);
  if (limit) return { status: "error", message: limit };
  switch (error.code) {
    case "23505":
      return { status: "error", field: "sku", message: `SKU ${sku} is already used by another product.` };
    case "23514":
      // Phase 20: a store's stock can't go below what its open quotations reserved.
      if (error.message.includes("stock_levels_reserved_within") || error.message.includes("reserved")) {
        return { status: "error", field: "quantityOnHand", message: "Stock can't go below what open quotations have reserved." };
      }
      // Unit rules (e.g. the base unit of a product already on documents) explain themselves.
      return { status: "error", message: error.message };
    case "22023":
    case "23503":
    case "P0001":
      // Category, attribute and unit triggers explain themselves.
      return { status: "error", message: error.message };
  }
  console.error("admin product save failed:", error);
  return { status: "error", message: "We couldn't save this product. Please try again." };
}

/** Adds (no `id`) or saves a product for the organization. */
export async function saveTenantProduct(tenantId: string, input: ProductInput, id?: string, storeId?: string): Promise<ProductResult> {
  const me = await requireSuperadmin();
  if (!uuid.safeParse(tenantId).success || (id && !uuid.safeParse(id).success) || (storeId && !uuid.safeParse(storeId).success)) {
    return { status: "error", message: "Invalid product." };
  }
  const parsed = inventoryItemSchema.safeParse({ ...input, isUniversal: true, vehicleIds: [], conversions: [], purchaseUomId: null, saleUomId: null });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: "error", message: issue.message, field: String(issue.path[0] ?? "") };
  }
  const p = parsed.data;
  const row = {
    sku: p.sku,
    name: p.name,
    description: p.description || null,
    vendor_name: p.vendorName || null,
    category_id: p.categoryId,
    cost_price: p.costPrice,
    selling_price: p.sellingPrice,
    low_stock_threshold: p.lowStockThreshold,
    price_includes_tax: p.priceIncludesTax,
    attributes: p.attributes as Json,
    base_uom_id: p.baseUomId,
  };
  const admin = createAdminClient();
  const { data: unit } = await admin.from("units_of_measure").select("id").eq("id", p.baseUomId).eq("tenant_id", tenantId).maybeSingle();
  if (!unit) return { status: "error", field: "baseUomId", message: "Choose one of this organization's units." };
  // Phase 20: stock is set at one store (the main store unless the dialog picked another), as an adjustment.
  const { data: store } = storeId
    ? await admin.from("stores").select("id, name").eq("id", storeId).eq("tenant_id", tenantId).maybeSingle()
    : await admin.from("stores").select("id, name").eq("tenant_id", tenantId).eq("is_main", true).maybeSingle();
  if (!store) return { status: "error", message: "That store isn't in this organization." };
  const setStock = async (itemId: string) => {
    const { data: level } = await admin.from("stock_levels").select("on_hand").eq("item_id", itemId).eq("store_id", store.id).maybeSingle();
    const before = Number(level?.on_hand ?? 0);
    if (before === p.quantityOnHand) return { changed: null, error: null };
    const { error } = await admin.rpc("admin_set_store_stock", { p_tenant: tenantId, p_item: itemId, p_store: store.id, p_on_hand: p.quantityOnHand });
    return { changed: { store: store.name, before, after: p.quantityOnHand }, error };
  };

  if (id) {
    const { data: before } = await admin.from("inventory_items").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!before) return { status: "error", message: "This product no longer exists." };
    const { error } = await admin.from("inventory_items").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId);
    if (error) return saveError(error, p.sku);
    // A pack unit that just became the base unit isn't a conversion any more (as save_inventory_item does).
    await admin.from("item_uom_conversions").delete().eq("item_id", id).eq("uom_id", p.baseUomId);
    const stock = await setStock(id);
    if (stock.error) return saveError(stock.error, p.sku);
    const diff = changedFields(before, row);
    if (Object.keys(diff.after).length || stock.changed) {
      await audit({ adminId: me.userId, action: "product.update", tenantId, details: { id, sku: p.sku, ...diff, ...(stock.changed ? { stock: stock.changed } : {}) } });
    }
  } else {
    const { data, error } = await admin.from("inventory_items").insert({ ...row, tenant_id: tenantId, is_universal: true }).select("id").single();
    if (error) return saveError(error, p.sku);
    const stock = await setStock(data.id);
    if (stock.error) return saveError(stock.error, p.sku);
    await audit({ adminId: me.userId, action: "product.create", tenantId, details: { id: data.id, sku: p.sku, name: p.name, ...(stock.changed ? { stock: stock.changed } : {}) } });
  }
  refresh();
  return { status: "success" };
}

/** Deletes a product. Quotation and invoice lines keep their text and prices (their item link is cleared). */
export async function deleteTenantProduct(tenantId: string, id: string): Promise<ProductResult> {
  const me = await requireSuperadmin();
  if (!uuid.safeParse(tenantId).success || !uuid.safeParse(id).success) return { status: "error", message: "Invalid product." };
  const admin = createAdminClient();
  const { data, error } = await admin.from("inventory_items").delete().eq("id", id).eq("tenant_id", tenantId).select("sku, name");
  if (error) {
    console.error("admin product delete failed:", error);
    return { status: "error", message: "We couldn't delete this product. Please try again." };
  }
  if (!data.length) return { status: "error", message: "This product no longer exists." };
  await audit({ adminId: me.userId, action: "product.delete", tenantId, details: { id, sku: data[0].sku, name: data[0].name } });
  refresh();
  return { status: "success" };
}

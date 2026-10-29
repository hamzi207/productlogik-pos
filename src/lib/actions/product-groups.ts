"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { GROUP_SELECT, ITEM_SELECT, mapGroup, mapItem, type GroupRow, type ItemRow } from "@/lib/inventory-rows";
import { planLimitMessage } from "@/lib/plan-limits";
import { imagePaths, PRODUCT_IMAGE_BUCKET } from "@/lib/product-images";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database.types";
import type { ProductGroupEntry } from "@/lib/types/inventory";
import { productGroupSchema, type ProductGroupInput } from "@/lib/validations/product-group.schema";

// Phase 21: product groups and their variants. Everything is saved by save_product_group in one transaction
// with the caller's session (RLS keeps it to their organization; stock goes through private.set_item_stock).

export type ProductGroupResult =
  | { status: "success"; id: string }
  | { status: "error"; message: string; field?: string };

const idSchema = z.uuid();

/** A group with its options, images and active variants, or null when it doesn't exist. */
export async function getProductGroup(id: string): Promise<ProductGroupEntry | null> {
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const [group, variants] = await Promise.all([
    supabase.from("product_groups").select(GROUP_SELECT).eq("id", id).eq("is_archived", false).overrideTypes<GroupRow[], { merge: false }>(),
    supabase.from("inventory_items").select(ITEM_SELECT).eq("group_id", id).eq("is_archived", false).overrideTypes<ItemRow[], { merge: false }>(),
  ]);
  if (group.error || variants.error) {
    console.error("getProductGroup failed:", (group.error ?? variants.error)?.message);
    throw new Error("Could not load this product.");
  }
  const row = group.data?.[0];
  return row ? mapGroup(row, (variants.data ?? []).map(mapItem)) : null;
}

/** "Key (tenant_id, sku)=(…, POLO-RED-L) already exists." → POLO-RED-L */
const duplicateValue = (details: string | null | undefined) => details?.match(/=\([^,]+, ([^)]+)\)/)?.[1] ?? null;

function saveError(error: { code?: string; message: string; details?: string | null }, input: ProductGroupInput): ProductGroupResult & { status: "error" } {
  const limit = planLimitMessage(error);
  if (limit) return { status: "error", message: limit };
  switch (error.code) {
    case "23505": {
      if (error.message.includes("product_groups_name_key")) return { status: "error", field: "name", message: `A product called ${input.name} already exists.` };
      if (error.message.includes("uq_tenant_sku")) {
        const sku = duplicateValue(error.details);
        return { status: "error", field: "variants", message: sku ? `SKU ${sku} is already used by another product.` : "One of these SKUs is already used by another product." };
      }
      if (error.message.includes("inventory_items_barcode_key") || /barcode/i.test(error.message)) {
        const code = duplicateValue(error.details);
        return { status: "error", field: "variants", message: code ? `Barcode ${code} is already used by another product or pack.` : error.message };
      }
      if (error.message.includes("inventory_items_variant_key")) return { status: "error", field: "variants", message: "Two variants have the same options." };
      break;
    }
    // Written for people: stock still on hand, products in kits, options once there are variants, stock rules.
    case "22023":
    case "23514":
    case "23503":
    case "55000":
      return { status: "error", field: error.message.includes("option") ? "options" : "variants", message: error.message };
    case "40001":
    case "P0002":
      return { status: "error", message: error.message };
    case "42501":
      return { status: "error", message: /store/i.test(error.message) ? error.message : "Your session has expired. Please sign in again." };
  }
  console.error("saveProductGroup failed:", error);
  return { status: "error", message: "We couldn't save this product. Please try again." };
}

/** Creates (no id) or saves a group, its options and its variants. */
export async function saveProductGroup(id: string | null, input: ProductGroupInput): Promise<ProductGroupResult> {
  if (id && !idSchema.safeParse(id).success) return { status: "error", message: "Invalid product." };
  const parsed = productGroupSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: "error", message: issue?.message ?? "Check the highlighted fields.", field: String(issue?.path[0] ?? "") };
  }
  const g = parsed.data;
  const payload = {
    id,
    name: g.name,
    sku_prefix: g.skuPrefix,
    description: g.description,
    vendor_name: g.vendorName,
    category_id: g.categoryId,
    base_uom_id: g.baseUomId,
    cost_price: g.costPrice,
    selling_price: g.sellingPrice,
    low_stock_threshold: g.lowStockThreshold,
    price_includes_tax: g.priceIncludesTax,
    is_universal: g.isUniversal,
    vehicle_ids: g.isUniversal ? [] : g.vehicleIds,
    attributes: g.attributes,
    options: g.options.map((o) => ({ id: o.id, name: o.name, values: o.values.map((v) => ({ id: v.id, value: v.value, price_delta: v.priceDelta })) })),
    variants: g.variants.map((v) => ({
      id: v.id,
      values: v.values,
      sku: v.sku,
      barcode: v.barcode,
      selling_price: v.sellingPrice,
      cost_price: v.costPrice,
      low_stock_threshold: v.lowStockThreshold,
      enabled: v.enabled,
      stock: v.stock.filter((s) => s.onHand !== null).map((s) => ({ store_id: s.storeId, on_hand: s.onHand })),
    })),
  };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_product_group", { p_group: payload as unknown as Json });
  if (error) return saveError(error, g);
  refresh();
  return { status: "success", id: data };
}

/**
 * Deletes a group: each variant is deleted, or archived when it's on documents or has stock history (old
 * documents still print). Refused while a variant has stock or is in a kit.
 */
export async function deleteProductGroup(id: string): Promise<{ status: "success"; outcome: "deleted" | "archived" } | { status: "error"; message: string }> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid product." };
  const supabase = await createClient();
  const { data: images } = await supabase.from("product_images").select("url").eq("group_id", id);
  const { data, error } = await supabase.rpc("delete_product_group", { p_group: id });
  if (error) {
    if (["23514", "P0002"].includes(error.code ?? "")) return { status: "error", message: error.message };
    console.error("deleteProductGroup failed:", error);
    return { status: "error", message: "We couldn't delete this product. Please try again." };
  }
  // RF-21.2: a deleted group's image files go too (an archived one keeps them for its old documents).
  if (data === "deleted") {
    const paths = (images ?? []).flatMap((i) => imagePaths(i.url));
    if (paths.length) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(paths);
  }
  refresh();
  return { status: "success", outcome: data === "archived" ? "archived" : "deleted" };
}

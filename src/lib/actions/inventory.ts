"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { buildCategoryIndex, descendantIds } from "@/lib/categories";
import { getAttributes, getCategories } from "@/lib/category-data";
import { isRangePastEnd, pageRange, type Paged, type Pagination } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { planLimitMessage } from "@/lib/plan-limits";
import { getStoreContext } from "@/lib/store";
import { GROUP_SELECT, ITEM_SELECT, mapGroup, mapItem, type GroupRow, type ItemRow } from "@/lib/inventory-rows";
import { imagePaths, PRODUCT_IMAGE_BUCKET } from "@/lib/product-images";
import type { InventoryEntry, InventoryListItem } from "@/lib/types/inventory";
import {
  inventoryFiltersSchema,
  inventoryItemSchema,
  type InventoryFilters,
  type InventoryItemInput,
} from "@/lib/validations/inventory.schema";

// Every query below runs with the caller's session, so RLS limits it to their
// own shop. tenant_id is never taken from the client.

export type InventoryActionResult =
  | { status: "success"; id: string }
  | { status: "error"; message: string; field?: keyof InventoryItemInput };

const itemIdSchema = z.uuid();

export type InventoryPage = Paged<InventoryEntry> & {
  /** Low-stock rows among everything matching the filters (not just this page). */
  lowStock: number;
};

/**
 * One page of the organization's products. Every filter and sort runs in SQL (inventory_list, Phase 21), so
 * the page and the counts agree. Grouped (the default): one row per product, kit or product group, with a
 * group's stock rolled up from its variants; flat: one row per SKU. Each row on the page is then loaded
 * with its fitment, units, stock per store, images and kit components (and a group with its variants).
 */
export async function getInventoryItems(
  filters: InventoryFilters = {},
  pagination: Pagination = { page: 1, limit: 25 },
  /** Phase 20: stock, store prices and low-stock levels at this store; null = organization totals. */
  storeId: string | null = null,
): Promise<InventoryPage> {
  const { category, search, fitment, stock, sort, attributes, view } = inventoryFiltersSchema.parse(filters);
  const supabase = await createClient();

  // Attribute filters: a list option matches the stored text; "no" on a yes/no attribute also matches
  // items that never had it set. Keys that aren't list or yes/no attributes are ignored.
  const definitions = attributes && Object.keys(attributes).length ? await getAttributes() : [];
  const attributeFilters = Object.entries(attributes ?? {}).flatMap(([key, value]) => {
    const def = definitions.find((a) => a.key === key && (a.type === "select" || a.type === "boolean"));
    return def ? [{ key, type: def.type, value }] : [];
  });

  // The category and everything below it; an unknown id matches nothing.
  let categoryIds: string[] | null = null;
  if (category) {
    const node = buildCategoryIndex(await getCategories()).byId.get(category);
    categoryIds = node ? descendantIds(node) : [category];
  }

  // A builder is single-use, hence a function: the page, the low-stock count and the past-the-end retry each build one.
  const build = (head = false, stockFilter = stock) => {
    let query = supabase
      .rpc("inventory_list", { p_store_id: storeId ?? undefined, p_grouped: view !== "flat", p_query: search }, { count: "exact", head })
      .select("*");
    if (categoryIds) query = query.in("category_id", categoryIds);
    if (fitment) query = query.eq("is_universal", fitment === "universal");
    if (stockFilter === "in") query = query.gt("available_quantity", 0);
    else if (stockFilter === "out") query = query.lte("available_quantity", 0);
    else if (stockFilter === "low") query = query.eq("is_low_stock", true);
    for (const f of attributeFilters) {
      if (f.type === "select") query = query.eq(`attributes->>${f.key}`, f.value);
      else if (f.value === "yes") query = query.eq(`attributes->${f.key}`, true);
      else query = query.or(`attributes->${f.key}.is.null,attributes->${f.key}.eq.false`);
    }
    return query;
  };

  const ordered = () => {
    const query = build();
    switch (sort) {
      case "newest":
        return query.order("created_at", { ascending: false }).order("id");
      case "stock":
        return query.order("available_quantity").order("name").order("id");
      case "price-high":
        return query.order("selling_price", { ascending: false }).order("name").order("id");
      case "price-low":
        return query.order("selling_price").order("name").order("id");
      default:
        return query.order("name").order("id");
    }
  };

  const { from, to } = pageRange(pagination);
  const [pageResult, lowResult] = await Promise.all([ordered().range(from, to), build(true, "low")]);

  let { data, count, error } = pageResult;
  if (isRangePastEnd(error)) {
    // Asked for a page past the end: report the total so the page can redirect.
    ({ data, count, error } = await ordered().range(0, 0));
    data = [];
  }
  if (error || lowResult.error) {
    console.error("getInventoryItems failed:", (error ?? lowResult.error)?.message);
    throw new Error("Could not load inventory.");
  }

  const page = data ?? [];
  const itemIds = page.filter((r) => r.kind !== "group").map((r) => r.id!);
  const groupIds = page.filter((r) => r.kind === "group").map((r) => r.id!);
  const [items, groups, variants] = await Promise.all([
    itemIds.length ? supabase.from("inventory_items").select(ITEM_SELECT).in("id", itemIds).overrideTypes<ItemRow[], { merge: false }>() : null,
    groupIds.length ? supabase.from("product_groups").select(GROUP_SELECT).in("id", groupIds).overrideTypes<GroupRow[], { merge: false }>() : null,
    groupIds.length
      ? supabase.from("inventory_items").select(ITEM_SELECT).in("group_id", groupIds).eq("is_archived", false).overrideTypes<ItemRow[], { merge: false }>()
      : null,
  ]);
  const failed = items?.error ?? groups?.error ?? variants?.error;
  if (failed) {
    console.error("getInventoryItems failed:", failed.message);
    throw new Error("Could not load inventory.");
  }

  const itemById = new Map((items?.data ?? []).map((row) => [row.id, mapItem(row)]));
  const byGroup = new Map<string, InventoryListItem[]>();
  for (const row of variants?.data ?? []) {
    const list = byGroup.get(row.group_id!) ?? [];
    list.push(mapItem(row));
    byGroup.set(row.group_id!, list);
  }
  const groupById = new Map((groups?.data ?? []).map((row) => [row.id, mapGroup(row, byGroup.get(row.id) ?? [])]));
  // In the page's order; a row removed between the two reads is skipped.
  const rows: InventoryEntry[] = page.flatMap((r): InventoryEntry[] => {
    if (r.kind === "group") {
      const group = groupById.get(r.id!);
      return group ? [{ kind: "group", group }] : [];
    }
    const item = itemById.get(r.id!);
    return item ? [{ kind: "item", item }] : [];
  });

  return { rows, total: count ?? 0, lowStock: lowResult.count ?? 0, ...pagination };
}

/** Creates (no id) or updates an item and its vehicle fitment in one transaction. */
async function saveInventoryItem(id: string | undefined, input: InventoryItemInput): Promise<InventoryActionResult> {
  const parsed = inventoryItemSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: issue?.message ?? "Check the highlighted fields.",
      field: issue?.path[0] as keyof InventoryItemInput | undefined,
    };
  }
  const item = parsed.data;

  const supabase = await createClient();
  // Phase 20: the stock entered is the current store's.
  const { current } = await getStoreContext();
  const { data, error } = await supabase.rpc("save_inventory_item", {
    p_item_id: id,
    p_store_id: current.id,
    p_store_settings: item.storeSettings?.map((s) => ({
      store_id: s.storeId,
      selling_price: s.sellingPrice,
      low_stock_threshold: s.lowStockThreshold,
    })),
    p_sku: item.sku,
    p_name: item.name,
    p_description: item.description || undefined,
    p_category_id: item.categoryId,
    p_cost_price: item.costPrice,
    p_selling_price: item.sellingPrice,
    // A kit has no stock of its own (RF-21.1); the database ignores it.
    p_quantity_on_hand: item.isKit ? 0 : item.quantityOnHand,
    p_low_stock_threshold: item.lowStockThreshold,
    p_is_universal: item.isUniversal,
    p_price_includes_tax: item.priceIncludesTax,
    p_vendor_name: item.vendorName || undefined,
    p_vehicle_ids: item.isUniversal ? [] : item.vehicleIds,
    p_attributes: item.attributes,
    p_base_uom_id: item.baseUomId,
    p_purchase_uom_id: item.purchaseUomId ?? undefined,
    p_sale_uom_id: item.saleUomId ?? undefined,
    p_barcode: item.barcode,
    p_is_kit: item.isKit,
    p_kit_components: item.isKit ? item.kitComponents.map((c) => ({ item_id: c.itemId, quantity: c.quantity })) : [],
    p_conversions: item.conversions.map((c, i) => ({
      uom_id: c.uomId,
      factor: c.factor,
      selling_price: c.sellingPrice,
      barcode: c.barcode || null,
      sort_order: i,
    })),
  });

  if (error) {
    const limit = planLimitMessage(error);
    if (limit) return { status: "error", message: limit };
    switch (error.code) {
      case "23505":
        // Phase 21: the product's own barcode, or a pack's (one product or pack per code).
        if (error.message.includes("inventory_items_barcode_key") || (item.barcode && error.message.includes(item.barcode))) {
          return { status: "error", field: "barcode", message: `Barcode ${item.barcode} is already used by another product or pack.` };
        }
        if (error.message.includes("barcode")) {
          return { status: "error", field: "conversions", message: "One of these barcodes is already used by another product." };
        }
        return { status: "error", field: "sku", message: `SKU ${item.sku} is already used by another item.` };
      case "23514":
        // Phase 20: stock at the store can't go below what its open quotations reserved.
        if (error.message.includes("reserved on quotations") || error.message.includes("Not enough stock")) {
          return { status: "error", field: "quantityOnHand", message: error.message };
        }
        if (error.message.includes("inventory_reserved_within_stock")) {
          return {
            status: "error",
            field: "quantityOnHand",
            message: "Stock on hand can't go below what open quotations have reserved. Cancel or invoice those quotations first.",
          };
        }
        // RF-21.1 kit rules (no kits in kits, switched-off products) explain themselves.
        if (/kit/i.test(error.message)) return { status: "error", field: "kitComponents", message: error.message };
        // Unit rules (base unit already on documents, purchase / sale unit) explain themselves.
        if (error.message.includes("base unit")) return { status: "error", field: "baseUomId", message: error.message };
        if (error.message.includes("unit") || error.message.includes("pack")) return { status: "error", field: "conversions", message: error.message };
        console.error("saveInventoryItem failed:", error);
        return { status: "error", message: "We couldn't save this item. Please try again." };
      case "23503":
        if (error.message.includes("uom")) {
          return { status: "error", field: "baseUomId", message: "That unit no longer exists. Choose another one." };
        }
        if (error.message.includes("inventory_items_category_fkey")) {
          return { status: "error", field: "categoryId", message: "That category no longer exists. Choose another one." };
        }
        if (error.message.includes("category")) return { status: "error", field: "categoryId", message: error.message };
        return { status: "error", field: "vehicleIds", message: "One of the selected vehicles no longer exists. Remove it and try again." };
      case "22023":
        // Fitment, archived-category and attribute checks explain themselves.
        if (error.message.startsWith("Vehicle")) return { status: "error", field: "vehicleIds", message: error.message };
        if (/kit/i.test(error.message)) return { status: "error", field: "kitComponents", message: error.message };
        if (error.message.includes("category")) return { status: "error", field: "categoryId", message: error.message };
        // "pcs is counted in whole numbers." and similar decimal-place rules.
        if (/whole numbers|decimal places/.test(error.message)) return { status: "error", field: "quantityOnHand", message: error.message };
        if (error.message.includes("unit")) return { status: "error", field: "baseUomId", message: error.message };
        return { status: "error", message: error.message };
      case "23502":
        // A required attribute left empty.
        return { status: "error", message: error.message };
      case "P0002":
        return { status: "error", message: "This item no longer exists. It may have been deleted." };
      case "55000":
        // Variants are edited through their group; kits and products can't swap once on documents.
        return { status: "error", message: error.message };
      case "42501":
        // Store prices (admins only) and stock in a store the member doesn't work in explain themselves.
        if (/store/i.test(error.message)) return { status: "error", message: error.message };
        return { status: "error", message: "Your session has expired. Please sign in again." };
      default:
        console.error("saveInventoryItem failed:", error);
        return { status: "error", message: "We couldn't save this item. Please try again." };
    }
  }

  refresh();
  return { status: "success", id: data };
}

export async function createInventoryItem(input: InventoryItemInput) {
  return saveInventoryItem(undefined, input);
}

export async function updateInventoryItem(id: string, input: InventoryItemInput) {
  if (!itemIdSchema.safeParse(id).success) {
    return { status: "error", message: "Invalid item." } satisfies InventoryActionResult;
  }
  return saveInventoryItem(id, input);
}

/**
 * Deletes an item; its vehicle links, images and (kits) components cascade. Quote lines that used it keep
 * their description and prices (quote_items.item_id is set to null). A product that's in a kit can't be
 * deleted, and a variant is switched off through its group instead.
 */
export async function deleteInventoryItem(id: string): Promise<InventoryActionResult> {
  if (!itemIdSchema.safeParse(id).success) {
    return { status: "error", message: "Invalid item." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("inventory_items").select("group_id, product_images!product_images_item_fkey(url)").eq("id", id).maybeSingle();
  if (before?.group_id) {
    return { status: "error", message: "This is a variant. Switch it off in its product group instead." };
  }
  const { data, error } = await supabase.from("inventory_items").delete().eq("id", id).select("id");

  if (error) {
    if (error.code === "23503" && error.message.includes("kit_components")) {
      const { data: kits } = await supabase
        .from("kit_components")
        .select("kit:inventory_items!kit_components_kit_fkey(name)")
        .eq("component_id", id)
        .limit(3);
      const names = (kits ?? []).flatMap((k) => (k.kit ? [k.kit.name] : []));
      return { status: "error", message: `It's in ${names.length ? names.join(", ") : "a kit"}. Take it out of the kit first.` };
    }
    console.error("deleteInventoryItem failed:", error);
    return { status: "error", message: "We couldn't delete this item. Please try again." };
  }
  if (data.length === 0) {
    return { status: "error", message: "This item no longer exists. It may have been deleted." };
  }
  // RF-21.2: its image files go too (the rows went with the product).
  const paths = (before?.product_images ?? []).flatMap((i) => imagePaths(i.url));
  if (paths.length) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(paths);

  refresh();
  return { status: "success", id };
}

"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { buildCategoryIndex, descendantIds } from "@/lib/categories";
import { getAttributes, getCategories } from "@/lib/category-data";
import { isRangePastEnd, pageRange, type Paged, type Pagination } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { planLimitMessage } from "@/lib/plan-limits";
import { getStoreContext } from "@/lib/store";
import type { Tables } from "@/lib/types/database.types";
import type { InventoryListItem } from "@/lib/types/inventory";
import { ITEM_STOCK_EMBED, mapItemStock, type ItemStockRow } from "@/lib/stock";
import { ITEM_UNITS_EMBED, type BaseUnit, type ItemConversion } from "@/lib/uom";
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

const ITEM_WITH_FITMENT = `*, item_vehicle_compatibility(vehicles(id, year, make, model, trim)), ${ITEM_UNITS_EMBED}, ${ITEM_STOCK_EMBED}`;

type InventoryRow = Tables<"inventory_items"> & {
  item_vehicle_compatibility: { vehicles: InventoryListItem["vehicles"][number] | null }[];
  base_uom: BaseUnit | null;
  item_uom_conversions: ItemConversion[];
} & ItemStockRow;

export type InventoryPage = Paged<InventoryListItem> & {
  /** Low-stock parts among everything matching the filters (not just this page). */
  lowStock: number;
};

/**
 * One page of the shop's parts. Every filter and sort runs in SQL, so the page and
 * the counts agree; available / low stock are generated columns (Phase 9 migration).
 */
export async function getInventoryItems(
  filters: InventoryFilters = {},
  pagination: Pagination = { page: 1, limit: 25 },
  /** Phase 20: the stock filters and low-stock count use this store's stock; null = organization totals. */
  storeId: string | null = null,
): Promise<InventoryPage> {
  const { category, search, fitment, stock, sort, attributes } = inventoryFiltersSchema.parse(filters);
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

  // Search runs in SQL (search_inventory_items) because it has to match SKU, name,
  // category and linked vehicles together. It returns inventory_items rows, so the
  // fitment embed, filters and ordering still apply. A builder is single-use, hence
  // a function: the page, the low-stock count and the past-the-end retry each build one.
  const build = (columns: string, head = false, stockFilter = stock) => {
    let query = storeId
      ? supabase.rpc("inventory_items_at_store", { p_store_id: storeId, p_stock: stockFilter, p_query: search }, { count: "exact", head }).select(columns)
      : search
        ? supabase.rpc("search_inventory_items", { p_query: search }, { count: "exact", head }).select(columns)
        : supabase.from("inventory_items").select(columns, { count: "exact", head });
    if (categoryIds) query = query.in("category_id", categoryIds);
    if (fitment) query = query.eq("is_universal", fitment === "universal");
    if (!storeId) {
      if (stockFilter === "in") query = query.gt("available_quantity", 0);
      else if (stockFilter === "out") query = query.lte("available_quantity", 0);
      else if (stockFilter === "low") query = query.eq("is_low_stock", true);
    }
    for (const f of attributeFilters) {
      if (f.type === "select") query = query.eq(`attributes->>${f.key}`, f.value);
      else if (f.value === "yes") query = query.eq(`attributes->${f.key}`, true);
      else query = query.or(`attributes->${f.key}.is.null,attributes->${f.key}.eq.false`);
    }
    return query;
  };

  const ordered = () => {
    const query = build(ITEM_WITH_FITMENT);
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
  const [pageResult, lowResult] = await Promise.all([
    ordered().range(from, to).overrideTypes<InventoryRow[], { merge: false }>(),
    build("id", true, "low"),
  ]);

  let { data, count, error } = pageResult;
  if (isRangePastEnd(error)) {
    // Asked for a page past the end: report the total so the page can redirect.
    ({ data, count, error } = await ordered().range(0, 0).overrideTypes<InventoryRow[], { merge: false }>());
    data = [];
  }
  if (error || lowResult.error) {
    console.error("getInventoryItems failed:", (error ?? lowResult.error)?.message);
    throw new Error("Could not load inventory.");
  }

  const rows: InventoryListItem[] = (data ?? []).map(({ item_vehicle_compatibility, item_uom_conversions, stock_levels, store_item_prices, ...item }) => ({
    ...item,
    ...mapItemStock({ stock_levels, store_item_prices }),
    quantity_on_hand: Number(item.quantity_on_hand),
    reserved_quantity: Number(item.reserved_quantity),
    low_stock_threshold: Number(item.low_stock_threshold),
    available_quantity: item.available_quantity === null ? null : Number(item.available_quantity),
    conversions: item_uom_conversions
      .map((c) => ({ ...c, factor: Number(c.factor), selling_price: c.selling_price === null ? null : Number(c.selling_price) }))
      .sort((a, b) => a.sort_order - b.sort_order),
    vehicles: item_vehicle_compatibility
      .flatMap((link) => (link.vehicles ? [link.vehicles] : []))
      .sort((a, b) => b.year - a.year || a.make.localeCompare(b.make) || a.model.localeCompare(b.model)),
  }));

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
    p_quantity_on_hand: item.quantityOnHand,
    p_low_stock_threshold: item.lowStockThreshold,
    p_is_universal: item.isUniversal,
    p_price_includes_tax: item.priceIncludesTax,
    p_vendor_name: item.vendorName || undefined,
    p_vehicle_ids: item.isUniversal ? [] : item.vehicleIds,
    p_attributes: item.attributes,
    p_base_uom_id: item.baseUomId,
    p_purchase_uom_id: item.purchaseUomId ?? undefined,
    p_sale_uom_id: item.saleUomId ?? undefined,
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
 * Deletes an item; its vehicle links cascade. Quote lines that used it keep
 * their description and prices (quote_items.item_id is set to null).
 */
export async function deleteInventoryItem(id: string): Promise<InventoryActionResult> {
  if (!itemIdSchema.safeParse(id).success) {
    return { status: "error", message: "Invalid item." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("inventory_items").delete().eq("id", id).select("id");

  if (error) {
    console.error("deleteInventoryItem failed:", error);
    return { status: "error", message: "We couldn't delete this item. Please try again." };
  }
  if (data.length === 0) {
    return { status: "error", message: "This item no longer exists. It may have been deleted." };
  }

  refresh();
  return { status: "success", id };
}

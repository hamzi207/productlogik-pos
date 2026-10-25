// Stock per store (Phase 20). Shared by server and client components.
import type { StoreStock } from "@/lib/stores";

/** PostgREST embed for a product's stock per store and store prices (use on inventory_items selects). */
export const ITEM_STOCK_EMBED = "stock_levels(store_id, on_hand, reserved, low_stock_threshold), store_item_prices(store_id, selling_price)";

export type ItemStockRow = {
  stock_levels: { store_id: string; on_hand: number; reserved: number; low_stock_threshold: number | null }[];
  store_item_prices: { store_id: string; selling_price: number }[];
};

/** Numbers from the embed (numeric columns can arrive as strings). */
export function mapItemStock(row: ItemStockRow): { stock: StoreStock[]; store_prices: { store_id: string; selling_price: number }[] } {
  return {
    stock: (row.stock_levels ?? []).map((l) => ({
      store_id: l.store_id,
      on_hand: Number(l.on_hand),
      reserved: Number(l.reserved),
      low_stock_threshold: l.low_stock_threshold === null ? null : Number(l.low_stock_threshold),
    })),
    store_prices: (row.store_item_prices ?? []).map((p) => ({ store_id: p.store_id, selling_price: Number(p.selling_price) })),
  };
}

/** One store's stock of a product (zero when it never had any there). */
export function stockAt(stock: StoreStock[], storeId: string) {
  const level = stock.find((l) => l.store_id === storeId);
  const onHand = level?.on_hand ?? 0;
  const reserved = level?.reserved ?? 0;
  return { onHand, reserved, available: onHand - reserved, threshold: level?.low_stock_threshold ?? null };
}

/** Available stock in every store but one. */
export const availableElsewhere = (stock: StoreStock[], storeId: string) =>
  stock.filter((l) => l.store_id !== storeId).reduce((sum, l) => sum + (l.on_hand - l.reserved), 0);

/** The selling price at a store: its own price (RF-20.1) or the product's. */
export const priceAt = (item: { selling_price: number; store_prices?: { store_id: string; selling_price: number }[] }, storeId: string | null) =>
  (storeId ? item.store_prices?.find((p) => p.store_id === storeId)?.selling_price : undefined) ?? Number(item.selling_price);

/** What the inventory, line search and details panel need to show stock by store. */
export type StoreView = {
  /** More than one active store; else everything shows organization totals as in V1. */
  multi: boolean;
  currentId: string;
  currentName: string;
  /** Every store (switched-off ones too), main first. */
  stores: { id: string; name: string; is_active: boolean }[];
  /** Organization admin: sets store prices and per-store low-stock levels (RF-20.1). */
  admin: boolean;
};

/** One organization, one store: everything shows as in V1. */
export const SINGLE_STORE: StoreView = { multi: false, currentId: "", currentName: "", stores: [], admin: false };

/** The store a document belongs to and what its lines may do (Phase 20). */
export type DocumentStores = {
  /** More than one active store; else no store appears on documents (as in V1). */
  multi: boolean;
  docStoreId: string;
  docStoreName: string;
  /** Store names by id (every store, so old lines still name theirs). */
  names: Record<string, string>;
  /** Active stores, main first: where a line can take its stock from. */
  active: string[];
  /** Lines may take stock from another store (Settings → Stores, and the member's role). */
  crossStore: boolean;
  /** The member works in the document's store; else it opens read-only. */
  canWork: boolean;
  /** The document's store is the member's current store; else editing asks to switch first. */
  isCurrent: boolean;
};

export const SINGLE_DOCUMENT_STORE: DocumentStores = { multi: false, docStoreId: "", docStoreName: "", names: {}, active: [], crossStore: false, canWork: true, isCurrent: true };

/** The store (other than `except`) with the most available stock, if any has some. */
export function bestElsewhere(storeStock: Record<string, number> | null, except: string | null) {
  let best: { storeId: string; available: number } | null = null;
  for (const [storeId, available] of Object.entries(storeStock ?? {})) {
    if (storeId !== except && available > 0 && (!best || available > best.available)) best = { storeId, available };
  }
  return best;
}

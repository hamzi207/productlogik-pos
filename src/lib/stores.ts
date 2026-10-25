// Stores (Phase 20). Shared by server and client components.

/** One of the organization's stores (public.stores). */
export type Store = {
  id: string;
  name: string;
  /** Short code, the numbering prefix with per-store numbering (RF-20.2), e.g. LHR1. */
  code: string | null;
  address: string | null;
  phone: string | null;
  ntn: string | null;
  strn: string | null;
  is_main: boolean;
  is_active: boolean;
  sort_order: number;
};

export const STORE_COLUMNS = "id, name, code, address, phone, ntn, strn, is_main, is_active, sort_order";

/** The member's current store (validated against their work stores on every request). */
export const STORE_COOKIE = "productlogik_store";

/** Lists, dashboard and reports: `?store=all` shows every store (members who can see them all). */
export const ALL_STORES = "all";

/** Stock of one product at one store (public.stock_levels). */
export type StoreStock = {
  store_id: string;
  on_hand: number;
  reserved: number;
  low_stock_threshold: number | null;
};

/** "Main Store (LHR1)" */
export const storeLabel = (s: Pick<Store, "name" | "code">) => (s.code ? `${s.name} (${s.code})` : s.name);

/** Main store first, then the admin's order, then by name. */
export function sortStores<T extends Pick<Store, "is_main" | "sort_order" | "name">>(stores: T[]): T[] {
  return [...stores].sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

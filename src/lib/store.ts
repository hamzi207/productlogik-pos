import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getShopSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DocumentStores, StoreView } from "@/lib/stock";
import { ALL_STORES, STORE_COLUMNS, STORE_COOKIE, sortStores, type Store } from "@/lib/stores";

export type StoreContext = {
  /** Every store of the organization (switched-off ones too), main first. */
  stores: Store[];
  /** Active stores this member can work in (admins: all active stores). */
  workStores: Store[];
  /**
   * Where new documents go and whose stock they invoice: the store picked in the top bar if the member
   * can still work there, else their default store, else their first work store. Falls back to the main
   * store for viewing when a member has no work store (the database then refuses new documents).
   */
  current: Store;
  /** False when `current` is only the viewing fallback. */
  canWorkHere: boolean;
  /** "All stores" in lists, the dashboard and reports: admins and members of more than one store. */
  canSeeAll: boolean;
  /** More than one active store: store columns, the switcher and store filters appear. */
  multi: boolean;
};

/**
 * The member's stores and current store (Phase 20). Reads cookies, so render inside <Suspense>.
 * Deduplicated per request. The cookie only chooses among the stores the database says the member
 * can work in (public.my_work_stores), so a stale or forged value is ignored.
 */
export const getStoreContext = cache(async (): Promise<StoreContext> => {
  const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
  // One round trip: the stores don't wait for the session (RLS scopes them by the same sign-in).
  const [session, stores, work] = await Promise.all([
    getShopSession(),
    supabase.from("stores").select(STORE_COLUMNS),
    supabase.rpc("my_work_stores"),
  ]);
  if (stores.error) {
    console.error("getStoreContext stores failed:", stores.error.message);
    throw new Error("Could not load stores.");
  }
  const all = sortStores(stores.data);
  const workIds = new Set(work.data ?? []);
  const workStores = all.filter((s) => workIds.has(s.id));
  const wanted = cookieStore.get(STORE_COOKIE)?.value;
  const picked =
    workStores.find((s) => s.id === wanted) ??
    workStores.find((s) => s.id === session.defaultStoreId) ??
    workStores[0];
  const current = picked ?? all.find((s) => s.is_main) ?? all[0];
  if (!current) throw new Error("This organization has no store.");
  return {
    stores: all,
    workStores,
    current,
    canWorkHere: Boolean(picked),
    canSeeAll: session.role === "admin" || workStores.length > 1,
    multi: all.filter((s) => s.is_active).length > 1,
  };
});

/**
 * The store a list / dashboard / report shows: the current store, or null for all stores when the
 * page asks for `?store=all` and the member may see them all. Single-store organizations: null (all).
 */
export async function storeFilter(param: string | string[] | undefined): Promise<{ storeId: string | null; all: boolean }> {
  const ctx = await getStoreContext();
  if (!ctx.multi) return { storeId: null, all: true };
  if (param === ALL_STORES && ctx.canSeeAll) return { storeId: null, all: true };
  return { storeId: ctx.current.id, all: false };
}

/** The slim store view client components get (inventory, line search, product details). */
export async function getStoreView(): Promise<StoreView> {
  const [ctx, session] = await Promise.all([getStoreContext(), getShopSession()]);
  return {
    multi: ctx.multi,
    currentId: ctx.current.id,
    currentName: ctx.current.name,
    stores: ctx.stores.map(({ id, name, is_active }) => ({ id, name, is_active })),
    admin: session.role === "admin",
  };
}

/**
 * A document's store (`docStoreId`; null = a new document, which goes to the current store), whether the
 * member can change it, and whether its lines may take stock from other stores.
 */
export async function getDocumentStores(docStoreId: string | null): Promise<DocumentStores> {
  const [ctx, session, supabase] = await Promise.all([getStoreContext(), getShopSession(), createClient()]);
  const store = (docStoreId && ctx.stores.find((s) => s.id === docStoreId)) || ctx.current;
  const { data: tenant } = await supabase
    .from("tenants")
    .select("allow_cross_store_invoicing, cross_store_invoicing_roles")
    .eq("id", session.tenant.id)
    .maybeSingle();
  // Managers arrive with roles (Phase 22); until then "managers" means admins, as in the database.
  const allowed = Boolean(tenant?.allow_cross_store_invoicing) && (tenant?.cross_store_invoicing_roles === "all" || session.role === "admin");
  return {
    multi: ctx.multi,
    docStoreId: store.id,
    docStoreName: store.name,
    names: Object.fromEntries(ctx.stores.map((s) => [s.id, s.name])),
    active: ctx.stores.filter((s) => s.is_active).map((s) => s.id),
    crossStore: ctx.multi && allowed,
    canWork: ctx.workStores.some((s) => s.id === store.id),
    isCurrent: store.id === ctx.current.id,
  };
}

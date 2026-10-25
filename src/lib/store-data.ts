import "server-only";
import { getPlanLimits } from "@/lib/plan-limits-data";
import { requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { STORE_COLUMNS, sortStores, type Store } from "@/lib/stores";

export type StoreRow = Store & {
  /** Products with this store's own price (RF-20.1). */
  priced: number;
};

export type StoreMember = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "staff";
  storeIds: string[];
  defaultStoreId: string | null;
};

export type StoresSettings = {
  stores: StoreRow[];
  settings: { allowCrossStore: boolean; crossStoreRoles: "managers" | "all"; numberPerStore: boolean };
  /** Active members (admins work in every store; staff in the stores they're given). */
  members: StoreMember[];
  /** Open stores the subscription allows (null = no limit). */
  storeLimit: number | null;
};

type Client = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

async function load(client: Client, tenantId: string): Promise<StoresSettings> {
  const [stores, tenant, prices, profiles, access, limits] = await Promise.all([
    client.from("stores").select(STORE_COLUMNS).eq("tenant_id", tenantId),
    client.from("tenants").select("allow_cross_store_invoicing, cross_store_invoicing_roles, number_per_store").eq("id", tenantId).single(),
    client.from("store_item_prices").select("store_id").eq("tenant_id", tenantId),
    client.from("profiles").select("id, full_name, email, role, default_store_id").eq("tenant_id", tenantId).is("deactivated_at", null).order("full_name"),
    client.from("profile_stores").select("profile_id, store_id").eq("tenant_id", tenantId),
    getPlanLimits(tenantId),
  ]);
  if (stores.error || tenant.error) throw new Error(`stores: ${(stores.error ?? tenant.error)?.message}`);
  const priced = new Map<string, number>();
  for (const p of prices.data ?? []) priced.set(p.store_id, (priced.get(p.store_id) ?? 0) + 1);
  const byMember = new Map<string, string[]>();
  for (const a of access.data ?? []) byMember.set(a.profile_id, [...(byMember.get(a.profile_id) ?? []), a.store_id]);
  return {
    stores: sortStores(stores.data).map((s) => ({ ...s, priced: priced.get(s.id) ?? 0 })),
    settings: {
      allowCrossStore: tenant.data.allow_cross_store_invoicing,
      crossStoreRoles: tenant.data.cross_store_invoicing_roles === "all" ? "all" : "managers",
      numberPerStore: tenant.data.number_per_store,
    },
    members: (profiles.data ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      role: p.role === "admin" ? "admin" : "staff",
      storeIds: byMember.get(p.id) ?? [],
      defaultStoreId: p.default_store_id,
    })),
    storeLimit: limits.stores,
  };
}

/** Settings → Stores (RLS: the caller's organization). */
export async function getStoresSettings(tenantId: string) {
  return load(await createClient(), tenantId);
}

/** The console's Stores tab (service role). */
export async function getTenantStoresSettings(tenantId: string) {
  await requireSuperadmin();
  return load(createAdminClient(), tenantId);
}

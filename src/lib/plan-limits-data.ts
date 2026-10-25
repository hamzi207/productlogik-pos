import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlanLimits = { users: number | null; stores: number | null };

/**
 * The organization's subscription limits, as the database checks them (private.tenant_limit): its own
 * override, else its plan's; null = no limit. Callers pass their own organization (getShopSession) or
 * are superadmins.
 */
export async function getPlanLimits(tenantId: string): Promise<PlanLimits> {
  const { data, error } = await createAdminClient()
    .from("tenant_subscriptions")
    .select("max_users, max_stores, plan:subscription_plans!tenant_subscriptions_plan_id_fkey(max_users, max_stores)")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`plan limits: ${error.message}`);
  return {
    users: data?.max_users ?? data?.plan?.max_users ?? null,
    stores: data?.max_stores ?? data?.plan?.max_stores ?? null,
  };
}

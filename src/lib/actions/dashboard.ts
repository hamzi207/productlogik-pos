"use server";

import { refresh } from "next/cache";
import { getShopSession } from "@/lib/auth";
import { dashboardPrefsSchema, type DashboardMetrics, type DashboardPrefs, type DashboardRange } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";

/** Sales, profit and pipeline figures for one date range, in the shop's timezone (RPC dashboard_metrics). */
export async function getDashboardMetrics({ range, from, to }: DashboardRange, storeId: string | null = null): Promise<DashboardMetrics> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_metrics", {
    p_range: range,
    ...(from ? { p_from: from } : {}),
    ...(to ? { p_to: to } : {}),
    // Phase 20: one store's figures; null = every store.
    ...(storeId ? { p_store_id: storeId } : {}),
  });
  if (error) {
    console.error("getDashboardMetrics failed:", error.message);
    throw new Error("Could not load dashboard figures.");
  }
  return data as unknown as DashboardMetrics;
}

/** Saves the signed-in user's widget choices (profiles.dashboard_prefs). */
export async function saveDashboardPrefs(
  prefs: DashboardPrefs,
): Promise<{ status: "success" } | { status: "error"; message: string }> {
  const parsed = dashboardPrefsSchema.safeParse(prefs);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your choices." };
  }

  const { userId } = await getShopSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ dashboard_prefs: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("saveDashboardPrefs failed:", error);
    return { status: "error", message: "We couldn't save your dashboard layout. Please try again." };
  }

  refresh();
  return { status: "success" };
}

/** RF-18.3: hides the dashboard's "Get started" card for the whole organization (org admins only). */
export async function dismissOnboarding(): Promise<{ status: "success" } | { status: "error"; message: string }> {
  const { tenant, role } = await getShopSession();
  if (role !== "admin") return { status: "error", message: "Only an admin can hide the setup steps." };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tenants")
    .update({ onboarding_dismissed_at: now, updated_at: now })
    .eq("id", tenant.id)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("dismissOnboarding failed:", error);
    return { status: "error", message: "We couldn't hide the setup steps. Please try again." };
  }
  refresh();
  return { status: "success" };
}

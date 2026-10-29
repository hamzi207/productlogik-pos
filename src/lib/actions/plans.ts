"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { audit, changedFields, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { planSchema, type PlanInput } from "@/lib/validations/plan.schema";

// /admin/plans (Phase 17, deliverable 9). Plans are data: the superadmin creates, edits,
// duplicates and retires them here, with no code change. Never deleted (organizations keep them).

export type OverLimit = { tenantId: string; tenantName: string; kind: "users" | "products" | "stores"; usage: number; limit: number };

export type PlanActionResult =
  | { status: "success"; id: string; message?: string }
  | { status: "confirm"; over: OverLimit[] }
  | { status: "error"; message: string };

type Admin = ReturnType<typeof createAdminClient>;

/** Organizations on `planId` (without their own override) that a lower limit would leave over it. */
async function overLimits(admin: Admin, planId: string, next: { max_users: number | null; max_products: number | null; max_stores: number | null }) {
  const { data: subs } = await admin
    .from("tenant_subscriptions")
    .select("tenant_id, max_users, max_products, max_stores, tenants(name)")
    .eq("plan_id", planId);
  const over: OverLimit[] = [];
  for (const s of subs ?? []) {
    const name = s.tenants?.name ?? "An organization";
    if (next.max_users !== null && s.max_users === null) {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", s.tenant_id)
        .is("deactivated_at", null);
      if ((count ?? 0) > next.max_users) over.push({ tenantId: s.tenant_id, tenantName: name, kind: "users", usage: count ?? 0, limit: next.max_users });
    }
    if (next.max_products !== null && s.max_products === null) {
      const { count } = await admin.from("inventory_items").select("id", { count: "exact", head: true }).eq("tenant_id", s.tenant_id).eq("is_archived", false);
      if ((count ?? 0) > next.max_products) over.push({ tenantId: s.tenant_id, tenantName: name, kind: "products", usage: count ?? 0, limit: next.max_products });
    }
    // Stores arrive in Phase 20: every organization has one today, within any limit (min 1).
  }
  return over;
}

function toRow(p: z.output<typeof planSchema>) {
  return {
    name: p.name,
    code: p.code,
    description: p.description || null,
    visibility: p.visibility,
    price_monthly: p.priceMonthly,
    price_yearly: p.priceYearly,
    max_stores: p.maxStores,
    max_users: p.maxUsers,
    max_products: p.maxProducts,
    allowed_modules: p.modules,
    trial_days: p.trialDays,
    sort_order: p.sortOrder,
  };
}

/**
 * Creates a plan (no `id`) or saves one. Lower limits apply to every organization on the plan at
 * once, so when some would end up over a limit the first call returns them to confirm; nothing is
 * ever removed from an organization (it just can't add more). New prices apply from each
 * organization's next invoice.
 */
export async function savePlan(input: PlanInput, id?: string, confirmed = false): Promise<PlanActionResult> {
  const me = await requireSuperadmin();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the plan details." };
  const row = toRow(parsed.data);
  const admin = createAdminClient();

  if (!id) {
    const { data, error } = await admin.from("subscription_plans").insert(row).select("id").single();
    if (error) {
      if (error.code === "23505") return { status: "error", message: `The code “${row.code}” is already used by another plan.` };
      console.error("savePlan insert failed:", error);
      return { status: "error", message: "We couldn't save the plan. Please try again." };
    }
    await audit({ adminId: me.userId, action: "plan.create", details: { id: data.id, name: row.name, code: row.code } });
    refresh();
    return { status: "success", id: data.id, message: `${row.name} was created.` };
  }

  if (!z.uuid().safeParse(id).success) return { status: "error", message: "That plan wasn't found." };
  const { data: before } = await admin.from("subscription_plans").select("*").eq("id", id).maybeSingle();
  if (!before) return { status: "error", message: "That plan wasn't found." };
  if (!confirmed) {
    const over = await overLimits(admin, id, row);
    if (over.length > 0) return { status: "confirm", over };
  }
  const { error } = await admin.from("subscription_plans").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { status: "error", message: `The code “${row.code}” is already used by another plan.` };
    console.error("savePlan update failed:", error);
    return { status: "error", message: "We couldn't save the plan. Please try again." };
  }
  const diff = changedFields(before as unknown as Record<string, unknown>, row);
  if (Object.keys(diff.after).length > 0) await audit({ adminId: me.userId, action: "plan.update", details: { id, name: row.name, ...diff } });
  refresh();
  return { status: "success", id, message: `${row.name} was saved.` };
}

/** Retire: can't be assigned any more; organizations on it keep it. Restore undoes it. */
export async function setPlanRetired(id: string, retired: boolean): Promise<PlanActionResult> {
  const me = await requireSuperadmin();
  if (!z.uuid().safeParse(id).success) return { status: "error", message: "That plan wasn't found." };
  const admin = createAdminClient();
  const [{ data: plan }, { data: settings }] = await Promise.all([
    admin.from("subscription_plans").select("id, name").eq("id", id).maybeSingle(),
    admin.from("platform_settings").select("default_plan_id").maybeSingle(),
  ]);
  if (!plan) return { status: "error", message: "That plan wasn't found." };
  if (retired && settings?.default_plan_id === id) {
    return { status: "error", message: `${plan.name} is the default plan. Choose another default in Platform settings first.` };
  }
  const { error } = await admin
    .from("subscription_plans")
    .update({ retired_at: retired ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("setPlanRetired failed:", error);
    return { status: "error", message: "We couldn't change the plan. Please try again." };
  }
  await audit({ adminId: me.userId, action: retired ? "plan.retire" : "plan.restore", details: { id, name: plan.name } });
  refresh();
  return { status: "success", id, message: retired ? `${plan.name} can no longer be assigned.` : `${plan.name} can be assigned again.` };
}

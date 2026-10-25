"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getStoreContext } from "@/lib/store";
import { STORE_COOKIE } from "@/lib/stores";
import { planLimitMessage } from "@/lib/plan-limits";
import { audit } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditTarget, resolveTarget, type Target } from "@/lib/target";
import type { Json } from "@/lib/types/database.types";
import { storeSchema, storeSettingsSchema, type StoreInput, type StoreSettingsInput } from "@/lib/validations/store.schema";

// Settings → Stores (Phase 20): the organization's stores, who works where, selling from other stores
// and per-store numbering (RF-20.2). Organization admins change their own (RLS); a superadmin passes
// `tenantId` from the console (service role, audited). Stores are part of the subscription: admins add
// them up to its store limit and edit them; deleting and switching stores off or on is console-only.
// The database keeps the rules: the store limit, a main store that stays, codes for per-store
// numbering, stores with history can only be switched off.

export type StoreResult = { status: "success"; message?: string } | { status: "error"; message: string };

const FORBIDDEN = "Only organization admins can change stores.";
const CONSOLE_ONLY = "Stores are removed or switched off by ProductLogik. Ask us to change your subscription.";
const uuid = z.uuid();
const fail = (message: string): StoreResult => ({ status: "error", message });

async function target(tenantId?: string) {
  const t = await resolveTarget(tenantId, FORBIDDEN);
  return t.ok ? t : null;
}

async function log(t: Target, action: string, details: Record<string, Json>) {
  if (t.adminId) await audit({ adminId: t.adminId, action, tenantId: t.tenantId, details });
}

function dbFail(error: { code?: string; message: string; details?: string | null; hint?: string | null }): StoreResult {
  const limit = planLimitMessage(error);
  if (limit) return fail(limit);
  if (error.code === "23505") {
    return fail(error.message.includes("code") ? "Another store already uses that code." : "There's already a store with that name.");
  }
  // Main store, codes for per-store numbering, stores with history: the triggers explain themselves.
  if (error.code === "23514" || error.code === "23503" || error.code === "42501") return fail(error.message);
  console.error("store save failed:", error);
  return fail("We couldn't save this. Please try again.");
}

/** The top bar's store switcher: where new documents go. Only stores the member can work in. */
export async function setCurrentStore(storeId: string): Promise<StoreResult> {
  if (!uuid.safeParse(storeId).success) return fail("That store wasn't found.");
  const ctx = await getStoreContext();
  const store = ctx.workStores.find((s) => s.id === storeId);
  if (!store) return fail("You don't work in that store.");
  (await cookies()).set(STORE_COOKIE, store.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  refresh();
  return { status: "success", message: store.name };
}

/** Adds (no `id`, within the subscription's store limit) or saves a store. Open / switched off: console only. */
export async function saveStore(input: StoreInput, id?: string, tenantId?: string): Promise<StoreResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  if (id && !uuid.safeParse(id).success) return fail("That store wasn't found.");
  const parsed = storeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details and try again.");
  const v = parsed.data;
  const row = {
    name: v.name,
    code: v.code,
    address: v.address,
    phone: v.phone,
    ntn: v.ntn,
    strn: v.strn,
    ...(t.adminId ? { is_active: v.isActive } : {}),
  };
  const query = id
    ? t.client.from("stores").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", t.tenantId).select("id")
    : t.client.from("stores").insert({ ...row, tenant_id: t.tenantId }).select("id");
  const { data, error } = await query;
  if (error) return dbFail(error);
  if (!data.length) return fail("That store wasn't found.");
  await log(t, id ? "store.update" : "store.create", { id: data[0].id, ...row });
  refresh();
  return { status: "success", message: v.code ? `${v.name} (${v.code})` : v.name };
}

/** Console: deletes a store that never had stock, documents or stock history (else: switch it off). */
export async function deleteStore(id: string, tenantId?: string): Promise<StoreResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  if (!t.adminId) return fail(CONSOLE_ONLY);
  if (!uuid.safeParse(id).success) return fail("That store wasn't found.");
  const { data, error } = await t.client.from("stores").delete().eq("id", id).eq("tenant_id", t.tenantId).select("name");
  if (error) return dbFail(error);
  if (!data.length) return fail("That store wasn't found, or it's the main store.");
  await log(t, "store.delete", { id, name: data[0].name });
  refresh();
  return { status: "success", message: data[0].name };
}

/** Selling from other stores' stock (and who may) and per-store numbering. */
export async function saveStoreSettings(input: StoreSettingsInput, tenantId?: string): Promise<StoreResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  const parsed = storeSettingsSchema.safeParse(input);
  if (!parsed.success) return fail("Check the settings and try again.");
  const row = {
    allow_cross_store_invoicing: parsed.data.allowCrossStore,
    cross_store_invoicing_roles: parsed.data.crossStoreRoles,
    number_per_store: parsed.data.numberPerStore,
  };
  const { data, error } = await t.client.from("tenants").update({ ...row, updated_at: new Date().toISOString() }).eq("id", t.tenantId).select("id");
  if (error) return dbFail(error);
  if (!data.length) return fail("We couldn't save this. Please try again.");
  await auditTarget(t, "stores.settings", row);
  refresh();
  return { status: "success" };
}

/**
 * A member's work stores and default store (staff only: admins work in every store). The member keeps
 * at least one store, and the default is one of them.
 */
export async function setMemberStores(profileId: string, storeIds: string[], defaultStoreId: string, tenantId?: string): Promise<StoreResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  if (!uuid.safeParse(profileId).success || !uuid.safeParse(defaultStoreId).success || storeIds.some((s) => !uuid.safeParse(s).success)) {
    return fail("That member or store wasn't found.");
  }
  const ids = [...new Set(storeIds)];
  if (!ids.length) return fail("Choose at least one store.");
  if (!ids.includes(defaultStoreId)) return fail("The default store has to be one they work in.");
  const { data: member } = await t.client.from("profiles").select("id, full_name").eq("id", profileId).eq("tenant_id", t.tenantId).maybeSingle();
  if (!member) return fail("That member wasn't found.");
  const { data: known } = await t.client.from("stores").select("id").eq("tenant_id", t.tenantId).in("id", ids);
  if ((known ?? []).length !== ids.length) return fail("That store wasn't found.");

  const del = await t.client.from("profile_stores").delete().eq("profile_id", profileId).eq("tenant_id", t.tenantId).not("store_id", "in", `(${ids.join(",")})`);
  if (del.error) return dbFail(del.error);
  const ins = await t.client
    .from("profile_stores")
    .upsert(ids.map((store_id) => ({ tenant_id: t.tenantId, profile_id: profileId, store_id })), { onConflict: "profile_id,store_id", ignoreDuplicates: true });
  if (ins.error) return dbFail(ins.error);
  // Members' own profile rows are theirs under RLS: an admin's change goes through the service role, as
  // in the team actions (the caller was checked as this organization's admin above).
  const upd = await createAdminClient().from("profiles").update({ default_store_id: defaultStoreId }).eq("id", profileId).eq("tenant_id", t.tenantId).select("id");
  if (upd.error) return dbFail(upd.error);
  await log(t, "member.stores", { id: profileId, stores: ids, default: defaultStoreId });
  refresh();
  return { status: "success", message: member.full_name };
}

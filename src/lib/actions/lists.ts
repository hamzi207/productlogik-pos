"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/superadmin";
import { resolveTarget, type Target } from "@/lib/target";
import type { Json } from "@/lib/types/database.types";
import {
  customerTagSchema,
  customerTypeSchema,
  unitSchema,
  type CustomerTagInput,
  type CustomerTypeInput,
  type UnitInput,
} from "@/lib/validations/lists.schema";

// Settings → Units and Settings → Customers (Phase 19, RF-19.2): an organization's units of measure,
// customer types and customer tags. Organization admins change their own (RLS); a superadmin passes
// `tenantId` from the console (service role, audited). The database keeps the rules: unique names,
// one default customer type, nothing in use can be deleted.

export type ListResult = { status: "success"; message?: string } | { status: "error"; message: string };

const FORBIDDEN = "Only organization admins can change these lists.";
const uuid = z.uuid();

const fail = (message: string): ListResult => ({ status: "error", message });

async function target(tenantId?: string) {
  const t = await resolveTarget(tenantId, FORBIDDEN);
  return t.ok ? t : null;
}

/** Superadmin changes go to the audit log; an organization's own admins aren't audited here. */
async function log(t: Target, action: string, details: Record<string, Json>) {
  if (t.adminId) await audit({ adminId: t.adminId, action, tenantId: t.tenantId, details });
}

function dbFail(error: { code?: string; message: string }, what: string, inUse: string): ListResult {
  if (error.code === "23505") return fail(`There's already ${what} with that name.`);
  if (error.code === "23503") return fail(inUse);
  // Rules raised by triggers (default type, archived type) explain themselves.
  if (error.code === "23514" || error.code === "42501") return fail(error.message);
  console.error(`${what} save failed:`, error);
  return fail("We couldn't save this. Please try again.");
}

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Check the details and try again.";

// ---------------------------------------------------------------------------------------------------
// Units of measure
// ---------------------------------------------------------------------------------------------------

export async function saveUnit(input: UnitInput, id?: string, tenantId?: string): Promise<ListResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  if (id && !uuid.safeParse(id).success) return fail("That unit wasn't found.");
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const row = { code: parsed.data.code, name: parsed.data.name, decimals: parsed.data.decimals, is_pack: parsed.data.isPack };
  const query = id
    ? t.client.from("units_of_measure").update(row).eq("id", id).eq("tenant_id", t.tenantId).select("id")
    : t.client.from("units_of_measure").insert({ ...row, tenant_id: t.tenantId, sort_order: 500 }).select("id");
  const { data, error } = await query;
  if (error) return dbFail(error, "a unit", "This unit is in use.");
  if (!data.length) return fail("That unit wasn't found.");
  await log(t, id ? "unit.update" : "unit.create", { id: data[0].id, ...row });
  refresh();
  return { status: "success", message: `${row.name} (${row.code})` };
}

/**
 * Settings → Units: packs on or off. Turning them on adds Box, Carton, Pack and Dozen if missing; turning
 * them off keeps every product's packs for later (the app offers base units only meanwhile).
 */
export async function setPacksEnabled(enabled: boolean, tenantId?: string): Promise<ListResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  const { data, error } = await t.client
    .from("tenants")
    .update({ packs_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", t.tenantId)
    .select("id");
  if (error || !data.length) {
    if (error) console.error("setPacksEnabled failed:", error);
    return fail("We couldn't change this. Please try again.");
  }
  await log(t, enabled ? "units.packs_on" : "units.packs_off", {});
  refresh();
  return {
    status: "success",
    message: enabled ? "Products can now have boxes, cartons and other packs." : "Documents use each product's base unit. Packs already set up are kept.",
  };
}

export async function setUnitArchived(id: string, archived: boolean, tenantId?: string): Promise<ListResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  const { data, error } = await t.client.from("units_of_measure").update({ is_archived: archived }).eq("id", id).eq("tenant_id", t.tenantId).select("code");
  if (error) return dbFail(error, "a unit", "This unit is in use.");
  if (!data.length) return fail("That unit wasn't found.");
  await log(t, archived ? "unit.archive" : "unit.restore", { id, code: data[0].code });
  refresh();
  return { status: "success" };
}

export async function deleteUnit(id: string, tenantId?: string): Promise<ListResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  const { data, error } = await t.client.from("units_of_measure").delete().eq("id", id).eq("tenant_id", t.tenantId).select("code");
  if (error) return dbFail(error, "a unit", "Products use this unit, so it can't be deleted. Archive it instead.");
  if (!data.length) return fail("That unit wasn't found.");
  await log(t, "unit.delete", { id, code: data[0].code });
  refresh();
  return { status: "success" };
}

// ---------------------------------------------------------------------------------------------------
// Customer types
// ---------------------------------------------------------------------------------------------------

export async function saveCustomerType(input: CustomerTypeInput, id?: string, tenantId?: string): Promise<ListResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  if (id && !uuid.safeParse(id).success) return fail("That customer type wasn't found.");
  const parsed = customerTypeSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const row = { name: parsed.data.name, requires_tax_details: parsed.data.requiresTaxDetails };
  // A rename follows through to every customer of the type (foreign key ON UPDATE CASCADE).
  const query = id
    ? t.client.from("customer_types").update(row).eq("id", id).eq("tenant_id", t.tenantId).select("id")
    : t.client.from("customer_types").insert({ ...row, tenant_id: t.tenantId, sort_order: 500 }).select("id");
  const { data, error } = await query;
  if (error) return dbFail(error, "a customer type", "This customer type is in use.");
  if (!data.length) return fail("That customer type wasn't found.");
  await log(t, id ? "customer_type.update" : "customer_type.create", { id: data[0].id, ...row });
  refresh();
  return { status: "success", message: row.name };
}

export async function setCustomerTypeArchived(id: string, archived: boolean, tenantId?: string): Promise<ListResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  const { data, error } = await t.client.from("customer_types").update({ is_archived: archived }).eq("id", id).eq("tenant_id", t.tenantId).select("name");
  if (error) return dbFail(error, "a customer type", "This customer type is in use.");
  if (!data.length) return fail("That customer type wasn't found.");
  await log(t, archived ? "customer_type.archive" : "customer_type.restore", { id, name: data[0].name });
  refresh();
  return { status: "success" };
}

export async function setDefaultCustomerType(id: string, tenantId?: string): Promise<ListResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  if (!uuid.safeParse(id).success) return fail("That customer type wasn't found.");
  // Organization admins: the function checks they're an admin of the type's organization.
  const { data: type } = await t.client.from("customer_types").select("name").eq("id", id).eq("tenant_id", t.tenantId).maybeSingle();
  if (!type) return fail("That customer type wasn't found.");
  const { error } = await t.client.rpc("set_default_customer_type", { p_type_id: id });
  if (error) return dbFail(error, "a customer type", "This customer type is in use.");
  await log(t, "customer_type.default", { id, name: type.name });
  refresh();
  return { status: "success", message: `New customers start as ${type.name}.` };
}

export async function deleteCustomerType(id: string, tenantId?: string): Promise<ListResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  const { data: type } = await t.client.from("customer_types").select("name, is_default").eq("id", id).eq("tenant_id", t.tenantId).maybeSingle();
  if (!type) return fail("That customer type wasn't found.");
  if (type.is_default) return fail("Make another type the default before deleting this one.");
  const { error } = await t.client.from("customer_types").delete().eq("id", id).eq("tenant_id", t.tenantId);
  if (error) return dbFail(error, "a customer type", "Customers have this type, so it can't be deleted. Archive it instead.");
  await log(t, "customer_type.delete", { id, name: type.name });
  refresh();
  return { status: "success" };
}

// ---------------------------------------------------------------------------------------------------
// Customer tags (RF-19.2)
// ---------------------------------------------------------------------------------------------------

export async function saveCustomerTag(input: CustomerTagInput, id?: string, tenantId?: string): Promise<ListResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  if (id && !uuid.safeParse(id).success) return fail("That tag wasn't found.");
  const parsed = customerTagSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const row = { name: parsed.data.name, color: parsed.data.color };
  const query = id
    ? t.client.from("customer_tags").update(row).eq("id", id).eq("tenant_id", t.tenantId).select("id")
    : t.client.from("customer_tags").insert({ ...row, tenant_id: t.tenantId }).select("id");
  const { data, error } = await query;
  if (error) return dbFail(error, "a tag", "This tag is in use.");
  if (!data.length) return fail("That tag wasn't found.");
  await log(t, id ? "customer_tag.update" : "customer_tag.create", { id: data[0].id, ...row });
  refresh();
  return { status: "success", message: row.name };
}

/** Removes the tag from every customer that has it (customers themselves are untouched). */
export async function deleteCustomerTag(id: string, tenantId?: string): Promise<ListResult> {
  const t = await target(tenantId);
  if (!t) return fail(FORBIDDEN);
  const { data, error } = await t.client.from("customer_tags").delete().eq("id", id).eq("tenant_id", t.tenantId).select("name");
  if (error) return dbFail(error, "a tag", "This tag is in use.");
  if (!data.length) return fail("That tag wasn't found.");
  await log(t, "customer_tag.delete", { id, name: data[0].name });
  refresh();
  return { status: "success" };
}

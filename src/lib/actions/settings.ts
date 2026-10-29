"use server";

import { refresh } from "next/cache";
import { audit } from "@/lib/superadmin";
import { auditTarget, resolveTarget } from "@/lib/target";
import { parsePhone } from "@/lib/phone";
import { SUPABASE_URL } from "@/lib/supabase/env";
import type { TablesUpdate } from "@/lib/types/database.types";
import {
  documentSettingsSchema,
  type DocumentSettingsValues,
} from "@/lib/validations/document-settings.schema";
import {
  shopProfileSchema,
  shopSettingsSchema,
  type ShopProfileValues,
  type ShopSettingsInput,
} from "@/lib/validations/settings.schema";

export type SettingsActionResult = { status: "success" } | { status: "error"; message: string };

/** tenants column for each shop setting. */
const SETTING_COLUMNS = {
  currency: "currency",
  showPaisa: "show_paisa",
  taxRate: "tax_rate",
  pricesIncludeTax: "prices_include_tax",
  allowInternationalPhones: "allow_international_phones",
  timezone: "timezone",
  showClock: "show_clock",
  clockStyle: "clock_style",
  clock24Hour: "clock_24_hour",
  showOverviewLogo: "show_overview_logo",
  weekStart: "week_start",
  quoteValidityDays: "quote_validity_days",
  printFormat: "print_format",
  imagesOnDrafts: "images_on_drafts",
  imagesOnQuotations: "images_on_quotations",
  imagesOnInvoices: "images_on_invoices",
  imagesOnPdf: "images_on_pdf",
  imagesOnShare: "images_on_share",
} as const satisfies Record<keyof ShopSettingsInput, keyof TablesUpdate<"tenants">>;

/**
 * Saves the settings one Settings tab shows (any subset); the others are left as they are.
 * Admin-only (also enforced by the "Admins can update their own tenant" RLS policy); superadmins
 * pass `tenantId` from the console (audited).
 */
export async function updateShopSettings(input: Partial<ShopSettingsInput>, tenantId?: string): Promise<SettingsActionResult> {
  const parsed = shopSettingsSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the settings." };
  }

  const target = await resolveTarget(tenantId, "Only shop admins can change settings.");
  if (!target.ok) return { status: "error", message: target.message };

  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data) as [keyof ShopSettingsInput, unknown][]) {
    if (value === undefined) continue;
    changes[SETTING_COLUMNS[key]] = key === "taxRate" ? Math.round(Number(value) * 100) / 100 : value;
  }
  if (Object.keys(changes).length === 0) return { status: "success" };

  const { data, error } = await target.client
    .from("tenants")
    .update({ ...(changes as TablesUpdate<"tenants">), updated_at: new Date().toISOString() })
    .eq("id", target.tenantId)
    .select("id");

  if (error || data.length === 0) {
    if (error) console.error("updateShopSettings failed:", error);
    return { status: "error", message: "We couldn't save your settings. Please try again." };
  }

  await auditTarget(target, "tenant.settings", changes);
  refresh();
  return { status: "success" };
}

/**
 * Settings → Documents: number prefixes and "start from", quotation and invoice terms, bank
 * details. Admin-only (RLS + the column grants from Phase 12).
 */
export async function updateDocumentSettings(input: DocumentSettingsValues, tenantId?: string): Promise<SettingsActionResult> {
  const parsed = documentSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the document settings." };
  }
  const target = await resolveTarget(tenantId, "Only shop admins can change document settings.");
  if (!target.ok) return { status: "error", message: target.message };
  const d = parsed.data;
  const changes = {
    quote_prefix: d.quotePrefix,
    quote_start_number: d.quoteStart,
    invoice_prefix: d.invoicePrefix,
    invoice_start_number: d.invoiceStart,
    draft_prefix: d.draftPrefix,
    draft_start_number: d.draftStart,
    quote_footer_notes: d.quoteTerms || null,
    invoice_terms: d.invoiceTerms || null,
    bank_name: d.bankName || null,
    bank_account_title: d.bankAccountTitle || null,
    bank_account_number: d.bankAccountNumber || null,
    bank_iban: d.bankIban || null,
    bank_raast_id: d.bankRaastId || null,
    bank_wallets: d.wallets,
  };
  const { data, error } = await target.client
    .from("tenants")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("id", target.tenantId)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("updateDocumentSettings failed:", error);
    return { status: "error", message: "We couldn't save the document settings. Please try again." };
  }
  await auditTarget(target, "tenant.documents", changes);
  refresh();
  return { status: "success" };
}

/** Shop details printed on quotations and invoices. Admin-only (RLS enforces it too); superadmins pass `tenantId`. */
export async function updateShopProfile(input: ShopProfileValues, tenantId?: string): Promise<SettingsActionResult> {
  const parsed = shopProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the shop details." };
  }
  const target = await resolveTarget(tenantId, "Only shop admins can change the shop details.");
  if (!target.ok) return { status: "error", message: target.message };
  const s = parsed.data;
  let phone: string | null = null;
  if (s.phone) {
    const p = parsePhone(s.phone, target.allowInternationalPhones);
    if (!p.ok) return { status: "error", message: `Phone: ${p.error}` };
    phone = p.e164;
  }

  const changes = {
    name: s.name,
    phone,
    email: s.email || null,
    address: s.address || null,
    ntn: s.ntn || null,
    strn: s.strn || null,
    accent_color: s.accentColor || null,
  };
  const { data, error } = await target.client
    .from("tenants")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("id", target.tenantId)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("updateShopProfile failed:", error);
    return { status: "error", message: "We couldn't save the shop details. Please try again." };
  }
  await auditTarget(target, "tenant.update", changes);
  refresh();
  return { status: "success" };
}

/**
 * Saves (or clears) the shop logo after the browser uploaded it to the shop-assets bucket.
 * Only accepts a public URL inside this shop's own folder.
 */
export async function setShopLogo(url: string | null, tenantId?: string): Promise<SettingsActionResult> {
  const target = await resolveTarget(tenantId, "Only shop admins can change the logo.");
  if (!target.ok) return { status: "error", message: target.message };
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/shop-assets/${target.tenantId}/`;
  if (url !== null && (!url.startsWith(prefix) || url.length > 500)) {
    return { status: "error", message: "That logo upload isn't valid. Please try again." };
  }
  const { data, error } = await target.client
    .from("tenants")
    .update({ logo_url: url, updated_at: new Date().toISOString() })
    .eq("id", target.tenantId)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("setShopLogo failed:", error);
    return { status: "error", message: "We couldn't save the logo. Please try again." };
  }
  if (target.adminId) await audit({ adminId: target.adminId, action: "tenant.logo_removed", tenantId: target.tenantId });
  refresh();
  return { status: "success" };
}

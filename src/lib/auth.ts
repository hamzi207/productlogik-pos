import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getImpersonation } from "@/lib/impersonation";
import { isSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/database.types";
import { parseDashboardPrefs, type DashboardPrefs } from "@/lib/dashboard";
import type { MoneyFormat } from "@/lib/format";
import type { ClockStyle, PrintFormat, WeekStart } from "@/lib/validations/settings.schema";

export type ShopSession = {
  userId: string;
  fullName: string;
  email: string;
  role: "admin" | "staff";
  /** This user's dashboard widgets and periods. */
  dashboardPrefs: DashboardPrefs;
  /** Newest "What's new" entry this user has opened (lib/changelog.ts). */
  whatsNewSeen: string | null;
  /** Phase 20: the store this member starts in (null while acting as the shop). */
  defaultStoreId: string | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    taxRate: number;
    timezone: string;
    showPaisa: boolean;
    pricesIncludeTax: boolean;
    allowInternationalPhones: boolean;
    clockStyle: ClockStyle;
    showClock: boolean;
    clock24Hour: boolean;
    /** Shop logo beside the Overview greeting (Settings → Localization → Overview page). */
    showOverviewLogo: boolean;
    /** First day of the week: 1 Monday, 6 Saturday, 7 Sunday. */
    weekStart: WeekStart;
    /** Printed on quotations and drafts (tenants.quote_footer_notes). */
    quoteTerms: string | null;
    /** Payment terms printed on invoices (tenants.invoice_terms). */
    invoiceTerms: string | null;
    /** Printed on quotations and invoices (Settings → Your shop). */
    phone: string | null;
    email: string | null;
    address: string | null;
    ntn: string | null;
    strn: string | null;
    /** Public URL in the shop-assets bucket. */
    logoUrl: string | null;
    /** Document accent colour (#rrggbb) or null for the default (RF-16.1). */
    accentColor: string | null;
    /** How long a quotation's offer is valid (its stock stays reserved regardless). */
    quoteValidityDays: number;
    /** Pass to formatMoney(). */
    money: MoneyFormat;
    /** A4 PDF or 80mm POS slip on the document screens. */
    printFormat: PrintFormat;
    /** Phase 18: decides the category catalog (see getMyModules() for the switched-on modules). */
    industryId: string;
    /** Settings → Units: products can be bought and sold in packs (boxes, cartons…). */
    packsEnabled: boolean;
  };
  /** Set while a superadmin is acting as this shop ("Login As"): the banner shows it. */
  impersonating: { tenantName: string; expiresAt: string } | null;
};

export const TENANT_COLUMNS =
  "id, name, slug, currency, tax_rate, timezone, show_paisa, prices_include_tax, allow_international_phones, clock_style, show_clock, clock_24_hour, show_overview_logo, week_start, print_format, quote_footer_notes, invoice_terms, quote_validity_days, phone, email, address, ntn, strn, logo_url, accent_color, industry_id, packs_enabled";

export type TenantRow = Pick<
  Tables<"tenants">,
  | "id" | "name" | "slug" | "currency" | "tax_rate" | "timezone" | "show_paisa" | "prices_include_tax"
  | "allow_international_phones" | "clock_style" | "show_clock" | "clock_24_hour" | "show_overview_logo" | "week_start" | "print_format"
  | "quote_footer_notes" | "invoice_terms" | "quote_validity_days" | "phone" | "email" | "address" | "ntn" | "strn" | "logo_url" | "accent_color" | "industry_id" | "packs_enabled"
>;

export function mapTenant(tenant: TenantRow): ShopSession["tenant"] {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    currency: tenant.currency,
    taxRate: Number(tenant.tax_rate),
    timezone: tenant.timezone,
    showPaisa: tenant.show_paisa,
    pricesIncludeTax: tenant.prices_include_tax,
    allowInternationalPhones: tenant.allow_international_phones,
    clockStyle: tenant.clock_style === "analog" ? "analog" : "digital",
    showClock: tenant.show_clock,
    clock24Hour: tenant.clock_24_hour,
    showOverviewLogo: tenant.show_overview_logo,
    weekStart: tenant.week_start === 6 || tenant.week_start === 7 ? tenant.week_start : 1,
    quoteTerms: tenant.quote_footer_notes,
    invoiceTerms: tenant.invoice_terms,
    quoteValidityDays: tenant.quote_validity_days,
    phone: tenant.phone,
    email: tenant.email,
    address: tenant.address,
    ntn: tenant.ntn,
    strn: tenant.strn,
    logoUrl: tenant.logo_url,
    accentColor: tenant.accent_color,
    money: { currency: tenant.currency, showPaisa: tenant.show_paisa },
    printFormat: tenant.print_format === "pos" ? "pos" : "a4",
    industryId: tenant.industry_id,
    packsEnabled: tenant.packs_enabled,
  };
}

/**
 * Data Access Layer: the signed-in user's profile and shop.
 * Reads the request cookies, so callers must render inside <Suspense>.
 * Deduplicated per request via React cache().
 */
export const getShopSession = cache(async (): Promise<ShopSession> => {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  // Superadmin acting as a shop ("Login As"): superadmins have no shop profile, so their name comes
  // from platform_admins (service role) and they count as the shop's admin.
  const impersonation = await getImpersonation(userId);
  if (impersonation) {
    const [{ data: own }, { data: tenant }] = await Promise.all([
      createAdminClient().from("platform_admins").select("full_name, email").eq("id", userId).is("removed_at", null).maybeSingle(),
      supabase.from("tenants").select(TENANT_COLUMNS).eq("id", impersonation.tenantId).single(),
    ]);
    if (!own || !tenant) redirect("/admin/tenants");
    return {
      userId,
      fullName: own.full_name,
      email: own.email,
      role: "admin",
      dashboardPrefs: parseDashboardPrefs(null),
      whatsNewSeen: null,
      defaultStoreId: null,
      tenant: mapTenant(tenant),
      impersonating: { tenantName: impersonation.tenantName, expiresAt: impersonation.expiresAt },
    };
  }

  // RLS limits this to the caller's own profile/tenant.
  const { data: profile } = await supabase
    .from("profiles")
    .select(`full_name, email, role, dashboard_prefs, whats_new_seen, default_store_id, tenants!profiles_tenant_id_fkey(${TENANT_COLUMNS})`)
    .eq("id", userId)
    .single();

  const tenant = profile?.tenants;
  if (!profile || !tenant) {
    // A suspended or archived shop is hidden from its own users by RLS: sign them out with a polite
    // message. Suspended for an unpaid subscription: the payment page instead.
    const { data: status } = await supabase.rpc("my_shop_status");
    if (status === "unpaid") redirect("/subscription-due");
    if (status === "suspended") redirect("/auth/suspended");
    if (status === "archived") redirect("/auth/suspended?reason=archived");
    // Turned off by a shop admin (Settings → Team).
    if (status === "deactivated") redirect("/auth/suspended?reason=deactivated");
    // A superadmin account (no shop) that isn't acting as one: back to the console.
    if (await isSuperadmin(userId)) redirect("/admin");
    // Signed in but not attached to any shop: sign out first, or /login would send them straight back here.
    redirect("/auth/suspended?reason=no_shop");
  }

  return {
    userId,
    fullName: profile.full_name,
    email: profile.email,
    // DB check constraint limits role to admin|staff; fail closed to staff.
    role: profile.role === "admin" ? "admin" : "staff",
    dashboardPrefs: parseDashboardPrefs(profile.dashboard_prefs),
    whatsNewSeen: profile.whats_new_seen,
    defaultStoreId: profile.default_store_id,
    tenant: mapTenant(tenant),
    impersonating: null,
  };
});

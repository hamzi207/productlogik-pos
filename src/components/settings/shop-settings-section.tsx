import { getShopSession } from "@/lib/auth";
import { timeZoneGroups } from "@/lib/timezones";
import type { Currency, ShopSettingsInput } from "@/lib/validations/settings.schema";
import { ShopSettingsForm, type SettingsSection } from "./shop-settings-form";
import { UnsavedSettings } from "./unsaved-settings";

/** The shop's current settings as the form's values. */
export function shopSettingsValues(tenant: Awaited<ReturnType<typeof getShopSession>>["tenant"]): ShopSettingsInput {
  return {
    timezone: tenant.timezone,
    showClock: tenant.showClock,
    clockStyle: tenant.clockStyle,
    clock24Hour: tenant.clock24Hour,
    showOverviewLogo: tenant.showOverviewLogo,
    weekStart: tenant.weekStart,
    quoteValidityDays: tenant.quoteValidityDays,
    printFormat: tenant.printFormat,
    currency: tenant.currency as Currency,
    showPaisa: tenant.showPaisa,
    taxRate: tenant.taxRate,
    pricesIncludeTax: tenant.pricesIncludeTax,
    allowInternationalPhones: tenant.allowInternationalPhones,
    imagesOnDrafts: tenant.imagesOnDrafts,
    imagesOnQuotations: tenant.imagesOnQuotations,
    imagesOnInvoices: tenant.imagesOnInvoices,
    imagesOnPdf: tenant.imagesOnPdf,
    imagesOnShare: tenant.imagesOnShare,
  };
}

/** A Settings tab made only of shop-settings cards (Localization, Printing, POS). Reads the session: render in <Suspense>. */
export async function ShopSettingsSection({ sections, label }: { sections: SettingsSection[]; label: string }) {
  const { tenant, role } = await getShopSession();
  return (
    <UnsavedSettings>
      <ShopSettingsForm
        sections={sections}
        label={label}
        canEdit={role === "admin"}
        timeZoneGroups={timeZoneGroups()}
        initial={shopSettingsValues(tenant)}
      />
    </UnsavedSettings>
  );
}

export function SettingsLoading() {
  return <section className="card"><div className="empty-state">Loading settings…</div></section>;
}

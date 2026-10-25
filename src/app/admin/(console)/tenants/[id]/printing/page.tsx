import { Suspense } from "react";
import type { Metadata } from "next";
import { TenantSettingsSection } from "@/components/admin/tenant-settings-section";
import { SettingsLoading } from "@/components/settings/shop-settings-section";

export const metadata: Metadata = { title: "Shop · Tax & Printing" };

/** Tax & Printing tab: the organization's own settings cards (as its Settings → Tax & Printing). */
export default function TenantPrintingPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <TenantSettingsSection params={params} sections={["tax", "printFormat"]} label="Tax & Printing" />
    </Suspense>
  );
}

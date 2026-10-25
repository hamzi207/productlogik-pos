import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import { getStoresSettings } from "@/lib/store-data";
import { StoreManager } from "@/components/settings/store-manager";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { UnsavedSettings } from "@/components/settings/unsaved-settings";

export const metadata: Metadata = { title: "Settings · Stores" };

async function StoresContent() {
  const { role, tenant } = await getShopSession();
  const data = await getStoresSettings(tenant.id);
  // UnsavedSettings: the store rules save from the Save Settings bar; stores and access save in place.
  return (
    <UnsavedSettings>
      <StoreManager data={data} canEdit={role === "admin"} />
    </UnsavedSettings>
  );
}

/** Settings → Stores (Phase 20): the organization's stores, selling across them, numbering, who works where. */
export default function SettingsStoresPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <StoresContent />
    </Suspense>
  );
}

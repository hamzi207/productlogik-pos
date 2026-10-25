import { Suspense } from "react";
import type { Metadata } from "next";
import { StoreManager } from "@/components/settings/store-manager";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { UnsavedSettings } from "@/components/settings/unsaved-settings";
import { tenantParam } from "@/lib/admin-params";
import { getTenantStoresSettings } from "@/lib/store-data";

export const metadata: Metadata = { title: "Shop · Stores" };

type Params = Promise<{ id: string }>;

async function Stores({ params }: { params: Params }) {
  const id = await tenantParam(params);
  const data = await getTenantStoresSettings(id);
  return (
    <UnsavedSettings>
      <StoreManager tenantId={id} data={data} canEdit />
    </UnsavedSettings>
  );
}

/** Stores tab (Phase 20, superadmin parity): the organization's stores, rules and who works where (audited). */
export default function TenantStoresPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <Stores params={params} />
    </Suspense>
  );
}

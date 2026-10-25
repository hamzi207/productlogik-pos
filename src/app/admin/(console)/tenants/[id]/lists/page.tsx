import { Suspense } from "react";
import type { Metadata } from "next";
import { CustomerTagManager, CustomerTypeManager, UnitManager } from "@/components/settings/list-managers";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { UnsavedSettings } from "@/components/settings/unsaved-settings";
import { getTenantCustomerLists, getTenantPackState, getTenantUnits, getUnitPresetsForConsole } from "@/lib/admin-category-data";
import { tenantParam } from "@/lib/admin-params";

export const metadata: Metadata = { title: "Shop · Units & customers" };

type Params = Promise<{ id: string }>;

async function Lists({ params }: { params: Params }) {
  const id = await tenantParam(params);
  const [units, presets, lists, packs] = await Promise.all([getTenantUnits(id), getUnitPresetsForConsole(), getTenantCustomerLists(id), getTenantPackState(id)]);
  return (
    // UnsavedSettings: the packs switch saves from the Save Settings bar, like the other settings tabs.
    <UnsavedSettings>
      <UnitManager tenantId={id} units={units} presets={presets} canEdit packsEnabled={packs.packsEnabled} packProducts={packs.packProducts} />
      <CustomerTypeManager tenantId={id} types={lists.types} canEdit />
      <CustomerTagManager tenantId={id} tags={lists.tags} counts={lists.counts} canEdit />
    </UnsavedSettings>
  );
}

/** Units & customers tab (Phase 19, superadmin parity): the organization's units, customer types and tags. */
export default function TenantListsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <Lists params={params} />
    </Suspense>
  );
}

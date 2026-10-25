import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import { getPackProductCount, getUnitPresets, getUnits } from "@/lib/uom-data";
import { UnitManager } from "@/components/settings/list-managers";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { UnsavedSettings } from "@/components/settings/unsaved-settings";

export const metadata: Metadata = { title: "Settings · Units" };

async function UnitsContent() {
  const [{ role, tenant }, units, presets, packProducts] = await Promise.all([getShopSession(), getUnits(), getUnitPresets(), getPackProductCount()]);
  // UnsavedSettings: the packs switch saves from the Save Settings bar, like the other settings tabs.
  return (
    <UnsavedSettings>
      <UnitManager units={units} presets={presets} canEdit={role === "admin"} packsEnabled={tenant.packsEnabled} packProducts={packProducts} />
    </UnsavedSettings>
  );
}

/** Settings → Units (Phase 19): the organization's units of measure. */
export default function SettingsUnitsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <UnitsContent />
    </Suspense>
  );
}

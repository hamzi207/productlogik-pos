import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsLoading, ShopSettingsSection } from "@/components/settings/shop-settings-section";

export const metadata: Metadata = { title: "Settings · Tax & Printing" };

/** Tax & Printing (was Printing and POS): the tax rate, the print format and product images on documents, as in the console. */
export default function SettingsPrintingPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <ShopSettingsSection sections={["tax", "printFormat", "productImages"]} label="Tax & Printing" />
    </Suspense>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { getShopSession } from "@/lib/auth";
import { getCustomerTagCounts, getCustomerTags, getCustomerTypes } from "@/lib/customer-list-data";
import { CustomerTagManager, CustomerTypeManager } from "@/components/settings/list-managers";
import { SettingsLoading } from "@/components/settings/shop-settings-section";

export const metadata: Metadata = { title: "Settings · Customers" };

async function CustomersContent() {
  const [{ role }, types, tags, counts] = await Promise.all([getShopSession(), getCustomerTypes(), getCustomerTags(), getCustomerTagCounts()]);
  const canEdit = role === "admin";
  return (
    <>
      <CustomerTypeManager types={types} canEdit={canEdit} />
      <CustomerTagManager tags={tags} counts={counts} canEdit={canEdit} />
    </>
  );
}

/** Settings → Customers (Phase 19): customer types and tags (RF-19.2). */
export default function SettingsCustomersPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <CustomersContent />
    </Suspense>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminFilters } from "@/components/admin/admin-filters";
import { TenantProductManager } from "@/components/admin/tenant-product-manager";
import { SettingsLoading } from "@/components/settings/shop-settings-section";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { getTenantCategoryView, getTenantProducts, getTenantUnits } from "@/lib/admin-category-data";
import { tenantParam } from "@/lib/admin-params";
import { buildCategoryIndex, descendantIds, fullPath } from "@/lib/categories";
import { parsePagination } from "@/lib/pagination";

export const metadata: Metadata = { title: "Shop · Products" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Products({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [id, raw] = await Promise.all([tenantParam(params), searchParams]);
  const [view, units] = await Promise.all([getTenantCategoryView(id), getTenantUnits(id)]);
  const hidden = new Set(view.hiddenIds);
  const visible = view.categories.filter((c) => !hidden.has(c.id));
  const index = buildCategoryIndex(visible);
  const category = index.byId.get(first(raw.category) ?? "");
  const result = await getTenantProducts(
    id,
    { q: (first(raw.q) ?? "").slice(0, 100), categoryIds: category ? descendantIds(category) : null },
    parsePagination({ page: first(raw.page), limit: first(raw.limit) }),
  );
  return (
    <section className="card customer-card">
      <AdminFilters
        placeholder="Search name or SKU"
        label="Search products"
        selects={[{ key: "category", label: "Category", options: [{ value: "", label: "Every category" }, ...index.flat.map((n) => ({ value: n.id, label: fullPath(n) }))] }]}
      />
      <TenantProductManager
        tenantId={id}
        rows={result.rows}
        total={result.total}
        categories={visible}
        attributes={[...view.industryAttributes, ...view.attributes].filter((a) => !a.is_archived)}
        units={units}
      />
      <PaginationBar total={result.total} page={result.page} limit={result.limit} noun={["product", "products"]} />
    </section>
  );
}

/** Products tab (Phase 18, superadmin review): one organization's products, to view, add, edit and delete. */
export default function TenantProductsPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <Products params={params} searchParams={searchParams} />
    </Suspense>
  );
}

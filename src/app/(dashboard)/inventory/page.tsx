import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { getInventoryItems } from "@/lib/actions/inventory";
import { getShopSession } from "@/lib/auth";
import { getStoreView } from "@/lib/store";
import { getAttributes, getCategories, getCategoryCounts } from "@/lib/category-data";
import { hasModule } from "@/lib/module-data";
import { getUnits } from "@/lib/uom-data";
import { parsePagination, pastEndRedirect } from "@/lib/pagination";
import { ATTR_PARAM, inventoryFiltersSchema } from "@/lib/validations/inventory.schema";
import { AddItemButton } from "@/components/inventory/add-item-button";
import { ExportInventoryButton, ImportInventoryButton } from "@/components/inventory/csv-import-dialog";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { InventoryTable } from "@/components/inventory/inventory-table";

export const metadata: Metadata = { title: "Inventory" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ?attr.colour=Red&attr.boxed=yes → { colour: "Red", boxed: "yes" } (attribute filters, RF-18.1). */
function attributeParams(raw: Record<string, string | string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = first(value);
    if (key.startsWith(ATTR_PARAM) && v) out[key.slice(ATTR_PARAM.length)] = v;
  }
  return out;
}

async function AddItemAction() {
  const [{ tenant }, categories, attributes, fitment, units, storeView] = await Promise.all([
    getShopSession(),
    getCategories(),
    getAttributes(),
    hasModule("vehicle_fitment"),
    getUnits(),
    getStoreView(),
  ]);
  return (
    <AddItemButton
      storeView={storeView}
      currency={tenant.currency}
      pricesIncludeTax={tenant.pricesIncludeTax}
      categories={categories}
      attributes={attributes}
      units={units}
      packsEnabled={tenant.packsEnabled}
      fitment={fitment}
    />
  );
}

async function FiltersSection() {
  const [categories, counts, attributes, fitment] = await Promise.all([
    getCategories(),
    getCategoryCounts(),
    getAttributes(),
    hasModule("vehicle_fitment"),
  ]);
  return <InventoryFilters categories={categories} counts={counts} attributes={attributes} fitment={fitment} />;
}

async function ImportAction() {
  return <ImportInventoryButton fitment={await hasModule("vehicle_fitment")} />;
}

/** Heading: "Inventory & Fitment" only with the Vehicle Fitment module. */
async function Heading() {
  const fitment = await hasModule("vehicle_fitment");
  return (
    <div>
      <span className="eyebrow">CATALOG MANAGEMENT</span>
      <h1>{fitment ? "Inventory & Fitment" : "Inventory"}</h1>
      <p>{fitment ? "Manage products, stock levels, margins, and vehicle compatibility." : "Manage products, stock levels and margins."}</p>
    </div>
  );
}

async function InventoryResults({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const fitment = await hasModule("vehicle_fitment");
  const filters = inventoryFiltersSchema.parse({
    category: first(raw.category),
    search: first(raw.q) || undefined,
    // The fitment filter only means something with the module on.
    fitment: fitment ? first(raw.fitment) : undefined,
    stock: first(raw.stock),
    sort: first(raw.sort),
    attributes: attributeParams(raw),
    view: first(raw.view),
  });
  const pagination = parsePagination({ page: first(raw.page), limit: first(raw.limit) });
  // Phase 20: with more than one store the list shows the current store's stock.
  const storeView = await getStoreView();
  const [result, { tenant }, categories, attributes, units] = await Promise.all([
    getInventoryItems(filters, pagination, storeView.multi ? storeView.currentId : null),
    getShopSession(),
    getCategories(),
    getAttributes(),
    getUnits(),
  ]);
  const pastEnd = pastEndRedirect("/inventory", raw, result);
  if (pastEnd) redirect(pastEnd);
  const filtered = Boolean(
    filters.category || filters.search || filters.fitment || filters.stock || Object.keys(filters.attributes ?? {}).length,
  );
  return (
    <InventoryTable
      result={result}
      money={tenant.money}
      pricesIncludeTax={tenant.pricesIncludeTax}
      categories={categories}
      attributes={attributes}
      units={units}
      packsEnabled={tenant.packsEnabled}
      fitment={fitment}
      filtered={filtered}
      storeView={storeView}
      view={filters.view ?? "grouped"}
    />
  );
}

function ResultsSkeleton() {
  return (
    <section className="card inventory-table-card">
      <div className="inventory-summary"><div><h2>All inventory</h2></div></div>
      <div className="empty-state">Loading inventory…</div>
    </section>
  );
}

export default function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading inventory-heading">
        <Suspense
          fallback={
            <div>
              <span className="eyebrow">CATALOG MANAGEMENT</span>
              <h1>Inventory</h1>
            </div>
          }
        >
          <Heading />
        </Suspense>
        <div className="heading-actions">
          <ExportInventoryButton />
          <Suspense
            fallback={
              <button type="button" className="button" disabled>
                <Upload size={14} /> Import CSV
              </button>
            }
          >
            <ImportAction />
          </Suspense>
          <Suspense
            fallback={
              <button type="button" className="button button-primary" disabled>
                <Plus size={14} /> Add New Product
              </button>
            }
          >
            <AddItemAction />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<section className="card filter-card" aria-hidden="true" />}>
        <FiltersSection />
      </Suspense>
      <Suspense fallback={<ResultsSkeleton />}>
        <InventoryResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

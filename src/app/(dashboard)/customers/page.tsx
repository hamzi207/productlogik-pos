import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarChart3, Plus, Receipt, Users } from "lucide-react";
import { getCustomers, getCustomerStats, type CustomerStats as Stats } from "@/lib/actions/customers";
import { getShopSession } from "@/lib/auth";
import { getCustomerTags, getCustomerTypes } from "@/lib/customer-list-data";
import { formatMoney } from "@/lib/format";
import { parsePagination, pastEndRedirect } from "@/lib/pagination";
import { customerFiltersSchema } from "@/lib/validations/customer.schema";
import { CustomerFilters } from "@/components/customers/customer-filters";
import { AddCustomerButton, CustomerTable } from "@/components/customers/customer-table";
import { ExportCustomersButton } from "@/components/customers/export-customers-button";

export const metadata: Metadata = { title: "Customers" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function AddCustomerAction() {
  const { tenant } = await getShopSession();
  return <AddCustomerButton allowInternationalPhones={tenant.allowInternationalPhones} />;
}

function CustomerStats({ stats, money }: { stats: Stats; money: Parameters<typeof formatMoney>[1] }) {
  const { total, b2b, outstanding } = stats;
  return (
    <div className="customer-stats">
      <div>
        <span className="customer-stat-icon blue"><Users size={18} /></span>
        <div><strong>{total}</strong><span>Total customers</span></div>
      </div>
      <div>
        <span className="customer-stat-icon green"><BarChart3 size={18} /></span>
        <div><strong>{b2b}</strong><span>Business accounts (types that need tax details)</span></div>
      </div>
      <div>
        <span className="customer-stat-icon amber"><Receipt size={18} /></span>
        <div><strong>{formatMoney(outstanding, money)}</strong><span>Outstanding balance</span></div>
      </div>
    </div>
  );
}

async function CustomerDirectory({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = customerFiltersSchema.parse({
    search: first(raw.q) || undefined,
    type: first(raw.type),
    tag: first(raw.tag),
  });
  const filtered = Boolean(filters.search || filters.type || filters.tag);
  const pagination = parsePagination({ page: first(raw.page), limit: first(raw.limit) });
  const [{ tenant }, result, stats, types, tags] = await Promise.all([
    getShopSession(),
    getCustomers(filters, pagination),
    // Stats always describe the whole directory, not the filtered view or page.
    getCustomerStats(),
    getCustomerTypes(),
    getCustomerTags(),
  ]);
  const pastEnd = pastEndRedirect("/customers", raw, result);
  if (pastEnd) redirect(pastEnd);

  return (
    <>
      <CustomerStats stats={stats} money={tenant.money} />
      <section className="card customer-card">
        <Suspense>
          <CustomerFilters types={types} tags={tags} />
        </Suspense>
        <CustomerTable
          result={result}
          money={tenant.money}
          allowInternationalPhones={tenant.allowInternationalPhones}
          tags={tags}
          filtered={filtered}
        />
      </section>
    </>
  );
}

export default function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">B2B CRM</span>
          <h1>Customer Directory</h1>
          <p>Manage business accounts, contacts, and quote history.</p>
        </div>
        <div className="heading-actions">
          <ExportCustomersButton />
          <Suspense
            fallback={
              <button type="button" className="button button-primary" disabled>
                <Plus size={14} /> Register Customer
              </button>
            }
          >
            <AddCustomerAction />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<section className="card"><div className="empty-state">Loading customers…</div></section>}>
        <CustomerDirectory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

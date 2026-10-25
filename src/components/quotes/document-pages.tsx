import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, FilePen, FileText, Plus, ReceiptText } from "lucide-react";
import { getDocuments, getQuote } from "@/lib/actions/quotes";
import { getShopSession } from "@/lib/auth";
import { getDocumentStores, getStoreContext, storeFilter } from "@/lib/store";
import { StoreScope } from "@/components/shared/store-scope";
import { buildCategoryIndex } from "@/lib/categories";
import { getCategories, getCategoryCounts } from "@/lib/category-data";
import { hasModule } from "@/lib/module-data";
import {
  customerLabel,
  documentHref,
  earlierNumbers,
  isExpired,
  localDate,
  NUMBER_PREFIX,
  SECTION,
  sectionForStatus,
  statusDisplay,
  statusKey,
  type DocumentSection,
} from "@/lib/documents";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { CustomerOption, DocumentListItem } from "@/lib/types/quote";
import { parsePagination, pastEndRedirect } from "@/lib/pagination";
import { documentFiltersSchema } from "@/lib/validations/quote.schema";
import { CustomerAvatar } from "@/components/customers/customer-badges";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { DocumentFilters } from "./document-filters";
import { QuoteBuilder } from "./quote-builder";

// Server pages shared by /drafts, /quotations and /invoices (list, new, edit).

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ id: string }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const SECTION_ICON = { drafts: FilePen, quotations: FileText, invoices: ReceiptText } as const;

const sectionDate = (section: DocumentSection, d: DocumentListItem) =>
  section === "invoices" ? d.invoiced_at ?? d.created_at : section === "quotations" ? d.quoted_at ?? d.created_at : d.updated_at;

const CUSTOMER_COLUMNS = "id, name, customer_type, whatsapp_number, is_walk_in, default_discount_percentage, billing_address, credit_days, email";

// ---- List -------------------------------------------------------------------

async function DocumentTable({ section, searchParams }: { section: DocumentSection; searchParams: SearchParams }) {
  const raw = await searchParams;
  const filters = documentFiltersSchema.parse({ search: first(raw.q) || undefined, status: first(raw.status) || undefined });
  const pagination = parsePagination({ page: first(raw.page), limit: first(raw.limit) });
  const config = SECTION[section];
  // Phase 20: the current store's documents, or every store's with ?store=all.
  const [scope, ctx] = await Promise.all([storeFilter(first(raw.store)), getStoreContext()]);
  const storeName = new Map(ctx.stores.map((s) => [s.id, s.name]));
  const showStore = ctx.multi && scope.all;
  const [result, { tenant }] = await Promise.all([getDocuments(section, filters, pagination, scope.storeId), getShopSession()]);
  const pastEnd = pastEndRedirect(config.path, raw, result);
  if (pastEnd) redirect(pastEnd);
  const docs = result.rows;
  const Icon = SECTION_ICON[section];
  const today = localDate(tenant.timezone);
  const invoices = section === "invoices";

  if (result.total === 0) {
    const filtered = Boolean(filters.search || filters.status);
    return (
      <div className="empty-state">
        <span className="header-icon blue"><Icon size={18} /></span>
        {filtered ? (
          <>
            <strong>Nothing matches these filters</strong>
            Try a different search or status.
          </>
        ) : (
          <>
            <strong>No {config.title.toLowerCase()} yet</strong>
            {invoices
              ? "Bill a walk-in customer directly, or convert a quotation into an invoice."
              : section === "quotations"
                ? "Create a quotation, or convert a draft when it's ready."
                : "Start a draft to price up a job before sending it."}
            <div className="empty-state-action">
              <Link href={`${config.path}/new`} className="button button-primary">
                <Plus size={14} /> {config.newLabel}
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }

  const { total, owed } = result.sum;
  const dateLabel = section === "drafts" ? "LAST EDITED" : section === "quotations" ? "QUOTED" : "INVOICE DATE";

  return (
    <>
      <div className="table-wrap desktop-table">
        <table className="document-table">
          <thead>
            <tr>
              <th>NUMBER</th>
              <th>CUSTOMER</th>
              {showStore && <th>STORE</th>}
              <th>{dateLabel}</th>
              {invoices && <th>DUE DATE</th>}
              <th>STATUS</th>
              <th>TOTAL</th>
              {invoices && <th>BALANCE</th>}
              <th><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const href = documentHref(d);
              const earlier = earlierNumbers(d);
              const status = statusDisplay(statusKey(d, today));
              const balance = d.total_amount - Number(d.amount_paid);
              return (
                <tr key={d.id}>
                  <td>
                    <Link href={href} className="row-link">
                      <span className="mono strong">{d.quote_number}</span>
                    </Link>
                    {earlier.length > 0 && <span className="doc-earlier">from {earlier.join(" · ")}</span>}
                  </td>
                  <td>
                    {d.customer ? (
                      <div className="customer-name">
                        <CustomerAvatar name={d.customer.is_walk_in ? d.walk_in_name || "Walk in" : d.customer.name} />
                        <div>
                          <strong>{customerLabel(d, d.customer)}</strong>
                          <span className="doc-sub">{d.customer.is_walk_in ? "Cash sale" : d.customer.customer_type}</span>
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  {showStore && <td>{storeName.get(d.store_id) ?? "—"}</td>}
                  <td>{formatDate(sectionDate(section, d), tenant.timezone)}</td>
                  {invoices && <td>{d.due_date ? formatDate(`${d.due_date}T12:00:00Z`, "UTC") : "—"}</td>}
                  <td>
                    <span className={`badge ${status.tone}`}>{status.label}</span>
                    {isExpired(d) && <span className="badge badge-amber doc-expired" title="Past its validity date; stock is still reserved">Expired</span>}
                    {d.valid_until && !isExpired(d) && (d.status === "sent" || d.status === "accepted") && (
                      <span className="doc-sub">Valid until {formatDate(d.valid_until, tenant.timezone)}</span>
                    )}
                  </td>
                  <td className="amount">{formatMoney(d.total_amount, tenant.money)}</td>
                  {invoices && (
                    <td className={balance > 0 && d.status === "invoiced" ? "amount balance" : "amount settled"}>
                      {d.status === "void" ? "—" : formatMoney(balance, tenant.money)}
                    </td>
                  )}
                  <td>
                    <Link href={href} className="icon-button" aria-label={`Open ${d.quote_number}`}>
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Phones: one card per document instead of the wide table (CSS swaps them at 768px). */}
      <ul className="mobile-cards" aria-label={config.title}>
        {docs.map((d) => {
          const status = statusDisplay(statusKey(d, today));
          const balance = d.total_amount - Number(d.amount_paid);
          return (
            <li key={d.id} className="mobile-card">
              <Link href={documentHref(d)} className="mobile-card-main">
                <span className="mobile-card-top">
                  <span className="mono strong">{d.quote_number}</span>
                  <span className={`badge ${status.tone}`}>{status.label}</span>
                </span>
                <span className="mobile-card-title">{d.customer ? customerLabel(d, d.customer) : "—"}</span>
                <span className="mobile-card-meta">
                  <span className="mobile-card-muted">
                    {formatDate(sectionDate(section, d), tenant.timezone)}
                    {invoices && d.due_date && ` · due ${formatDate(`${d.due_date}T12:00:00Z`, "UTC")}`}
                    {isExpired(d) && " · expired"}
                  </span>
                  <span className="mobile-card-amounts">
                    <strong className="amount">{formatMoney(d.total_amount, tenant.money)}</strong>
                    {invoices && d.status === "invoiced" && balance > 0 && (
                      <span className="mobile-card-balance">Balance {formatMoney(balance, tenant.money)}</span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="table-footer">
        <span>
          Total{section === "drafts" ? "" : " (excluding cancelled)"}: <strong>{formatMoney(total, tenant.money)}</strong>
          {invoices && <> · Balance due: <strong>{formatMoney(owed, tenant.money)}</strong></>}
        </span>
      </div>
      <PaginationBar
        total={result.total}
        page={result.page}
        limit={result.limit}
        noun={[config.singular.toLowerCase(), config.title.toLowerCase()]}
      />
    </>
  );
}

export function DocumentListPage({ section, searchParams }: { section: DocumentSection; searchParams: SearchParams }) {
  const config = SECTION[section];
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <div className="heading-actions">
          <Link href={`${config.path}/new`} className="button button-primary">
            <Plus size={14} /> {config.newLabel}
          </Link>
        </div>
      </div>
      <section className="card customer-card">
        <Suspense>
          <DocumentFilters section={section} />
          <ListStoreScope searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<div className="empty-state">Loading {config.title.toLowerCase()}…</div>}>
          <DocumentTable section={section} searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}

/** "This store | All stores" above a list (more than one store, members who may see them all). */
export async function ListStoreScope({ searchParams }: { searchParams: SearchParams }) {
  const [raw, ctx] = await Promise.all([searchParams, getStoreContext()]);
  if (!ctx.multi || !ctx.canSeeAll) return null;
  const scope = await storeFilter(first(raw.store));
  return (
    <div className="store-scope-bar">
      <StoreScope storeName={ctx.current.name} all={scope.all} />
    </div>
  );
}

// ---- Builder (new / edit) ---------------------------------------------------

async function getWalkIn(): Promise<CustomerOption | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select(CUSTOMER_COLUMNS).eq("is_walk_in", true).maybeSingle();
  return data;
}

function BuilderSkeleton() {
  return (
    <div className="page quote-page">
      <section className="card"><div className="empty-state">Loading…</div></section>
    </div>
  );
}

/**
 * Main categories that hold products, for the filter chips in the phone product search. An industry
 * catalog has many main categories the organization may not stock, so empty ones are left out.
 */
async function mainCategories() {
  const [categories, counts] = await Promise.all([getCategories(), getCategoryCounts()]);
  return buildCategoryIndex(categories, counts)
    .roots.filter((c) => c.itemCount > 0)
    .map(({ id, name, displayColor }) => ({ id, name, color: displayColor }));
}

async function NewDocument({ section, searchParams }: { section: DocumentSection; searchParams: SearchParams }) {
  const raw = await searchParams;
  const customerId = first(raw.customer);
  const [{ tenant, role }, walkIn, categories, vehicleSearch, stores] = await Promise.all([
    getShopSession(),
    getWalkIn(),
    mainCategories(),
    hasModule("vehicle_fitment"),
    getDocumentStores(null),
  ]);

  // ?customer=<id> pre-selects a customer (from their profile page).
  let initialCustomer: CustomerOption | null = null;
  if (customerId && /^[0-9a-f-]{36}$/i.test(customerId)) {
    const supabase = await createClient();
    const { data } = await supabase.from("customers").select(CUSTOMER_COLUMNS).eq("id", customerId).maybeSingle();
    initialCustomer = data;
  }

  // The next number in line. Nothing is reserved: if this document is never
  // saved the number stays free, and if someone else saves first this one
  // simply gets the next free number when it is saved.
  const supabase = await createClient();
  // Phase 20: numbered in the current store's series when the organization numbers per store (RF-20.2).
  const { data: nextNumber } = await supabase.rpc("next_document_number", { p_prefix: NUMBER_PREFIX[section], p_store_id: stores.docStoreId });

  const today = localDate(tenant.timezone);
  return (
    <QuoteBuilder
      doc={null}
      section={section}
      title={SECTION[section].newLabel}
      numberPreview={nextNumber ?? null}
      meta={[
        { label: "Number", value: nextNumber ?? "Assigned when saved" },
        ...(stores.multi ? [{ label: "Store", value: stores.docStoreName }] : []),
        { label: "Date", value: formatDate(new Date(), tenant.timezone) },
        ...(section === "quotations" ? [{ label: "Valid for", value: `${tenant.quoteValidityDays} days` }] : []),
      ]}
      status={null}
      today={today}
      invoiceDate={today}
      money={tenant.money}
      taxRate={tenant.taxRate}
      customIncludesTax={tenant.pricesIncludeTax}
      allowInternationalPhones={tenant.allowInternationalPhones}
      terms={section === "invoices" ? tenant.invoiceTerms : tenant.quoteTerms}
      shopName={tenant.name}
      printFormat={tenant.printFormat}
      initialCustomer={initialCustomer}
      walkIn={walkIn}
      categories={categories}
      vehicleSearch={vehicleSearch}
      stores={stores}
      isAdmin={role === "admin"}
    />
  );
}

export function NewDocumentPage({ section, searchParams }: { section: DocumentSection; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<BuilderSkeleton />}>
      <NewDocument section={section} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditDocument({ section, params }: { section: DocumentSection; params: Params }) {
  const { id } = await params;
  const [doc, { tenant, role }, walkIn, categories, vehicleSearch] = await Promise.all([
    getQuote(id),
    getShopSession(),
    getWalkIn(),
    mainCategories(),
    hasModule("vehicle_fitment"),
  ]);
  if (!doc) notFound();
  const stores = await getDocumentStores(doc.store_id);

  // A converted document lives in its new section: /drafts/x → /invoices/x.
  const actual = sectionForStatus(doc.status);
  if (actual !== section) redirect(`${SECTION[actual].path}/${doc.id}`);

  const tz = tenant.timezone;
  const today = localDate(tz);
  const earlier = earlierNumbers(doc);
  const meta = [
    { label: "Number", value: doc.quote_number },
    ...(stores.multi ? [{ label: "Store", value: stores.docStoreName }] : []),
    ...(earlier.length ? [{ label: doc.status === "draft" ? "Was" : "From", value: earlier.join(" · ") }] : []),
    { label: "Created", value: formatDate(doc.created_at, tz) },
    ...(doc.quoted_at && actual === "quotations" ? [{ label: "Quoted", value: formatDate(doc.quoted_at, tz) }] : []),
    ...(doc.invoiced_at ? [{ label: "Invoice date", value: formatDate(doc.invoiced_at, tz) }] : []),
    ...((doc.status === "sent" || doc.status === "accepted") && doc.valid_until
      ? [{ label: isExpired(doc) ? "Expired" : "Valid until", value: formatDate(doc.valid_until, tz) }]
      : []),
  ];

  return (
    <QuoteBuilder
      // Remount after every save so the form starts from what was stored.
      key={`${doc.id}:${doc.updated_at}`}
      doc={doc}
      section={section}
      title={`${SECTION[actual].singular} ${doc.quote_number}`}
      meta={meta}
      status={statusKey(doc, today)}
      today={today}
      numberPreview={null}
      invoiceDate={doc.invoiced_at ? localDate(tz, doc.invoiced_at) : today}
      money={tenant.money}
      taxRate={doc.status === "draft" ? tenant.taxRate : Number(doc.tax_rate)}
      customIncludesTax={tenant.pricesIncludeTax}
      allowInternationalPhones={tenant.allowInternationalPhones}
      terms={actual === "invoices" ? tenant.invoiceTerms : tenant.quoteTerms}
      shopName={tenant.name}
      printFormat={tenant.printFormat}
      initialCustomer={null}
      walkIn={walkIn}
      categories={categories}
      vehicleSearch={vehicleSearch}
      stores={stores}
      isAdmin={role === "admin"}
    />
  );
}

export function EditDocumentPage({ section, params }: { section: DocumentSection; params: Params }) {
  return (
    <Suspense fallback={<BuilderSkeleton />}>
      <EditDocument section={section} params={params} />
    </Suspense>
  );
}

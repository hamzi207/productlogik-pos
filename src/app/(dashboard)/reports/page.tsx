import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Boxes, Percent, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { getShopSession } from "@/lib/auth";
import { parseDashboardRange, RANGE_LABEL } from "@/lib/dashboard";
import { localDate } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCustomerTags } from "@/lib/customer-list-data";
import { formatQty } from "@/lib/uom";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { CsvButton } from "@/components/reports/csv-button";
import { ReportTagFilter } from "@/components/reports/report-tag-filter";
import { SalesChart } from "@/components/reports/sales-chart";

export const metadata: Metadata = { title: "Reports" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Bucket = { count: number; total: number };
type Report = {
  from: string;
  to: string;
  grain: "day" | "month" | "year";
  summary: { sales: number; tax: number; cost: number; invoices: number; outstanding: number; collected: number };
  series: { start: string; sales: number }[];
  /** qty is in the product's base unit (packs converted, Phase 19). */
  products: { name: string; sku: string | null; custom: boolean; qty: number; unit: string | null; revenue: number; profit: number }[];
  customers: { id: string; name: string; invoices: number; sales: number; outstanding: number }[];
  payments: { method: string; count: number; amount: number }[];
  aging: { notDue: Bucket; d30: Bucket; d60: Bucket; d60plus: Bucket };
  stock: {
    items: number;
    units: number;
    reserved: number;
    costValue: number;
    retailValue: number;
    low: { name: string; sku: string; free: number; threshold: number; unit: string | null }[];
  };
};

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const day = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));
const pct = (n: number) => `${n.toFixed(1)}%`;

function Section({ title, hint, action, children }: { title: string; hint: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card report-section">
      <div className="card-header">
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ icon, tone, label, value, note }: { icon: ReactNode; tone: string; label: string; value: string; note: string }) {
  return (
    <section className={`card stat-card ${tone}`}>
      <div className="stat-head">
        <span className={`metric-icon ${tone}`}>{icon}</span>
        <h3>{label}</h3>
      </div>
      <strong>{value}</strong>
      <span>{note}</span>
    </section>
  );
}

async function ReportBody({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const range = parseDashboardRange(raw);
  const [{ tenant }, supabase, tags] = await Promise.all([getShopSession(), createClient(), getCustomerTags()]);
  // RF-19.2: ?tag= limits invoices, payments and money owed to customers with that tag.
  const tag = tags.find((t) => t.id === raw.tag) ?? null;
  const { data, error } = await supabase.rpc("report_data", {
    p_range: range.range,
    ...(range.from ? { p_from: range.from } : {}),
    ...(range.to ? { p_to: range.to } : {}),
    ...(tag ? { p_tag: tag.id } : {}),
  });
  if (error) {
    console.error("report_data failed:", error.message);
    throw new Error("Could not load the report.");
  }
  const r = data as unknown as Report;
  const money = (n: number) => formatMoney(Number(n), tenant.money);
  const s = r.summary;
  const net = Number(s.sales) - Number(s.tax);
  const profit = net - Number(s.cost);
  const period = r.from === r.to ? day(r.from) : `${day(r.from)} – ${day(r.to)}`;
  const file = (name: string) => `${name}${tag ? `-${tag.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}-${r.from}-to-${r.to}.csv`;
  const who = tag ? ` Customers tagged ${tag.name} only.` : "";
  const aging = [
    { label: "Not yet due", ...r.aging.notDue },
    { label: "1–30 days late", ...r.aging.d30 },
    { label: "31–60 days late", ...r.aging.d60 },
    { label: "Over 60 days late", ...r.aging.d60plus },
  ];
  const owed = aging.reduce((sum, a) => sum + Number(a.total), 0);

  return (
    <>
      <div className="metrics-head report-head">
        <div>
          <h2>{range.range === "custom" ? "Custom dates" : RANGE_LABEL[range.range]}</h2>
          <p>{period} · in your shop&apos;s timezone. Sales are invoices (including tax), not quotations.{who}</p>
        </div>
        <div className="report-filters">
          {tags.length > 0 && <ReportTagFilter tags={tags} value={tag?.id ?? null} />}
          <DateRangePicker range={range.range} from={r.from} to={r.to} today={localDate(tenant.timezone)} weekStart={tenant.weekStart} keep={tag ? { tag: tag.id } : undefined} />
        </div>
      </div>

      <div className="stat-grid report-stats">
        <Stat icon={<Banknote size={16} />} tone="green" label="Sales" value={money(s.sales)} note={`${s.invoices} ${s.invoices === 1 ? "invoice" : "invoices"} · avg ${money(s.invoices ? s.sales / s.invoices : 0)}`} />
        <Stat icon={<TrendingUp size={16} />} tone="blue" label="Profit" value={money(profit)} note={net > 0 ? `${pct((profit / net) * 100)} margin on ${money(net)} excl. tax` : "No sales in these dates"} />
        <Stat icon={<Wallet size={16} />} tone="purple" label="Payments collected" value={money(s.collected)} note="Received in these dates (any invoice)" />
        <Stat icon={<ReceiptText size={16} />} tone={Number(s.outstanding) > 0 ? "amber" : "green"} label="Still owed" value={money(s.outstanding)} note="On invoices from these dates" />
      </div>

      <Section title="Sales over time" hint={`Invoiced totals by ${r.grain}.`}>
        <div className="report-chart"><SalesChart series={r.series} grain={r.grain} money={tenant.money} /></div>
      </Section>

      <div className="report-grid">
        <Section
          title="Top products"
          hint={`By sales (excluding tax, after discounts) in these dates. Quantities are in each product's base unit.${who}`}
          action={<CsvButton filename={file("products")} header={["Product", "SKU", "Quantity sold", "Unit", "Sales excl. tax", "Profit", "Margin %"]} rows={r.products.map((p) => [p.name, p.sku ?? (p.custom ? "custom item" : ""), p.qty, p.unit ?? "", p.revenue, p.profit, p.revenue > 0 ? Number(((p.profit / p.revenue) * 100).toFixed(1)) : null])} />}
        >
          {r.products.length === 0 ? (
            <div className="empty-state compact">No sales in these dates.</div>
          ) : (
            <div className="table-wrap">
              <table className="report-table">
                <thead><tr><th>PRODUCT</th><th className="num">QTY</th><th className="num">SALES</th><th className="num">PROFIT</th><th className="num">MARGIN</th></tr></thead>
                <tbody>
                  {r.products.map((p, i) => (
                    <tr key={i}>
                      <td><strong>{p.name}</strong><span>{p.sku ?? "Custom item"}</span></td>
                      <td className="num">{formatQty(Number(p.qty), p.unit)}</td>
                      <td className="num">{money(p.revenue)}</td>
                      <td className="num">{money(p.profit)}</td>
                      <td className="num">{p.revenue > 0 ? pct((p.profit / p.revenue) * 100) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title="Top customers"
          hint={`By invoiced sales in these dates.${who}`}
          action={<CsvButton filename={file("customers")} header={["Customer", "Invoices", "Sales", "Still owed"]} rows={r.customers.map((c) => [c.name, c.invoices, c.sales, c.outstanding])} />}
        >
          {r.customers.length === 0 ? (
            <div className="empty-state compact">No sales in these dates.</div>
          ) : (
            <div className="table-wrap">
              <table className="report-table">
                <thead><tr><th>CUSTOMER</th><th className="num">INVOICES</th><th className="num">SALES</th><th className="num">STILL OWED</th></tr></thead>
                <tbody>
                  {r.customers.map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/customers/${c.id}`}><strong>{c.name}</strong></Link></td>
                      <td className="num">{c.invoices}</td>
                      <td className="num">{money(c.sales)}</td>
                      <td className={`num${Number(c.outstanding) > 0 ? " owed" : ""}`}>{money(c.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title="Payments by method"
          hint={`Money received in these dates.${who}`}
          action={<CsvButton filename={file("payments")} header={["Method", "Payments", "Amount"]} rows={r.payments.map((p) => [p.method === "Check" ? "Cheque" : p.method, p.count, p.amount])} />}
        >
          {r.payments.length === 0 ? (
            <div className="empty-state compact">No payments received in these dates.</div>
          ) : (
            <div className="table-wrap">
              <table className="report-table">
                <thead><tr><th>METHOD</th><th className="num">PAYMENTS</th><th className="num">AMOUNT</th></tr></thead>
                <tbody>
                  {r.payments.map((p) => (
                    <tr key={p.method}>
                      <td><strong>{p.method === "Check" ? "Cheque" : p.method}</strong></td>
                      <td className="num">{p.count}</td>
                      <td className="num">{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title="Money owed to you (today)"
          hint={`All unpaid invoices by how late they are: ${money(owed)} in total.${who}`}
          action={<CsvButton filename={`receivables-${localDate(tenant.timezone)}.csv`} header={["Age", "Invoices", "Balance"]} rows={aging.map((a) => [a.label, a.count, a.total])} />}
        >
          <div className="table-wrap">
            <table className="report-table">
              <thead><tr><th>AGE</th><th className="num">INVOICES</th><th className="num">BALANCE</th></tr></thead>
              <tbody>
                {aging.map((a, i) => (
                  <tr key={a.label}>
                    <td><strong>{a.label}</strong></td>
                    <td className="num">{a.count}</td>
                    <td className={`num${i > 0 && Number(a.total) > 0 ? " owed" : ""}`}>{money(a.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section
        title="Stock (today)"
        hint={`${r.stock.items} products in stock, across every customer.`}
        action={<CsvButton filename={`low-stock-${localDate(tenant.timezone)}.csv`} header={["Product", "SKU", "Available", "Low-stock level", "Unit"]} rows={r.stock.low.map((l) => [l.name, l.sku, l.free, l.threshold, l.unit ?? ""])} />}
      >
        <div className="stock-values">
          <div><Boxes size={16} /><span>Stock value at cost</span><strong>{money(r.stock.costValue)}</strong></div>
          <div><Banknote size={16} /><span>At selling prices</span><strong>{money(r.stock.retailValue)}</strong></div>
          <div><Percent size={16} /><span>Potential margin</span><strong>{Number(r.stock.retailValue) > 0 ? pct(((r.stock.retailValue - r.stock.costValue) / r.stock.retailValue) * 100) : "—"}</strong></div>
        </div>
        {r.stock.low.length === 0 ? (
          <div className="empty-state compact">Nothing is low on stock.</div>
        ) : (
          <div className="table-wrap">
            <table className="report-table">
              <thead><tr><th>LOW / OUT OF STOCK</th><th className="num">AVAILABLE</th><th className="num">LOW-STOCK LEVEL</th></tr></thead>
              <tbody>
                {r.stock.low.map((l) => (
                  <tr key={l.sku}>
                    <td><Link href={`/inventory?q=${encodeURIComponent(l.sku)}`}><strong>{l.name}</strong></Link><span>{l.sku}</span></td>
                    <td className={`num${l.free <= 0 ? " owed" : ""}`}>{formatQty(Number(l.free), l.unit)}</td>
                    <td className="num">{formatQty(Number(l.threshold), l.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

export default function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="page reports-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">INSIGHTS</span>
          <h1>Reports</h1>
          <p>Sales, profit, payments, money owed and stock. Pick the dates, export any table to CSV.</p>
        </div>
      </div>
      <Suspense fallback={<section className="card"><div className="empty-state">Loading report…</div></section>}>
        <ReportBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

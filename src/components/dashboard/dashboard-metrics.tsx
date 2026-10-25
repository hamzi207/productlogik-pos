import type { ReactNode } from "react";
import Link from "next/link";
import { Banknote, FileText, Package, ReceiptText, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { getDashboardMetrics } from "@/lib/actions/dashboard";
import { getShopSession } from "@/lib/auth";
import { localDate } from "@/lib/documents";
import { WEEK_START_LABEL } from "@/lib/validations/settings.schema";
import { parseDashboardRange, WIDGET_HINT, WIDGET_LABEL, type Widget } from "@/lib/dashboard";
import { formatMoney } from "@/lib/format";
import { CustomizeDashboard } from "./customize-dashboard";
import { DateRangePicker } from "./date-range-picker";
import { StoreScope } from "@/components/shared/store-scope";
import { getStoreContext, storeFilter } from "@/lib/store";
import { ALL_STORES } from "@/lib/stores";
import { MetricChart } from "./metric-chart";

type MoneyWidget = Exclude<Widget, "counts">;

const ICON: Record<MoneyWidget, { icon: LucideIcon; tone: string; href: string }> = {
  sales: { icon: Banknote, tone: "green", href: "/invoices" },
  profit: { icon: TrendingUp, tone: "blue", href: "/invoices" },
  pendingInvoices: { icon: ReceiptText, tone: "amber", href: "/invoices?status=pending" },
  pendingQuotations: { icon: FileText, tone: "purple", href: "/quotations" },
};

function MetricCard({ widget, children }: { widget: MoneyWidget; children: ReactNode }) {
  const { icon: Icon, tone, href } = ICON[widget];
  return (
    <section className="card metric-card">
      <Link href={href} className="metric-head">
        <span className={`metric-icon ${tone}`}><Icon size={16} /></span>
        <div>
          <h3>{WIDGET_LABEL[widget]}</h3>
          <p>{WIDGET_HINT[widget]}</p>
        </div>
      </Link>
      {children}
    </section>
  );
}

/** The range's headline figure with a short breakdown under it. */
function Figures({ hero, note, rows }: { hero: string; note: string; rows: [string, ReactNode][] }) {
  return (
    <>
      <div className="metric-hero">
        <strong>{hero}</strong>
        <span>{note}</span>
      </div>
      <dl className="metric-rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Sales / profit / pipeline widgets and directory counts for the chosen dates, each as numbers, bars or a pie (per user). */
export async function DashboardMetrics({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const range = parseDashboardRange(raw);
  // Phase 20: the current store's figures, or every store's with ?store=all.
  const [scope, ctx] = await Promise.all([storeFilter(raw.store), getStoreContext()]);
  const [{ tenant, dashboardPrefs: prefs }, m] = await Promise.all([getShopSession(), getDashboardMetrics(range, scope.storeId)]);
  const money = (n: number) => formatMoney(Number(n), tenant.money);
  const show = (w: Widget) => prefs.widgets.includes(w);
  const chart = (w: Widget) => {
    const mode = prefs.display[w];
    return mode === "numbers" ? null : <MetricChart widget={w} display={mode} metrics={m} money={tenant.money} />;
  };

  const sales = Number(m.sales);
  const tax = Number(m.tax);
  const profit = Number(m.profit);
  const net = sales - tax;
  const a = m.aging;
  const overdue = Number(a.overdue30.total) + Number(a.overdue60.total) + Number(a.overdue60plus.total);

  const counts = [
    { label: "Customers", value: m.counts.customers, icon: Users, href: "/customers" },
    { label: "Products", value: m.counts.products, icon: Package, href: "/inventory" },
    // Same column order as the cards below: Invoices sits above Pending invoices, Quotations above Pending quotations.
    { label: "Invoices", value: m.counts.invoices, icon: ReceiptText, href: "/invoices" },
    { label: "Quotations", value: m.counts.quotations, icon: FileText, href: "/quotations" },
  ];

  return (
    <section className="metrics-section" aria-label="Business overview">
      <div className="metrics-head">
        <div>
          <h2>Business overview</h2>
          <p>In your shop&apos;s timezone; weeks start on {WEEK_START_LABEL[tenant.weekStart]}.</p>
        </div>
        <div className="metrics-actions">
          {ctx.multi && ctx.canSeeAll && <StoreScope storeName={ctx.current.name} all={scope.all} />}
          <DateRangePicker range={range.range} from={m.from} to={m.to} today={localDate(tenant.timezone)} weekStart={tenant.weekStart} keep={scope.all && ctx.multi ? { store: ALL_STORES } : undefined} />
          <CustomizeDashboard prefs={prefs} />
        </div>
      </div>

      {prefs.widgets.length === 0 && (
        <div className="card empty-state compact">All widgets are hidden. Use Customize to show them again.</div>
      )}

      {show("counts") &&
        (prefs.display.counts === "numbers" ? (
          <div className="count-grid">
            {counts.map(({ label, value, icon: Icon, href }) => (
              <Link key={label} href={href} className="card count-card">
                <Icon size={16} />
                <strong>{value}</strong>
                <span>{label}</span>
              </Link>
            ))}
          </div>
        ) : (
          <section className="card metric-card">
            <div className="metric-head">
              <span className="metric-icon blue"><Users size={16} /></span>
              <div>
                <h3>{WIDGET_LABEL.counts}</h3>
                <p>{WIDGET_HINT.counts}</p>
              </div>
            </div>
            {chart("counts")}
          </section>
        ))}

      <div className="metric-grid">
        {show("sales") && (
          <MetricCard widget="sales">
            {chart("sales") ?? (
              <Figures
                hero={money(sales)}
                note={plural(m.invoiceCount, "invoice")}
                rows={[
                  ["Average invoice", money(m.invoiceCount ? sales / m.invoiceCount : 0)],
                  ["Sales excl. tax", money(net)],
                  ["Tax collected", money(tax)],
                ]}
              />
            )}
          </MetricCard>
        )}
        {show("profit") && (
          <MetricCard widget="profit">
            {chart("profit") ?? (
              <Figures
                hero={money(profit)}
                note={net > 0 ? `${((profit / net) * 100).toFixed(1)}% margin` : "No sales in these dates"}
                rows={[
                  ["Sales excl. tax", money(net)],
                  ["Cost of goods", money(Math.max(net - profit, 0))],
                ]}
              />
            )}
          </MetricCard>
        )}
        {show("pendingInvoices") && (
          <MetricCard widget="pendingInvoices">
            {chart("pendingInvoices") ?? (
              <Figures
                hero={money(m.pendingInvoices.total)}
                note={`${plural(m.pendingInvoices.count, "invoice")} unpaid`}
                rows={[
                  ["Overdue", money(overdue)],
                  ["Not yet due", money(a.notDue.total)],
                ]}
              />
            )}
          </MetricCard>
        )}
        {show("pendingQuotations") && (
          <MetricCard widget="pendingQuotations">
            {chart("pendingQuotations") ?? (
              <Figures
                hero={money(m.pendingQuotations.total)}
                note={`${plural(m.pendingQuotations.count, "quotation")} open`}
                rows={[
                  ["Sent", money(m.quotesByStatus.sent.total)],
                  ["Accepted", money(m.quotesByStatus.accepted.total)],
                ]}
              />
            )}
          </MetricCard>
        )}
      </div>
    </section>
  );
}

export function DashboardMetricsSkeleton() {
  return (
    <section className="metrics-section">
      <div className="metrics-head"><div><h2>Business overview</h2><p>Loading figures…</p></div></div>
    </section>
  );
}

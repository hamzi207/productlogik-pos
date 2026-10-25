"use client";

import { type DashboardMetrics, type Widget } from "@/lib/dashboard";
import { formatDayMonth, formatMoney, formatMonth, type MoneyFormat } from "@/lib/format";
import { BarChart, DonutChart } from "./charts";

type Props = {
  widget: Widget;
  display: "bar" | "pie";
  metrics: DashboardMetrics;
  money: MoneyFormat;
};

/** "09 Oct", "Oct" (or "Oct 25" when the range spans years), "2026". */
function stepLabel(start: string, grain: DashboardMetrics["grain"], spansYears: boolean) {
  if (grain === "day") return formatDayMonth(start);
  if (grain === "month") return spansYears ? `${formatMonth(start, false)} ${start.slice(2, 4)}` : formatMonth(start, false);
  return start.slice(0, 4);
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What each card's chart shows, for the chosen date range:
 *   sales / profit       bar: by day / month / year · pie: split into profit, cost of parts, tax
 *   pending invoices     bar: unpaid balance by age · pie: overdue vs not yet due
 *   pending quotations   bar & pie: sent vs accepted
 *   counts               bar: customers, products, quotations, invoices
 */
export function MetricChart({ widget, display, metrics: m, money }: Props) {
  const fmt = (n: number) => formatMoney(Number(n), money);
  const count = (n: number) => String(n);

  if (widget === "counts") {
    return (
      <BarChart
        title="Directory counts"
        format={count}
        bars={[
          { label: "Customers", value: m.counts.customers },
          { label: "Products", value: m.counts.products },
          { label: "Invoices", value: m.counts.invoices },
          { label: "Quotations", value: m.counts.quotations },
        ]}
      />
    );
  }

  if (display === "bar") {
    if (widget === "sales" || widget === "profit") {
      const spansYears = m.from.slice(0, 4) !== m.to.slice(0, 4);
      return (
        <BarChart
          title={`${widget === "sales" ? "Sales" : "Profit"} by ${m.grain}`}
          format={fmt}
          bars={m.series.map((step) => ({ label: stepLabel(step.start, m.grain, spansYears), value: Math.max(Number(step[widget]), 0) }))}
        />
      );
    }
    if (widget === "pendingInvoices") {
      const a = m.aging;
      return (
        <BarChart
          title="Unpaid balance by age"
          format={fmt}
          bars={[
            { label: "Not due", value: Number(a.notDue.total), detail: plural(a.notDue.count, "invoice") },
            { label: "1–30 d", value: Number(a.overdue30.total), detail: plural(a.overdue30.count, "invoice") },
            { label: "31–60 d", value: Number(a.overdue60.total), detail: plural(a.overdue60.count, "invoice") },
            { label: "60+ d", value: Number(a.overdue60plus.total), detail: plural(a.overdue60plus.count, "invoice") },
          ]}
        />
      );
    }
    const q = m.quotesByStatus;
    return (
      <BarChart
        title="Open quotations"
        format={fmt}
        bars={[
          { label: "Sent", value: Number(q.sent.total), detail: plural(q.sent.count, "quotation") },
          { label: "Accepted", value: Number(q.accepted.total), detail: plural(q.accepted.count, "quotation") },
        ]}
      />
    );
  }

  // ---- Pie (part-to-whole) ----
  if (widget === "sales" || widget === "profit") {
    const sales = Number(m.sales);
    const tax = Number(m.tax);
    const profit = Number(m.profit);
    const cost = Math.max(sales - tax - profit, 0);
    return widget === "sales" ? (
      <DonutChart
        title="Sales"
        format={fmt}
        centre={fmt(sales)}
        slices={[
          { label: "Profit", value: profit },
          { label: "Cost of goods", value: cost },
          { label: "Tax", value: tax },
        ]}
      />
    ) : (
      <DonutChart
        title="Profit"
        format={fmt}
        centre={fmt(profit)}
        slices={[
          { label: "Profit", value: profit },
          { label: "Cost of goods", value: cost },
        ]}
      />
    );
  }
  if (widget === "pendingInvoices") {
    const a = m.aging;
    const overdue = Number(a.overdue30.total) + Number(a.overdue60.total) + Number(a.overdue60plus.total);
    const overdueCount = a.overdue30.count + a.overdue60.count + a.overdue60plus.count;
    return (
      <DonutChart
        title="Unpaid balance"
        format={fmt}
        slices={[
          { label: "Not yet due", value: Number(a.notDue.total), detail: plural(a.notDue.count, "invoice") },
          { label: "Overdue", value: overdue, detail: plural(overdueCount, "invoice") },
        ]}
      />
    );
  }
  const q = m.quotesByStatus;
  return (
    <DonutChart
      title="Open quotations"
      format={fmt}
      slices={[
        { label: "Sent", value: Number(q.sent.total), detail: plural(q.sent.count, "quotation") },
        { label: "Accepted", value: Number(q.accepted.total), detail: plural(q.accepted.count, "quotation") },
      ]}
    />
  );
}

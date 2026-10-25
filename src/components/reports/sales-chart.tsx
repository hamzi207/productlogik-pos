"use client";

import { BarChart } from "@/components/dashboard/charts";
import { formatDayMonth, formatMoney, formatMonth, type MoneyFormat } from "@/lib/format";

/** Sales per day / month / year across the report's dates. */
export function SalesChart({ series, grain, money }: { series: { start: string; sales: number }[]; grain: "day" | "month" | "year"; money: MoneyFormat }) {
  const label = (iso: string) =>
    grain === "day" ? formatDayMonth(iso) : grain === "month" ? `${formatMonth(iso, false)} ${iso.slice(2, 4)}` : iso.slice(0, 4);
  return (
    <BarChart
      title={`Sales by ${grain}`}
      format={(n) => formatMoney(n, money)}
      bars={series.map((s) => ({ label: label(s.start), value: Math.max(Number(s.sales), 0) }))}
    />
  );
}

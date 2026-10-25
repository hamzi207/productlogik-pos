"use client";

import { BarChart } from "@/components/dashboard/charts";
import { formatMonth } from "@/lib/format";

/** New shops per month (reuses the dashboard's bar chart). */
export function SignupsChart({ signups }: { signups: { month: string; count: number }[] }) {
  const bars = signups.map((s) => ({
    label: formatMonth(`${s.month}-01`, false),
    value: s.count,
    detail: `${s.month}: ${s.count} ${s.count === 1 ? "shop" : "shops"}`,
  }));
  return <BarChart bars={bars} format={(n) => String(n)} title="New organizations per month" />;
}

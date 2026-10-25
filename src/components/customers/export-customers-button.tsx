"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { exportCustomersCsv } from "@/lib/actions/customers";
import { downloadCsv, toCsv } from "@/lib/csv";
import { notify } from "@/lib/notify";

const today = () => new Date().toISOString().slice(0, 10);

/** "Export CSV" on the customer directory: every customer with their type and tags (RF-19.2). */
export function ExportCustomersButton() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const result = await exportCustomersCsv().catch(() => null);
    setBusy(false);
    if (!result || result.status === "error") return notify.error("Export failed", result?.message ?? "Please try again.");
    const filename = `customers-${today()}.csv`;
    downloadCsv(filename, toCsv(result.header, result.rows));
    notify.success("Customers exported", `${filename} · ${result.rows.length} ${result.rows.length === 1 ? "customer" : "customers"}.`);
  };
  return (
    <button type="button" className="button" onClick={run} disabled={busy}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export CSV
    </button>
  );
}

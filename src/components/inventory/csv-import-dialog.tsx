"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { CheckCircle2, Download, FileSpreadsheet, FileUp, Loader2, Upload, X } from "lucide-react";
import { ModalSheet } from "@/components/shared/modal-sheet";
import {
  checkInventoryCsv,
  exportInventoryCsv,
  importInventoryCsv,
  inventoryCsvTemplate,
  type CsvImportResult,
  type CsvRowCheck,
} from "@/lib/actions/inventory-csv";
import { downloadCsv, toCsv } from "@/lib/csv";
import { FITMENT_COLUMNS, importBatches, MAX_IMPORT_ROWS, readInventoryCsv, type CsvItemRow } from "@/lib/inventory-csv";
import { notify } from "@/lib/notify";

const today = () => new Date().toISOString().slice(0, 10);

/** "Export CSV": every item in the shop (all pages, not just the one on screen). */
export function ExportInventoryButton() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const result = await exportInventoryCsv().catch(() => null);
    setBusy(false);
    if (!result || result.status === "error") return notify.error("Export failed", result?.message ?? "Please try again.");
    const filename = `inventory-${today()}.csv`;
    downloadCsv(filename, toCsv(result.header, result.rows));
    notify.success("Inventory exported", `${filename} · ${result.rows.length} ${result.rows.length === 1 ? "item" : "items"}.`);
  };
  return (
    <button type="button" className="button" onClick={run} disabled={busy}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export CSV
    </button>
  );
}

/** `fitment`: the Vehicle Fitment module is on (Universal / Vehicles columns count). */
export function ImportInventoryButton({ fitment }: { fitment: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        <Upload size={14} /> Import CSV
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <ModalSheet className="modal modal-csv">{open && <CsvImport fitment={fitment} onClose={() => setOpen(false)} />}</ModalSheet>
      </Dialog.Root>
    </>
  );
}

type Step =
  | { kind: "choose"; error?: string }
  | { kind: "checking"; file: string }
  | { kind: "preview"; file: string; rows: CsvItemRow[]; checks: CsvRowCheck[]; ignoredFitment: boolean }
  | { kind: "importing"; file: string; done: number; total: number }
  | { kind: "done"; results: CsvImportResult[] };

/** Choose a file → preview (every row checked on the server, problems highlighted) → import in batches. */
function CsvImport({ fitment, onClose }: { fitment: boolean; onClose: () => void }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const busy = step.kind === "checking" || step.kind === "importing";

  const check = async (file: string, rows: CsvItemRow[], update: boolean, ignoredFitment: boolean) => {
    setStep({ kind: "checking", file });
    const result = await checkInventoryCsv(rows, update).catch(() => null);
    if (!result || result.status === "error") return setStep({ kind: "choose", error: result?.message ?? "We couldn't check the file. Please try again." });
    setStep({ kind: "preview", file, rows, checks: result.rows, ignoredFitment });
  };

  const choose = async (file: File) => {
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return setStep({ kind: "choose", error: "Choose a .csv file (in Excel: File → Save As → CSV UTF-8)." });
    if (file.size > 2 * 1024 * 1024) return setStep({ kind: "choose", error: "The file is larger than 2 MB. Split it into smaller files." });
    const parsed = readInventoryCsv(await file.text());
    if (parsed.error) return setStep({ kind: "choose", error: parsed.error });
    await check(file.name, parsed.rows, updateExisting, !fitment && parsed.columns.some((c) => FITMENT_COLUMNS.includes(c)));
  };

  const toggleUpdate = (value: boolean) => {
    setUpdateExisting(value);
    if (step.kind === "preview") void check(step.file, step.rows, value, step.ignoredFitment);
  };

  const runImport = async () => {
    if (step.kind !== "preview") return;
    const good = new Set(step.checks.filter((c) => c.action !== "error").map((c) => c.line));
    const rows = step.rows.filter((r) => good.has(r.line));
    const results: CsvImportResult[] = [];
    setStep({ kind: "importing", file: step.file, done: 0, total: rows.length });
    // A product group's rows go together (Phase 21), so batches are about 100 rows.
    let done = 0;
    for (const batch of importBatches(rows)) {
      const result = await importInventoryCsv(batch, updateExisting).catch(() => null);
      if (!result || result.status === "error") {
        for (const r of batch) results.push({ line: r.line, sku: (r.cells.sku ?? "").toUpperCase(), status: "error", message: result?.message ?? "This batch couldn't be saved." });
      } else results.push(...result.results);
      done += batch.length;
      setStep({ kind: "importing", file: step.file, done, total: rows.length });
    }
    setStep({ kind: "done", results });
    router.refresh();
    const saved = results.filter((r) => r.status !== "error").length;
    const failed = results.length - saved;
    // Green only when every row went in, amber when some did, red when none did.
    if (!failed) notify.success("Inventory imported", `${saved} ${saved === 1 ? "item" : "items"} saved.`);
    else if (saved) notify.warning("Inventory partly imported", `${saved} saved, ${failed} not saved. The list shows why.`);
    else notify.error("Nothing imported", `${failed} ${failed === 1 ? "row" : "rows"} couldn't be saved. The list shows why.`);
  };

  const template = async () => {
    const rows = await inventoryCsvTemplate().catch(() => null);
    if (!rows) return notify.error("Template not downloaded", "Please try again.");
    downloadCsv("inventory-template.csv", toCsv(rows[0], rows.slice(1)));
  };

  return (
    <div className="csv-import">
      <div className="modal-header">
        <div>
          <span className="header-icon blue"><FileSpreadsheet size={18} /></span>
          <div>
            <Dialog.Title asChild><h2>Import inventory from CSV</h2></Dialog.Title>
            <Dialog.Description asChild>
              <p>Add many products at once from Excel or Google Sheets. Nothing is saved until you press Import.</p>
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <button type="button" className="icon-button" aria-label="Close" disabled={busy}><X size={16} /></button>
        </Dialog.Close>
      </div>

      <div className="modal-body">
        {(step.kind === "choose" || step.kind === "checking" || step.kind === "preview") && (
          <div className="csv-choose">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void choose(file);
              }}
            />
            <button type="button" className="csv-drop" disabled={busy} onClick={() => fileInput.current?.click()}>
              {step.kind === "checking" ? <Loader2 size={20} className="animate-spin" /> : <FileUp size={20} />}
              <strong>{step.kind === "checking" ? `Checking ${step.file}…` : step.kind === "preview" ? `${step.file} · choose another file` : "Choose a CSV file"}</strong>
              <span>Up to {MAX_IMPORT_ROWS} items. Columns are matched by their names in the first row.</span>
            </button>
            <div className="csv-options">
              <button type="button" className="button button-sm" onClick={template}>
                <Download size={13} /> Download template
              </button>
              <label className="csv-check">
                <input type="checkbox" checked={updateExisting} disabled={busy} onChange={(e) => toggleUpdate(e.target.checked)} />
                Update items with the same SKU
              </label>
            </div>
            {fitment ? (
              <p className="csv-help">
                Columns: SKU, Name, Category (full path, e.g. <em>Exterior › Wrapping › PPF</em>), Cost Price, Sale Price, Stock, Universal
                (Yes/No), Vehicles (<em>2018-2022 SUZUKI Alto; 2020 Honda Civic</em>), Vendor, and optionally Low Stock Alert, Price Includes Tax,
                Description and one <em>attr:</em> column per product attribute. When updating, empty cells keep the item&apos;s current value.
              </p>
            ) : (
              <p className="csv-help">
                Columns: SKU, Name, Category (full path, e.g. <em>Main category › Subcategory</em>), Cost Price, Sale Price, Stock, Vendor, and
                optionally Low Stock Alert, Price Includes Tax, Description and one <em>attr:</em> column per product attribute. Categories must
                already be in your list (request new ones from Settings → Categories). When updating, empty cells keep the item&apos;s current value.
              </p>
            )}
            <p className="csv-help">
              Optional: <em>Barcode</em>; <em>Kit Components</em> (<em>CLIP-01=2; CABLE-3=1</em>) makes the row a kit; rows with the same{" "}
              <em>Group</em> are the variants of one product, with <em>Option 1 Name</em> / <em>Option 1 Value</em> (up to 3 options). The group&apos;s
              category, prices and unit come from its first row.
            </p>
            {step.kind === "choose" && step.error && <div className="form-alert form-alert-error" role="alert">{step.error}</div>}
          </div>
        )}

        {step.kind === "preview" && step.ignoredFitment && (
          <div className="form-alert" role="status">The Universal and Vehicles columns were ignored: Vehicle Fitment isn&apos;t switched on for your organization.</div>
        )}
        {step.kind === "preview" && <Preview checks={step.checks} />}

        {step.kind === "importing" && (
          <div className="csv-progress" role="status">
            <Loader2 size={20} className="animate-spin" />
            <strong>Importing {step.done} of {step.total}…</strong>
            <span className="csv-bar"><span style={{ width: `${step.total ? (step.done / step.total) * 100 : 0}%` }} /></span>
          </div>
        )}

        {step.kind === "done" && <Done results={step.results} />}
      </div>

      <div className="modal-footer">
        {step.kind === "done" ? (
          <button type="button" className="button button-primary" onClick={onClose}>Done</button>
        ) : (
          <>
            <Dialog.Close asChild>
              <button type="button" className="button" disabled={busy}>Cancel</button>
            </Dialog.Close>
            {step.kind === "preview" && (() => {
              const n = step.checks.filter((c) => c.action !== "error").length;
              return (
                <button type="button" className="button button-primary" disabled={n === 0} onClick={runImport}>
                  <Upload size={14} /> Import {n} {n === 1 ? "item" : "items"}
                </button>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

function Preview({ checks }: { checks: CsvRowCheck[] }) {
  const count = (a: CsvRowCheck["action"]) => checks.filter((c) => c.action === a).length;
  const errors = count("error");
  const [onlyErrors, setOnlyErrors] = useState(errors > 0);
  const shown = onlyErrors ? checks.filter((c) => c.action === "error") : checks;
  return (
    <div className="csv-preview">
      <div className="csv-summary">
        {count("new") > 0 && <span className="badge badge-green">{count("new")} new</span>}
        {count("update") > 0 && <span className="badge badge-blue">{count("update")} to update</span>}
        {errors > 0 && <span className="badge badge-red">{errors} with problems (skipped)</span>}
        {errors > 0 && (
          <label className="csv-check">
            <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} /> Show problems only
          </label>
        )}
      </div>
      <div className="csv-table-wrap">
        <table className="csv-table">
          <thead>
            <tr>
              <th>LINE</th>
              <th>SKU</th>
              <th>NAME</th>
              <th>RESULT</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.line} className={c.action === "error" ? "is-error" : undefined}>
                <td className="mono">{c.line}</td>
                <td className="mono">{c.sku || "—"}</td>
                <td>{c.name || "—"}</td>
                <td>
                  {c.action === "error" ? (
                    <ul className="csv-errors">
                      {c.errors.map((e, i) => (
                        <li key={i}>{e.column && <b>{e.column}: </b>}{e.message}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className={c.action === "new" ? "badge badge-green" : "badge badge-blue"}>{c.action === "new" ? "New" : "Update"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errors > 0 && <p className="csv-help">Rows with problems are skipped. Fix them in the file and import it again (with &quot;Update items with the same SKU&quot; ticked).</p>}
    </div>
  );
}

function Done({ results }: { results: CsvImportResult[] }) {
  const created = results.filter((r) => r.status === "created").length;
  const updated = results.filter((r) => r.status === "updated").length;
  const failed = results.filter((r) => r.status === "error");
  return (
    <div className="csv-done">
      <CheckCircle2 size={28} />
      <strong>
        {created} added{updated ? `, ${updated} updated` : ""}
        {failed.length ? `, ${failed.length} not saved` : ""}
      </strong>
      {failed.length > 0 && (
        <ul className="csv-errors">
          {failed.map((r) => (
            <li key={r.line}><b>Line {r.line} ({r.sku || "no SKU"}): </b>{r.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

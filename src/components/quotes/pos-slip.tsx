"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { PrintableDocument } from "@/lib/printable";
import { formatQty } from "@/lib/uom";
import { qrPath } from "@/lib/qr";

type SlipData = { doc: PrintableDocument; shareUrl: string | null };

/**
 * Prints a document's 80mm POS slip straight from the current page (no new tab):
 * the slip is drawn into the page, the paper is sized to it (80mm × its height, so a
 * roll printer feeds no blank paper), and the browser's print dialog opens.
 * Render `element` somewhere in the component; call `print(documentId)` from a button.
 */
export function usePosSlipPrint() {
  const [slip, setSlip] = useState<SlipData | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const print = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${id}/printable`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setSlip((await res.json()) as SlipData);
    } catch {
      notify.error("Couldn't print the slip", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Once the slip is on the page: size the paper to it, print, then take it away again.
  useEffect(() => {
    if (!slip || !ref.current) return;
    const heightMm = Math.ceil((ref.current.getBoundingClientRect().height * 25.4) / 96) + 2;
    const page = document.createElement("style");
    page.textContent = `@page { size: 80mm ${heightMm}mm; margin: 0; }`;
    document.head.appendChild(page);
    document.documentElement.classList.add("pos-printing");
    const restore = () => {
      page.remove();
      document.documentElement.classList.remove("pos-printing");
      window.removeEventListener("afterprint", done);
    };
    const done = () => {
      restore();
      setSlip(null);
    };
    window.addEventListener("afterprint", done);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      restore();
    };
  }, [slip]);

  const element = slip ? createPortal(<PosSlip {...slip} rootRef={ref} />, document.body) : null;
  return { print, loading, element };
}

/** The slip's markup: same content as the PDF in src/components/pdf/thermal-receipt.tsx. */
function PosSlip({ doc, shareUrl, rootRef }: SlipData & { rootRef: RefObject<HTMLDivElement | null> }) {
  const money = (n: number) => formatMoney(n, doc.money);
  const shopLines = [
    doc.shop.address,
    doc.shop.phone,
    [doc.shop.ntn && `NTN ${doc.shop.ntn}`, doc.shop.strn && `STRN ${doc.shop.strn}`].filter(Boolean).join("  ·  ") || null,
  ].filter(Boolean) as string[];
  const methods = [...new Set(doc.payments.map((p) => p.method))].join(", ");
  const qr = shareUrl ? qrPath(shareUrl) : null;
  const row = (label: string, value: string, strong = false) => (
    <div className={`pos-slip-row${strong ? " strong" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div className="pos-print-root" ref={rootRef} aria-hidden>
      <div className="pos-slip">
        <p className="pos-slip-shop">{doc.shop.name}</p>
        {shopLines.map((line) => (
          <p key={line} className="pos-slip-small">{line}</p>
        ))}
        <hr />
        <p className="pos-slip-title">{doc.title.toUpperCase()}</p>
        {row("No.", doc.number, true)}
        {doc.dates.map((d) => <div key={d.label}>{row(d.label, d.value)}</div>)}
        {doc.section !== "drafts" && row("Status", doc.statusLabel, true)}
        {row("Customer", doc.customer.name, true)}
        {doc.customer.phone && row("Phone", doc.customer.phone)}
        <hr />
        {doc.lines.map((l, i) => (
          <div key={i} className="pos-slip-item">
            <strong>{l.description}</strong>
            <div className="pos-slip-row">
              <span>
                {formatQty(l.quantity, l.unit)} × {money(l.salePrice)}
                {l.discount > 0 ? `  (−${money(l.discount)} ea)` : ""}
              </span>
              <strong>{money(l.total)}</strong>
            </div>
          </div>
        ))}
        <hr />
        {row(`Subtotal (${doc.lines.length} ${doc.lines.length === 1 ? "item" : "items"})`, money(doc.totals.subtotal))}
        {doc.totals.discount > 0 && row("Discount", `−${money(doc.totals.discount)}`)}
        {doc.totals.taxRate > 0 &&
          row(`Sales tax ${doc.totals.taxRate}%${doc.totals.taxIncluded ? " (incl.)" : ""}`, money(doc.totals.tax))}
        <div className="pos-slip-grand">
          <span>TOTAL</span>
          <span>{money(doc.totals.total)}</span>
        </div>
        {doc.section === "invoices" && doc.statusKey !== "void" && (
          <>
            {doc.payments.length > 0 && (
              <>
                {row("Paid by", methods)}
                {row("Paid", money(doc.paid))}
              </>
            )}
            {row("Balance due", money(doc.balance), true)}
          </>
        )}
        {qr && (
          <div className="pos-slip-qr">
            <svg viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges">
              <path d={qr.d} fill="#000" />
            </svg>
            <p className="pos-slip-small">Scan to view or download this {doc.title.toLowerCase()}</p>
          </div>
        )}
        {doc.shop.terms && (
          <>
            <hr />
            <p className="pos-slip-small">{doc.shop.terms}</p>
          </>
        )}
        <p className="pos-slip-thanks">Thank you for your business!</p>
      </div>
    </div>
  );
}

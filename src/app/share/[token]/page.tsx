import { Suspense, type CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, FileText, Landmark } from "lucide-react";
import { CopyButton } from "@/components/share/copy-button";
import { formatMoney } from "@/lib/format";
import { loadPrintable } from "@/lib/printable";
import { formatQty } from "@/lib/uom";
import { createAdminClient } from "@/lib/supabase/admin";

// The customer's view-only page behind a share link (sent over WhatsApp). No sign-in.

export const metadata: Metadata = { title: "Your document", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ token: string }>;

async function SharedDocument({ params }: { params: Params }) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();
  const doc = await loadPrintable(createAdminClient(), { token });
  if (!doc || doc.section === "drafts") notFound();
  const money = (n: number) => formatMoney(n, doc.money);
  const isInvoice = doc.section === "invoices";

  return (
    // The organization's document colour (RF-16.1) replaces the brand accent inside the sheet.
    <div className="share-sheet" style={{ "--accent-brand": doc.shop.accent } as CSSProperties}>
      <header className="share-head">
        <div>
          {doc.shop.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- shop logo from Supabase Storage
            <img src={doc.shop.logoUrl} alt={doc.shop.name} className="share-logo" />
          ) : null}
          <strong className="share-shop">{doc.shop.name}</strong>
          {doc.shop.address && <span>{doc.shop.address}</span>}
          {(doc.shop.phone || doc.shop.email) && <span>{[doc.shop.phone, doc.shop.email].filter(Boolean).join(" · ")}</span>}
        </div>
        <div className="share-title">
          <span>{doc.title.toUpperCase()}</span>
          <strong>{doc.number}</strong>
          <em className={`share-status ${doc.statusKey}`}>{doc.statusLabel}</em>
        </div>
      </header>

      <section className="share-meta">
        <div>
          <span className="share-label">{isInvoice ? "BILL TO" : "PREPARED FOR"}</span>
          <strong>{doc.customer.name}</strong>
          {doc.customer.address && <span>{doc.customer.address}</span>}
        </div>
        <dl>
          {doc.dates.map((d) => (
            <div key={d.label}>
              <dt>{d.label}</dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="share-lines">
        {doc.lines.map((l, i) => (
          <div key={i} className={`share-line${doc.shareImages && l.imageUrl ? " has-image" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- product photo on Supabase Storage */}
            {doc.shareImages && l.imageUrl && <img className="share-line-image" src={l.imageUrl} alt="" loading="lazy" draggable={false} />}
            <div>
              <strong>{l.description}</strong>
              {l.includes && <span>Includes: {l.includes}</span>}
              {l.details && <span>{l.details}</span>}
              <span>
                {formatQty(l.quantity, l.unit)} × {money(l.salePrice)}
                {l.discount > 0 && <s>{money(l.unitPrice)}</s>}
              </span>
            </div>
            <b>{money(l.total)}</b>
          </div>
        ))}
      </div>

      <dl className="share-totals">
        <div><dt>Subtotal</dt><dd>{money(doc.totals.subtotal)}</dd></div>
        {doc.totals.discount > 0 && <div><dt>Discount</dt><dd>−{money(doc.totals.discount)}</dd></div>}
        {doc.totals.taxRate > 0 && <div><dt>Sales tax {doc.totals.taxRate}%</dt><dd>{money(doc.totals.tax)}</dd></div>}
        <div className="share-grand"><dt>Total</dt><dd>{money(doc.totals.total)}</dd></div>
        {isInvoice && doc.statusKey !== "void" && (
          <>
            {doc.payments.map((p, i) => (
              <div key={i} className="share-paid"><dt>Paid · {p.method} · {p.paidOn}</dt><dd>−{money(p.amount)}</dd></div>
            ))}
            <div className="share-balance"><dt>Balance due</dt><dd>{money(doc.balance)}</dd></div>
          </>
        )}
      </dl>

      {doc.bank && (
        <section className="share-bank" aria-label="Bank remittance">
          <div className="share-bank-head">
            <span className="share-label"><Landmark size={13} /> BANK REMITTANCE</span>
            <span>Pay {money(doc.balance)} · reference <b>{doc.number}</b></span>
          </div>
          <dl>
            {doc.bank.bankName && <div><dt>Bank</dt><dd>{doc.bank.bankName}</dd></div>}
            {doc.bank.accountTitle && <div><dt>Account title</dt><dd>{doc.bank.accountTitle}</dd></div>}
            {doc.bank.accountNumber && (
              <div>
                <dt>Account number</dt>
                <dd className="mono">{doc.bank.accountNumber}<CopyButton value={doc.bank.accountNumber.replace(/[\s-]/g, "")} label="Copy" /></dd>
              </div>
            )}
            {doc.bank.iban && doc.bank.ibanRaw && (
              <div>
                <dt>IBAN</dt>
                <dd className="mono">{doc.bank.iban}<CopyButton value={doc.bank.ibanRaw} label="Copy IBAN" /></dd>
              </div>
            )}
            {doc.bank.raastId && <div><dt>Raast ID</dt><dd className="mono">{doc.bank.raastId}</dd></div>}
            {doc.bank.wallets.map((w) => (
              <div key={`${w.provider}-${w.number}`}>
                <dt>{w.provider}</dt>
                <dd>{w.number}{w.title ? ` · ${w.title}` : ""}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {doc.shop.terms && (
        <section className="share-terms">
          <span className="share-label">{isInvoice ? "PAYMENT TERMS" : "TERMS & NOTES"}</span>
          <p>{doc.shop.terms}</p>
        </section>
      )}

      <div className="share-actions">
        <a className="button button-primary" href={`/share/${token}/pdf?download=1`}>
          <Download size={14} /> Download PDF
        </a>
        <a className="button" href={`/share/${token}/pdf`} target="_blank" rel="noopener noreferrer">
          <FileText size={14} /> Open PDF
        </a>
      </div>
    </div>
  );
}

export default function SharePage({ params }: { params: Params }) {
  return (
    <main className="share-page">
      <Suspense fallback={<div className="share-sheet share-loading">Loading…</div>}>
        <SharedDocument params={params} />
      </Suspense>
      <p className="share-foot">Sent with ProductLogik Invoicing System</p>
    </main>
  );
}

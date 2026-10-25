"use client";

import { useState } from "react";
import { Banknote, CreditCard, FileText, MessageSquare, Send, Smartphone } from "lucide-react";
import { DateInput } from "@/components/shared/date-input";
import { requestPlanChange, submitSubscriptionPayment } from "@/lib/actions/my-subscription";
import type { MySubscription } from "@/lib/my-subscription-data";
import {
  CYCLE_LABEL,
  INVOICE_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  SUBSCRIPTION_STATUS,
  badgeOf,
  billingDate,
  billingToday,
  methodLabel,
  pkr,
  usageText,
} from "@/lib/subscription";
import { PROOF_TYPES } from "@/lib/validations/subscription.schema";
import { SubscriptionDialog, useSubmit } from "./subscription-dialog";

type Invoice = MySubscription["invoices"][number];

function PaidDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const due = invoice.total - invoice.amountPaid;
  const [v, setV] = useState({ paidOn: billingToday(), method: "jazzcash", reference: "", payerName: "", note: "" });
  const [file, setFile] = useState<File | null>(null);
  const set = <K extends keyof typeof v>(k: K, value: string) => setV((p) => ({ ...p, [k]: value }));
  const { busy, error, run } = useSubmit(onClose, "Payment sent for checking");
  const submit = () => {
    const form = new FormData();
    form.set("invoiceId", invoice.id);
    for (const [k, value] of Object.entries(v)) form.set(k, value);
    if (file) form.set("proof", file);
    void run(() => submitSubscriptionPayment(form));
  };
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={CreditCard}
      title={`I've paid · ${invoice.number}`}
      description={`For the full ${pkr(due)} due. Tell us about the payment and add a screenshot; we check it against our statement and email you a receipt.`}
      submitLabel="Send"
      busy={busy}
      error={error}
      onSubmit={submit}
    >
      <label>
        <span>PAID ON</span>
        <DateInput value={v.paidOn} max={billingToday()} onChange={(e) => set("paidOn", e.target.value)} />
      </label>
      <label>
        <span>PAID WITH</span>
        <select value={v.method} onChange={(e) => set("method", e.target.value)}>
          {PAYMENT_METHODS.filter((m) => m.key !== "cash").map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </label>
      <label>
        <span>TRANSACTION ID</span>
        <input value={v.reference} maxLength={100} placeholder="From the SMS or app receipt" onChange={(e) => set("reference", e.target.value)} />
      </label>
      <label>
        <span>SENT FROM (NAME OR NUMBER)</span>
        <input value={v.payerName} maxLength={120} onChange={(e) => set("payerName", e.target.value)} />
      </label>
      <label>
        <span>SCREENSHOT (OPTIONAL)</span>
        <input type="file" accept={PROOF_TYPES.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <small>PNG, JPG, WebP or PDF, up to 5 MB.</small>
      </label>
      <label className="span-two">
        <span>NOTE (OPTIONAL)</span>
        <input value={v.note} maxLength={500} onChange={(e) => set("note", e.target.value)} />
      </label>
    </SubscriptionDialog>
  );
}

function PlanChangeDialog({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const { busy, error, run } = useSubmit(onClose, "Request sent");
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={MessageSquare}
      title="Request a plan change"
      description="Tell us what you need. ProductLogik will contact you with the options."
      submitLabel="Send Request"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => requestPlanChange(message))}
    >
      <label className="span-two">
        <span>WHAT DO YOU NEED?</span>
        <textarea rows={4} value={message} maxLength={800} placeholder="e.g. Two more users, or switch to yearly billing" onChange={(e) => setMessage(e.target.value)} />
      </label>
    </SubscriptionDialog>
  );
}

/** How to pay ProductLogik: wallets and bank accounts from Platform settings. */
export function PayToCard({ data }: { data: MySubscription }) {
  const { wallets, banks, note } = data.payTo;
  if (wallets.length === 0 && banks.length === 0) return null;
  return (
    <section className="card admin-section">
      <div className="card-header">
        <div>
          <h2>How to pay</h2>
          <p>Mobile wallet or bank transfer. Use the invoice number as the payment reference, then press “I&apos;ve paid”.</p>
        </div>
      </div>
      <ul className="pay-to-list">
        {wallets.map((w, n) => (
          <li key={`w${n}`}>
            <span className="header-icon blue"><Smartphone size={15} /></span>
            <div>
              <strong>{w.provider ?? "Mobile wallet"}</strong>
              <span className="mono">{w.number}</span>
              {w.title && <span>{w.title}</span>}
            </div>
          </li>
        ))}
        {banks.map((b, n) => (
          <li key={`b${n}`}>
            <span className="header-icon blue"><Banknote size={15} /></span>
            <div>
              <strong>{b.bank ?? "Bank"}</strong>
              {b.title && <span>{b.title}</span>}
              {b.number && <span className="mono">Account {b.number}</span>}
              {b.iban && <span className="mono">IBAN {b.iban}</span>}
            </div>
          </li>
        ))}
      </ul>
      {note && <p className="pay-to-note">{note}</p>}
    </section>
  );
}

/** Invoices with "I've paid" on the open ones, and the payments reported or recorded. */
export function SubscriptionInvoices({ data }: { data: MySubscription }) {
  const [paying, setPaying] = useState<Invoice | null>(null);
  const pendingFor = new Set(data.payments.filter((p) => p.status === "pending").map((p) => p.invoiceId));
  return (
    <>
      <section className="card admin-section">
        <div className="card-header">
          <div>
            <h2>Invoices</h2>
            <p>From ProductLogik for your subscription</p>
          </div>
        </div>
        {data.invoices.length === 0 ? (
          <div className="empty-state">No invoices yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>INVOICE</th>
                  <th>PERIOD</th>
                  <th>DUE</th>
                  <th className="numeric">AMOUNT DUE</th>
                  <th>STATUS</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => {
                  const badge = badgeOf(INVOICE_STATUS, i.status);
                  const open = i.status === "unpaid" || i.status === "partly_paid";
                  return (
                    <tr key={i.id}>
                      <td className="primary-cell">
                        <strong>
                          <a className="row-link" href={`/api/subscription-invoices/${i.id}/pdf`} target="_blank" rel="noopener">
                            <FileText size={12} /> {i.number}
                          </a>
                        </strong>
                        <span>{pkr(i.total)} total</span>
                      </td>
                      <td>{billingDate(i.periodStart)} – {billingDate(i.periodEnd)}</td>
                      <td>{billingDate(i.dueDate)}</td>
                      <td className="numeric">{pkr(Math.max(i.total - i.amountPaid, 0))}</td>
                      <td>
                        <span className={badge.tone}>{badge.label}</span>
                        {pendingFor.has(i.id) && <span className="badge badge-amber admin-super">Being checked</span>}
                      </td>
                      <td>
                        {open && !pendingFor.has(i.id) && (
                          <button type="button" className="button button-sm button-primary" onClick={() => setPaying(i)}>
                            <Send size={13} /> I&apos;ve Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.payments.length > 0 && (
        <section className="card admin-section">
          <div className="card-header">
            <div>
              <h2>Payments</h2>
              <p>Reported by your admins or recorded by ProductLogik</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>PAID ON</th>
                  <th>METHOD · TRANSACTION ID</th>
                  <th className="numeric">AMOUNT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => {
                  const badge = badgeOf(PAYMENT_STATUS, p.status);
                  return (
                    <tr key={p.id}>
                      <td>{billingDate(p.paidOn)}</td>
                      <td className="primary-cell">
                        <strong>{methodLabel(p.method)}{p.reference ? ` · ${p.reference}` : ""}</strong>
                        {p.reason && <span>Not confirmed: {p.reason}</span>}
                      </td>
                      <td className="numeric">{pkr(p.amount)}</td>
                      <td><span className={badge.tone}>{p.status === "pending" ? "Being checked" : badge.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {paying && <PaidDialog invoice={paying} onClose={() => setPaying(null)} />}
    </>
  );
}

/** /settings/subscription: plan, limits and usage, invoices, payments and how to pay. */
export function SubscriptionSummary({ data }: { data: MySubscription }) {
  const [asking, setAsking] = useState(false);
  const s = data.subscription;
  if (!s) {
    return (
      <section className="card">
        <div className="empty-state">Your organization has no subscription yet. ProductLogik will set it up.</div>
      </section>
    );
  }
  const status = badgeOf(SUBSCRIPTION_STATUS, s.status);
  const free = s.price <= 0;
  return (
    <>
      <section className="card">
        <div className="card-header">
          <div>
            <h2>
              {s.plan} · {CYCLE_LABEL[s.cycle]} <span className={status.tone}>{status.label}</span>
            </h2>
            <p>{free ? "No charge" : `${pkr(s.price)} per ${s.cycle === "yearly" ? "year" : "month"}`}{s.planDescription ? ` · ${s.planDescription}` : ""}</p>
          </div>
          <button type="button" className="button" onClick={() => setAsking(true)}>
            <MessageSquare size={14} /> Request a Plan Change
          </button>
        </div>
        <div className="sub-summary">
          <dl className="sub-facts">
            {s.status === "trial" && <div><dt>Trial ends</dt><dd>{billingDate(s.trialEndsAt)}</dd></div>}
            <div><dt>Paid until</dt><dd>{free ? "Nothing to pay" : s.paidUntil ? billingDate(s.paidUntil) : "Nothing paid yet"}</dd></div>
            <div><dt>Next payment due</dt><dd>{!free && s.nextDueDate ? billingDate(s.nextDueDate) : "Not billed"}</dd></div>
            {s.cancelAt && <div><dt>Ends after</dt><dd>{billingDate(s.cancelAt)}</dd></div>}
          </dl>
          <div className="sub-usage">
            <div className="sub-usage-row"><span>Users</span><strong className={s.limits.users !== null && s.usage.users > s.limits.users ? "danger-text" : undefined}>{usageText(s.usage.users, s.limits.users)}</strong></div>
            <div className="sub-usage-row"><span>Products</span><strong className={s.limits.products !== null && s.usage.products > s.limits.products ? "danger-text" : undefined}>{usageText(s.usage.products, s.limits.products)}</strong></div>
            <div className="sub-usage-row"><span>Stores</span><strong>{usageText(s.usage.stores, s.limits.stores)}</strong></div>
          </div>
        </div>
      </section>
      <SubscriptionInvoices data={data} />
      {!free && <PayToCard data={data} />}
      {asking && <PlanChangeDialog onClose={() => setAsking(false)} />}
    </>
  );
}

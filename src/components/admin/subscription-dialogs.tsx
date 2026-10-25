"use client";

import { useState } from "react";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import { DateInput } from "@/components/shared/date-input";
import { SubscriptionDialog, useSubmit, type ActionResult } from "@/components/subscription/subscription-dialog";
import {
  addSubscriptionAdjustment,
  changeSubscriptionPlan,
  extendSubscription,
  setSubscriptionStart,
  recordSubscriptionPayment,
  saveSubscriptionPricing,
} from "@/lib/actions/subscriptions";
import { MODULES } from "@/lib/modules";
import type { Plan } from "@/lib/plan-data";
import type { SubscriptionInvoice, TenantSubscription } from "@/lib/subscription-data";
import { PAYMENT_METHODS, billingToday, pkr, type BillingCycle } from "@/lib/subscription";
import { planPriceText } from "@/lib/validations/plan.schema";
import { PROOF_TYPES } from "@/lib/validations/subscription.schema";

// The organization's Subscription tab (Phase 17, deliverable 9): one dialog per change.

const str = (v: number | null) => (v === null ? "" : String(v));
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(/,/g, "")));

const ReasonField = ({
  value,
  onChange,
  label = "REASON",
  placeholder = "Kept in the subscription history",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
}) => (
  <label className="span-two">
    <span>{label}</span>
    <input value={value} maxLength={300} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  </label>
);

// ---------------------------------------------------------------------------

export function ChangePlanDialog({ sub, plans, icon, onClose }: { sub: TenantSubscription; plans: Plan[]; icon: LucideIcon; onClose: () => void }) {
  const choices = plans.filter((p) => !p.retiredAt || p.id === sub.planId);
  const [v, setV] = useState({
    planId: sub.planId,
    cycle: sub.cycle as BillingCycle,
    when: "now" as "now" | "next_period",
    startAs: "keep" as "keep" | "trial" | "active",
    keepPrice: false,
    reason: "",
  });
  const { busy, error, run } = useSubmit(onClose, "Plan changed");
  const plan = choices.find((p) => p.id === v.planId);
  // What a downgrade leaves over the limits (this organization's overrides still apply).
  const over = plan
    ? [
        { label: "users", usage: sub.usage.users, limit: sub.overrides.maxUsers ?? plan.maxUsers },
        { label: "products", usage: sub.usage.products, limit: sub.overrides.maxProducts ?? plan.maxProducts },
        { label: "stores", usage: sub.usage.stores, limit: sub.overrides.maxStores ?? plan.maxStores },
      ].filter((x) => x.limit !== null && x.usage > x.limit)
    : [];
  const unpaid = sub.invoices.filter((i) => i.status === "unpaid").length;
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={icon}
      title="Change plan"
      description={`Upgrade or downgrade.${unpaid ? " Unpaid invoices are reissued at the new price." : ""} Need different terms? Use “Create custom plan for this organization”.`}
      submitLabel="Change Plan"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => changeSubscriptionPlan(sub.tenantId, v))}
    >
      {over.length > 0 && (
        <div className="form-alert form-alert-warning span-two" role="status">
          <strong><AlertTriangle size={13} /> Over {plan?.name}&apos;s limits</strong>
          <ul className="plan-over-list">
            {over.map((o) => <li key={o.label}>{o.usage} {o.label} (limit {o.limit})</li>)}
          </ul>
          Nothing is removed automatically. Deactivate users or remove products on the Overview tab, or give an override in Price &amp; limits. Until then it can&apos;t add more.
        </div>
      )}
      <label>
        <span>PLAN</span>
        <select value={v.planId} onChange={(e) => setV({ ...v, planId: e.target.value })}>
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.visibility === "custom" ? " (custom)" : ""}
              {p.retiredAt ? " (retired)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>BILLING CYCLE</span>
        <select value={v.cycle} onChange={(e) => setV({ ...v, cycle: e.target.value as BillingCycle })}>
          <option value="monthly" disabled={plan?.priceMonthly === null}>Monthly · {planPriceText(plan?.priceMonthly ?? null)}</option>
          <option value="yearly" disabled={plan?.priceYearly === null}>Yearly · {planPriceText(plan?.priceYearly ?? null)}</option>
        </select>
      </label>
      <label>
        <span>TAKES EFFECT</span>
        <select value={v.when} onChange={(e) => setV({ ...v, when: e.target.value as "now" | "next_period" })}>
          <option value="now">Now</option>
          <option value="next_period">From the next invoice</option>
        </select>
      </label>
      <label>
        <span>BILLING</span>
        <select value={v.startAs} disabled={v.when !== "now"} onChange={(e) => setV({ ...v, startAs: e.target.value as "keep" | "trial" | "active" })}>
          <option value="keep">Keep the current dates</option>
          <option value="trial" disabled={!plan?.trialDays}>Start a {plan?.trialDays ?? 0}-day trial today</option>
          <option value="active">Start billing today</option>
        </select>
        <small>No proration: add a charge or credit for the difference if needed.</small>
      </label>
      <label className="check-field span-two">
        <input type="checkbox" checked={v.keepPrice} onChange={(e) => setV({ ...v, keepPrice: e.target.checked })} />
        <div>
          <strong>Keep the agreed price and discount</strong>
          <p>Otherwise the new plan&apos;s price applies.</p>
        </div>
      </label>
      <ReasonField value={v.reason} onChange={(reason) => setV({ ...v, reason })} />
    </SubscriptionDialog>
  );
}

// ---------------------------------------------------------------------------

export function PricingDialog({ sub, icon, onClose }: { sub: TenantSubscription; icon: LucideIcon; onClose: () => void }) {
  const [v, setV] = useState({
    agreedPrice: str(sub.agreedPrice),
    discountType: sub.discountType,
    discountValue: sub.discountType === "none" ? "" : String(sub.discountValue),
    priceNote: sub.priceNote,
    maxStores: str(sub.overrides.maxStores),
    maxUsers: str(sub.overrides.maxUsers),
    maxProducts: str(sub.overrides.maxProducts),
    planModules: sub.overrides.modules === null,
    modules: sub.overrides.modules ?? [],
    graceDays: String(sub.graceDays),
    autoSuspend: sub.autoSuspend,
    reason: "",
  });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((p) => ({ ...p, [k]: value }));
  const { busy, error, setError, run } = useSubmit(onClose, "Saved");
  const limitHint = (plan: number | null) => `Plan: ${plan === null ? "unlimited" : plan.toLocaleString("en-PK")}. Empty = the plan's.`;

  const submit = () => {
    const input = {
      agreedPrice: numOrNull(v.agreedPrice),
      discountType: v.discountType,
      discountValue: Number(v.discountValue || 0),
      priceNote: v.priceNote,
      maxStores: numOrNull(v.maxStores),
      maxUsers: numOrNull(v.maxUsers),
      maxProducts: numOrNull(v.maxProducts),
      modules: v.planModules ? null : v.modules,
      graceDays: Number(v.graceDays || 0),
      autoSuspend: v.autoSuspend,
      reason: v.reason,
    };
    if (Object.values(input).some((x) => typeof x === "number" && !Number.isFinite(x))) {
      setError("Numbers only, please.");
      return;
    }
    void run(() => saveSubscriptionPricing(sub.tenantId, input));
  };

  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={icon}
      title="Price & limits"
      description="For this organization only. A new price applies from its next invoice; limits apply at once."
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={submit}
    >
      <label>
        <span>AGREED PRICE PER {sub.cycle === "yearly" ? "YEAR" : "MONTH"} (PKR)</span>
        <input inputMode="decimal" value={v.agreedPrice} placeholder={`Plan price${sub.price.fromPlan ? `: ${sub.price.base.toLocaleString("en-PK")}` : ""}`} onChange={(e) => set("agreedPrice", e.target.value)} />
        <small>Empty = the plan&apos;s current price.</small>
      </label>
      <label>
        <span>DISCOUNT</span>
        <select value={v.discountType} onChange={(e) => set("discountType", e.target.value as typeof v.discountType)}>
          <option value="none">None</option>
          <option value="amount">Amount (PKR)</option>
          <option value="percent">Percent</option>
        </select>
      </label>
      {v.discountType !== "none" && (
        <label>
          <span>{v.discountType === "percent" ? "DISCOUNT %" : "DISCOUNT (PKR)"}</span>
          <input inputMode="decimal" value={v.discountValue} onChange={(e) => set("discountValue", e.target.value)} />
        </label>
      )}
      <label className={v.discountType === "none" ? "span-two" : undefined}>
        <span>PRICE NOTE (ON THE INVOICE)</span>
        <input value={v.priceNote} maxLength={300} placeholder="e.g. Launch discount until December" onChange={(e) => set("priceNote", e.target.value)} />
      </label>
      <label>
        <span>MAX USERS</span>
        <input inputMode="numeric" value={v.maxUsers} placeholder="Plan's" onChange={(e) => set("maxUsers", e.target.value)} />
        <small>{limitHint(sub.planLimits.maxUsers)}</small>
      </label>
      <label>
        <span>MAX PRODUCTS</span>
        <input inputMode="numeric" value={v.maxProducts} placeholder="Plan's" onChange={(e) => set("maxProducts", e.target.value)} />
        <small>{limitHint(sub.planLimits.maxProducts)}</small>
      </label>
      <label>
        <span>MAX STORES</span>
        <input inputMode="numeric" value={v.maxStores} placeholder="Plan's" onChange={(e) => set("maxStores", e.target.value)} />
        <small>{limitHint(sub.planLimits.maxStores)}</small>
      </label>
      <label>
        <span>GRACE DAYS AFTER THE DUE DATE</span>
        <input inputMode="numeric" value={v.graceDays} onChange={(e) => set("graceDays", e.target.value)} />
      </label>
      <div className="span-two plan-modules">
        <span className="field-label">MODULES</span>
        <label className="check-field">
          <input type="checkbox" checked={v.planModules} onChange={(e) => set("planModules", e.target.checked)} />
          <div><strong>The plan&apos;s modules</strong></div>
        </label>
        {!v.planModules &&
          MODULES.map((m) => (
            <label key={m.key} className="check-field">
              <input
                type="checkbox"
                checked={v.modules.includes(m.key)}
                onChange={(e) => set("modules", e.target.checked ? [...v.modules, m.key] : v.modules.filter((k) => k !== m.key))}
              />
              <div><strong>{m.label}</strong></div>
            </label>
          ))}
      </div>
      <label className="check-field span-two">
        <input type="checkbox" checked={v.autoSuspend} onChange={(e) => set("autoSuspend", e.target.checked)} />
        <div>
          <strong>Suspend automatically when unpaid</strong>
          <p>After the grace days. Off: it stays past due until paid.</p>
        </div>
      </label>
      <ReasonField value={v.reason} onChange={(reason) => set("reason", reason)} />
    </SubscriptionDialog>
  );
}

// ---------------------------------------------------------------------------

export function StartDateDialog({ sub, icon, onClose }: { sub: TenantSubscription; icon: LucideIcon; onClose: () => void }) {
  const [start, setStart] = useState(sub.startedAt);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onClose, "Start date changed");
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={icon}
      title="Change start date"
      description="Where the first billing period begins. Only possible until the first invoice is issued."
      submitLabel="Save"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => setSubscriptionStart(sub.tenantId, { until: start, reason }))}
    >
      <label className="span-two">
        <span>STARTS ON</span>
        <DateInput value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <ReasonField value={reason} onChange={setReason} />
    </SubscriptionDialog>
  );
}

// ---------------------------------------------------------------------------

export function ExtendDialog({ sub, icon, onClose }: { sub: TenantSubscription; icon: LucideIcon; onClose: () => void }) {
  const trial = sub.paidUntil === null && sub.trialEndsAt !== null;
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(onClose, trial ? "Trial extended" : "Due date extended");
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={icon}
      title={trial ? "Extend trial" : "Extend due date"}
      description={
        trial
          ? "The trial runs until this date. A suspended organization is active again."
          : "Not past due until this date (the invoice stays the same). A suspended organization is active again."
      }
      submitLabel="Extend"
      busy={busy}
      error={error}
      onSubmit={() => void run(() => extendSubscription(sub.tenantId, { until, reason }))}
    >
      <label className="span-two">
        <span>{trial ? "TRIAL ENDS ON" : "PAY BY"}</span>
        <DateInput value={until} min={billingToday()} onChange={(e) => setUntil(e.target.value)} />
      </label>
      <ReasonField value={reason} onChange={setReason} />
    </SubscriptionDialog>
  );
}

// ---------------------------------------------------------------------------

export function AdjustmentDialog({ tenantId, icon, onClose }: { tenantId: string; icon: LucideIcon; onClose: () => void }) {
  const [kind, setKind] = useState<"charge" | "credit">("charge");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const { busy, error, setError, run } = useSubmit(onClose, "Added");
  const submit = () => {
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter an amount above 0.");
      return;
    }
    void run(() => addSubscriptionAdjustment(tenantId, { description, amount: kind === "credit" ? -n : n }));
  };
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={icon}
      title="Charge or credit"
      description="A one-off line on the next invoice, e.g. the difference after a plan change."
      submitLabel="Add"
      busy={busy}
      error={error}
      onSubmit={submit}
    >
      <label>
        <span>TYPE</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as "charge" | "credit")}>
          <option value="charge">Charge (adds to the invoice)</option>
          <option value="credit">Credit (takes off the invoice)</option>
        </select>
      </label>
      <label>
        <span>AMOUNT (PKR)</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="span-two">
        <span>DESCRIPTION (ON THE INVOICE)</span>
        <input value={description} maxLength={200} placeholder="e.g. Upgrade to Business, 12 days" onChange={(e) => setDescription(e.target.value)} />
      </label>
    </SubscriptionDialog>
  );
}

// ---------------------------------------------------------------------------

export function RecordPaymentDialog({ invoice, icon, onClose }: { invoice: SubscriptionInvoice; icon: LucideIcon; onClose: () => void }) {
  const due = invoice.total - invoice.amountPaid;
  const [v, setV] = useState({ paidOn: billingToday(), method: "jazzcash", reference: "", payerName: "", note: "" });
  const [file, setFile] = useState<File | null>(null);
  const set = <K extends keyof typeof v>(k: K, value: string) => setV((p) => ({ ...p, [k]: value }));
  const { busy, error, run } = useSubmit(onClose, "Payment recorded");
  const submit = () => {
    const form = new FormData();
    form.set("invoiceId", invoice.id);
    for (const [k, value] of Object.entries(v)) form.set(k, value);
    if (file) form.set("proof", file);
    void run(() => recordSubscriptionPayment(form));
  };
  return (
    <SubscriptionDialog
      open
      onClose={onClose}
      icon={icon}
      title={`Record payment · ${invoice.number}`}
      description={`The full ${pkr(due)} (no part payments). The invoice is marked paid and paid-until moves forward one period.`}
      submitLabel={`Record ${pkr(due)}`}
      busy={busy}
      error={error}
      onSubmit={submit}
    >
      <label>
        <span>PAID ON</span>
        <DateInput value={v.paidOn} max={billingToday()} onChange={(e) => set("paidOn", e.target.value)} />
      </label>
      <label>
        <span>METHOD</span>
        <select value={v.method} onChange={(e) => set("method", e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </label>
      <label>
        <span>TRANSACTION ID / REFERENCE</span>
        <input value={v.reference} maxLength={100} onChange={(e) => set("reference", e.target.value)} />
      </label>
      <label>
        <span>SENDER NAME OR ACCOUNT</span>
        <input value={v.payerName} maxLength={120} onChange={(e) => set("payerName", e.target.value)} />
      </label>
      <label>
        <span>SCREENSHOT OR RECEIPT (OPTIONAL)</span>
        <input type="file" accept={PROOF_TYPES.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label className="span-two">
        <span>NOTE</span>
        <input value={v.note} maxLength={500} onChange={(e) => set("note", e.target.value)} />
      </label>
    </SubscriptionDialog>
  );
}

// ---------------------------------------------------------------------------

/** Asks for a reason, then runs a destructive or recorded step (cancel, void, reject, reverse...). */
export function ReasonDialog(p: {
  icon: LucideIcon;
  title: string;
  description: string;
  submitLabel: string;
  successTitle: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  destructive?: boolean;
  run: (reason: string) => Promise<ActionResult>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const { busy, error, run } = useSubmit(p.onClose, p.successTitle);
  return (
    <SubscriptionDialog
      open
      onClose={p.onClose}
      icon={p.icon}
      title={p.title}
      description={p.description}
      submitLabel={p.submitLabel}
      destructive={p.destructive}
      busy={busy}
      error={error}
      onSubmit={() => void run(() => p.run(reason))}
    >
      <ReasonField value={reason} onChange={setReason} label={p.reasonLabel} placeholder={p.reasonPlaceholder} />
    </SubscriptionDialog>
  );
}

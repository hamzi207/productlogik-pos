import "server-only";
import { peopleNames, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingCycle, InvoiceStatus, PaymentStatus, SubscriptionStatus } from "@/lib/subscription";
import type { Json } from "@/lib/types/database.types";

// The organization's Subscription tab in the console (Phase 17, deliverable 9).

export type SubscriptionInvoice = {
  id: string;
  number: string;
  planName: string;
  cycle: BillingCycle;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  voidReason: string | null;
  lines: { kind: string; description: string; amount: number }[];
};

export type SubscriptionPayment = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  paidOn: string;
  method: string;
  reference: string | null;
  payerName: string | null;
  note: string | null;
  hasProof: boolean;
  status: PaymentStatus;
  reason: string | null;
  /** The organization's admin who reported it; null when the superadmin recorded it. */
  submittedBy: string | null;
  createdAt: string;
};

export type TenantSubscription = {
  tenantId: string;
  tenantStatus: string;
  statusReason: string | null;
  planId: string;
  planName: string;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  /** One period's price before adjustments: agreed (or the plan's) less the discount. */
  price: { base: number; discount: number; net: number; fromPlan: boolean };
  agreedPrice: number | null;
  discountType: "none" | "amount" | "percent";
  discountValue: number;
  priceNote: string;
  /** Per-organization overrides (null = the plan's) and the plan's own limits. */
  overrides: { maxStores: number | null; maxUsers: number | null; maxProducts: number | null; modules: string[] | null };
  planLimits: { maxStores: number | null; maxUsers: number | null; maxProducts: number | null; modules: string[] | null };
  usage: { users: number; products: number; stores: number };
  startedAt: string;
  trialEndsAt: string | null;
  paidUntil: string | null;
  nextDueDate: string | null;
  extendedUntil: string | null;
  graceDays: number;
  autoSuspend: boolean;
  pending: { planName: string | null; cycle: BillingCycle | null } | null;
  cancelAt: string | null;
  invoices: SubscriptionInvoice[];
  payments: SubscriptionPayment[];
  adjustments: { id: string; description: string; amount: number; createdAt: string }[];
  history: { id: string; action: string; before: Json; after: Json; reason: string | null; by: string | null; at: string }[];
};

const n = (v: number | string | null) => (v === null ? null : Number(v));

/** The organization's subscription with its invoices, payments, pending adjustments and history (null without one). */
export async function getTenantSubscription(tenantId: string): Promise<TenantSubscription | null> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const [{ data: s, error }, { data: tenant }, invoices, payments, adjustments, history, users, products, stores] = await Promise.all([
    admin.from("tenant_subscriptions").select("*, plan:subscription_plans!tenant_subscriptions_plan_id_fkey(*), pending:subscription_plans!tenant_subscriptions_pending_plan_id_fkey(name)").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("tenants").select("status, status_reason").eq("id", tenantId).maybeSingle(),
    admin.from("subscription_invoices").select("*, subscription_invoice_lines(kind, description, amount, sort_order)").eq("tenant_id", tenantId).order("period_start", { ascending: false }).limit(48),
    admin.from("subscription_payments").select("*, subscription_invoices(number)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    admin.from("subscription_adjustments").select("id, description, amount, created_at").eq("tenant_id", tenantId).is("invoice_id", null).order("created_at"),
    admin.from("tenant_subscription_history").select("*").eq("tenant_id", tenantId).order("changed_at", { ascending: false }).limit(50),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("deactivated_at", null),
    admin.from("inventory_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_archived", false),
    // Phase 20: open stores count towards the plan's store limit.
    admin.from("stores").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
  ]);
  if (error) throw new Error(`tenant_subscriptions: ${error.message}`);
  if (!s || !s.plan) return null;

  // Who submitted payments and changed the subscription (auth.users ids → names).
  const people = [...new Set([...(payments.data ?? []).map((p) => p.submitted_by), ...(history.data ?? []).map((h) => h.changed_by)])].filter(
    (id): id is string => id !== null,
  );
  const names = await peopleNames(people);
  const nameOf = (id: string | null) => (id ? names.get(id)?.fullName ?? "Former member" : null);

  const cycle = s.billing_cycle === "yearly" ? "yearly" : "monthly";
  const planPrice = n(cycle === "yearly" ? s.plan.price_yearly : s.plan.price_monthly);
  const base = n(s.agreed_price) ?? planPrice ?? 0;
  const discountValue = Number(s.discount_value);
  const discountType = s.discount_type === "amount" || s.discount_type === "percent" ? s.discount_type : "none";
  const discount =
    Math.round(Math.min(base, discountType === "amount" ? discountValue : discountType === "percent" ? (base * discountValue) / 100 : 0) * 100) / 100;

  return {
    tenantId,
    tenantStatus: tenant?.status ?? "active",
    statusReason: tenant?.status_reason ?? null,
    planId: s.plan_id,
    planName: s.plan.name,
    cycle,
    status: s.status as SubscriptionStatus,
    price: { base, discount, net: base - discount, fromPlan: s.agreed_price === null },
    agreedPrice: n(s.agreed_price),
    discountType,
    discountValue,
    priceNote: s.price_note ?? "",
    overrides: { maxStores: s.max_stores, maxUsers: s.max_users, maxProducts: s.max_products, modules: s.allowed_modules },
    planLimits: { maxStores: s.plan.max_stores, maxUsers: s.plan.max_users, maxProducts: s.plan.max_products, modules: s.plan.allowed_modules },
    // Stores arrive in Phase 20: every organization has one.
    usage: { users: users.count ?? 0, products: products.count ?? 0, stores: stores.count ?? 1 },
    startedAt: s.started_at,
    trialEndsAt: s.trial_ends_at,
    paidUntil: s.paid_until,
    nextDueDate: s.next_due_date,
    extendedUntil: s.extended_until,
    graceDays: s.grace_days,
    autoSuspend: s.auto_suspend,
    pending:
      s.pending_plan_id || s.pending_billing_cycle
        ? { planName: s.pending?.name ?? null, cycle: (s.pending_billing_cycle as BillingCycle | null) ?? null }
        : null,
    cancelAt: s.cancel_at,
    invoices: (invoices.data ?? []).map((i) => ({
      id: i.id,
      number: i.number,
      planName: i.plan_name,
      cycle: i.billing_cycle === "yearly" ? "yearly" : "monthly",
      periodStart: i.period_start,
      periodEnd: i.period_end,
      issueDate: i.issue_date,
      dueDate: i.due_date,
      total: Number(i.total),
      amountPaid: Number(i.amount_paid),
      status: i.status as InvoiceStatus,
      voidReason: i.void_reason,
      lines: [...i.subscription_invoice_lines]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => ({ kind: l.kind, description: l.description, amount: Number(l.amount) })),
    })),
    payments: (payments.data ?? []).map((p) => ({
      id: p.id,
      invoiceId: p.invoice_id,
      invoiceNumber: p.subscription_invoices?.number ?? "",
      amount: Number(p.amount),
      paidOn: p.paid_on,
      method: p.method,
      reference: p.reference,
      payerName: p.payer_name,
      note: p.note,
      hasProof: Boolean(p.proof_path),
      status: p.status as PaymentStatus,
      reason: p.reason,
      submittedBy: nameOf(p.submitted_by),
      createdAt: p.created_at,
    })),
    adjustments: (adjustments.data ?? []).map((a) => ({ id: a.id, description: a.description, amount: Number(a.amount), createdAt: a.created_at })),
    history: (history.data ?? []).map((h) => ({
      id: h.id,
      action: h.action,
      before: h.before,
      after: h.after,
      reason: h.reason,
      by: nameOf(h.changed_by),
      at: h.changed_at,
    })),
  };
}

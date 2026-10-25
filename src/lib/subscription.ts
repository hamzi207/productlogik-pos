// Subscriptions (Phase 17, deliverable 9): labels and date maths shared by the console, the
// organization's Subscription page and the emails. Dates are plain "YYYY-MM-DD" strings.

import { formatDay } from "./format";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled";
export type InvoiceStatus = "unpaid" | "partly_paid" | "paid" | "void";
export type PaymentStatus = "pending" | "verified" | "rejected" | "reversed";
export type BillingCycle = "monthly" | "yearly";

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; tone: string }> = {
  trial: { label: "Trial", tone: "badge badge-blue" },
  active: { label: "Active", tone: "badge badge-green" },
  past_due: { label: "Past due", tone: "badge badge-amber" },
  suspended: { label: "Suspended", tone: "badge badge-red" },
  cancelled: { label: "Cancelled", tone: "badge badge-muted" },
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: string }> = {
  unpaid: { label: "Unpaid", tone: "badge badge-amber" },
  partly_paid: { label: "Partly paid", tone: "badge badge-blue" },
  paid: { label: "Paid", tone: "badge badge-green" },
  void: { label: "Void", tone: "badge badge-muted" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: string }> = {
  pending: { label: "To verify", tone: "badge badge-amber" },
  verified: { label: "Verified", tone: "badge badge-green" },
  rejected: { label: "Rejected", tone: "badge badge-red" },
  reversed: { label: "Reversed", tone: "badge badge-muted" },
};

export const PAYMENT_METHODS = [
  { key: "jazzcash", label: "JazzCash" },
  { key: "easypaisa", label: "Easypaisa" },
  { key: "other_wallet", label: "Other mobile wallet" },
  { key: "bank_transfer", label: "Bank transfer" },
  { key: "cash", label: "Cash" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["key"];

export const PAYMENT_METHOD_KEYS = PAYMENT_METHODS.map((m) => m.key) as [PaymentMethod, ...PaymentMethod[]];

export const methodLabel = (key: string) => PAYMENT_METHODS.find((m) => m.key === key)?.label ?? key;

export const CYCLE_LABEL: Record<BillingCycle, string> = { monthly: "Monthly", yearly: "Yearly" };

/** Statuses as their badge; an unknown value falls back to its own text. */
export const badgeOf = <K extends string>(map: Record<K, { label: string; tone: string }>, value: string) =>
  map[value as K] ?? { label: value, tone: "badge badge-muted" };

/** "PKR 1,200" (subscriptions are always billed in PKR). */
export const pkr = (amount: number) => `PKR ${amount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

/** "01 Nov 2026" for a "YYYY-MM-DD" date (no timezone shift). */
export const billingDate = (value: string | null) => (value ? formatDay(value) : "—");

/** Today in Pakistan time as "YYYY-MM-DD" (the subscription run uses the platform's date). */
export const billingToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * The first day not yet covered: the day after the paid period or the trial, else the start date.
 * The next invoice is for the period starting then (same rule as run_subscription_cycle).
 */
export function nextPeriodStart(s: { paidUntil: string | null; trialEndsAt: string | null; startedAt: string }) {
  const covered = [s.paidUntil, s.trialEndsAt].filter((d): d is string => d !== null).sort().at(-1);
  return covered ? addDays(covered, 1) : s.startedAt;
}

/** "Users 4 / 5", "Products 120 / Unlimited". */
export const usageText = (usage: number, limit: number | null) =>
  `${usage.toLocaleString("en-PK")} / ${limit === null ? "Unlimited" : limit.toLocaleString("en-PK")}`;

/** Where organizations pay (Platform settings): printed on invoices, emails and the Subscription page. */
export type PayTo = {
  businessName: string;
  wallets: { provider?: string; title?: string; number?: string }[];
  banks: { bank?: string; title?: string; number?: string; iban?: string }[];
  note: string | null;
};

/** Where to pay, as lines: "JazzCash: 0300 1234567 (ProductLogik)". */
export function payToLines(payTo: PayTo) {
  return [
    ...payTo.wallets.map((w) => `${w.provider ?? "Mobile wallet"}: ${w.number ?? ""}${w.title ? ` (${w.title})` : ""}`),
    ...payTo.banks.map((b) => `${b.bank ?? "Bank"}: ${b.title ?? ""}, account ${b.number ?? ""}${b.iban ? `, IBAN ${b.iban}` : ""}`),
  ];
}

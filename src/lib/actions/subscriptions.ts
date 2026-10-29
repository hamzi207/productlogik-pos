"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { deliverSubscriptionEvents } from "@/lib/subscription-emails";
import { uploadProof } from "@/lib/subscription-proofs";
import { addDays, billingDate, billingToday, nextPeriodStart, pkr } from "@/lib/subscription";
import { audit, changedFields, requireSuperadmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database.types";
import {
  adjustmentSchema,
  changePlanSchema,
  extendSchema,
  pricingSchema,
  recordPaymentSchema,
  type ChangePlanInput,
  type PricingInput,
} from "@/lib/validations/subscription.schema";

// The organization's Subscription tab and /admin/billing (Phase 17, deliverable 9). Superadmin only;
// every change is audited, and tenant_subscriptions changes also land in its own history (trigger).

export type SubscriptionActionResult = { status: "success"; message: string } | { status: "error"; message: string };

type Admin = ReturnType<typeof createAdminClient>;

const ok = (message: string): SubscriptionActionResult => ({ status: "success", message });
const fail = (message: string): SubscriptionActionResult => ({ status: "error", message });
const isUuid = (id: string) => z.uuid().safeParse(id).success;
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the details.";

/** The reasons the subscription run suspends or ends an organization (the V1 suspended cut-off). */
const BILLING_REASONS = ["Subscription unpaid", "Subscription ended"];

async function loadSubscription(admin: Admin, tenantId: string) {
  const { data } = await admin.from("tenant_subscriptions").select("*").eq("tenant_id", tenantId).maybeSingle();
  return data;
}

/** Lifts a billing suspension (never a manual one) and tells the organization. */
async function reactivate(admin: Admin, tenantId: string) {
  const { data } = await admin
    .from("tenants")
    .update({ status: "active", status_reason: null, updated_at: new Date().toISOString() })
    .eq("id", tenantId)
    .eq("status", "suspended")
    .in("status_reason", BILLING_REASONS)
    .select("id");
  if (data?.length) {
    // At most one a day (unique index); a duplicate is simply not added.
    await admin.from("subscription_events").insert({ tenant_id: tenantId, kind: "reactivated", for_date: billingToday() });
  }
}

/**
 * After a plan change: unpaid invoices from `fromPeriod` on are voided and issued again at the new
 * plan's price (a downgrade is paid at the lower price). One with a payment being checked is left
 * as it is. Returns the new and the skipped invoice numbers.
 */
async function reissueOpenInvoices(admin: Admin, tenantId: string, fromPeriod: string | null, by: string) {
  let query = admin.from("subscription_invoices").select("id, number, period_start").eq("tenant_id", tenantId).eq("status", "unpaid").order("period_start");
  if (fromPeriod) query = query.gte("period_start", fromPeriod);
  const { data: open } = await query;
  const reissued: string[] = [];
  const skipped: string[] = [];
  for (const inv of open ?? []) {
    const { count } = await admin.from("subscription_payments").select("id", { count: "exact", head: true }).eq("invoice_id", inv.id).eq("status", "pending");
    if (count) {
      skipped.push(inv.number);
      continue;
    }
    await admin.from("subscription_invoices").update({ status: "void", void_reason: "Replaced after a plan change" }).eq("id", inv.id);
    // Its charges and credits go on the new invoice.
    await admin.from("subscription_adjustments").update({ invoice_id: null }).eq("invoice_id", inv.id);
    const { data: id, error } = await admin.rpc("admin_create_subscription_invoice", {
      p_tenant: tenantId,
      p_period_start: inv.period_start,
      p_issue_date: billingToday(),
      p_by: by,
    });
    if (error || !id) {
      console.error("reissue after plan change failed:", error);
      skipped.push(inv.number);
      continue;
    }
    const { data: next } = await admin.from("subscription_invoices").select("number").eq("id", id).single();
    reissued.push(`${inv.number} → ${next?.number ?? "new invoice"}`);
  }
  return { reissued, skipped };
}

/** What the organization has beyond a plan's limits (its own overrides still apply): "6 users (limit 5)". */
async function overLimits(
  admin: Admin,
  tenantId: string,
  limits: { max_users: number | null; max_products: number | null },
  overrides: { max_users: number | null; max_products: number | null },
) {
  const [{ count: users }, { count: products }] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("deactivated_at", null),
    admin.from("inventory_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_archived", false),
  ]);
  const over: string[] = [];
  const userLimit = overrides.max_users ?? limits.max_users;
  const productLimit = overrides.max_products ?? limits.max_products;
  if (userLimit !== null && (users ?? 0) > userLimit) over.push(`${users} users (limit ${userLimit})`);
  if (productLimit !== null && (products ?? 0) > productLimit) over.push(`${products} products (limit ${productLimit})`);
  return over;
}

async function done(tenantId: string, message: string) {
  await deliverSubscriptionEvents({ tenantId });
  refresh();
  return ok(message);
}

// ---------------------------------------------------------------------------
// Plan, price and limits
// ---------------------------------------------------------------------------

/** Changes the plan or cycle now (optionally restarting as a trial or billing from today) or from the next period. */
export async function changeSubscriptionPlan(tenantId: string, input: ChangePlanInput): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  if (!isUuid(tenantId)) return fail("That organization wasn't found.");
  const parsed = changePlanSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const admin = createAdminClient();
  const [sub, { data: plan }] = await Promise.all([
    loadSubscription(admin, tenantId),
    admin.from("subscription_plans").select("*").eq("id", v.planId).maybeSingle(),
  ]);
  if (!sub) return fail("This organization has no subscription.");
  if (!plan) return fail("That plan wasn't found.");
  if (plan.retired_at && plan.id !== sub.plan_id) return fail(`${plan.name} is retired and can't be assigned.`);
  if ((v.cycle === "yearly" ? plan.price_yearly : plan.price_monthly) === null) {
    return fail(`${plan.name} isn't offered ${v.cycle}.`);
  }

  const today = billingToday();
  const price = v.keepPrice ? {} : { agreed_price: null, discount_type: "none", discount_value: 0, price_note: null };
  let row: Record<string, unknown>;
  if (v.when === "next_period") {
    row = {
      pending_plan_id: plan.id === sub.plan_id ? null : plan.id,
      pending_billing_cycle: v.cycle === sub.billing_cycle ? null : v.cycle,
      ...price,
    };
  } else {
    row = { plan_id: plan.id, billing_cycle: v.cycle, pending_plan_id: null, pending_billing_cycle: null, ...price };
    if (v.startAs === "trial") {
      if (plan.trial_days < 1) return fail(`${plan.name} has no trial days.`);
      Object.assign(row, {
        status: "trial",
        started_at: today,
        trial_ends_at: addDays(today, plan.trial_days - 1),
        next_due_date: addDays(today, plan.trial_days),
        cancel_at: null,
      });
    } else if (v.startAs === "active") {
      // Bill from today, unless it's already paid beyond today. The run bills from the day after
      // the last covered day, so covering up to yesterday ends any trial and skips an unbilled gap.
      const paidAhead = sub.paid_until !== null && sub.paid_until >= today;
      Object.assign(row, {
        status: "active",
        started_at: today,
        trial_ends_at: paidAhead ? null : addDays(today, -1),
        next_due_date: paidAhead ? addDays(sub.paid_until!, 1) : today,
        cancel_at: null,
      });
    }
  }

  const { error } = await admin
    .from("tenant_subscriptions")
    .update({ ...row, updated_by: me.userId, change_reason: v.reason, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("changeSubscriptionPlan failed:", error);
    return fail("We couldn't change the plan. Please try again.");
  }
  // Bill unpaid invoices at the new price: all of them now, or the next period's if it's already issued.
  const priceChanged = plan.id !== sub.plan_id || v.cycle !== sub.billing_cycle || !v.keepPrice;
  const { reissued, skipped } = priceChanged
    ? await reissueOpenInvoices(
        admin,
        tenantId,
        v.when === "next_period" ? nextPeriodStart({ paidUntil: sub.paid_until, trialEndsAt: sub.trial_ends_at, startedAt: sub.started_at }) : null,
        me.userId,
      )
    : { reissued: [], skipped: [] };
  const over = await overLimits(admin, tenantId, plan, sub);
  await audit({
    adminId: me.userId,
    action: "subscription.plan",
    tenantId,
    reason: v.reason,
    details: { plan: plan.name, cycle: v.cycle, when: v.when, startAs: v.startAs, keepPrice: v.keepPrice, reissued, overLimits: over },
  });
  const message = [
    v.when === "next_period" ? `${plan.name} (${v.cycle}) starts with the next invoice.` : `The organization is now on ${plan.name} (${v.cycle}).`,
    reissued.length ? `Reissued at the new price: ${reissued.join(", ")}.` : "",
    skipped.length ? `Not reissued (a payment is being checked): ${skipped.join(", ")}.` : "",
    over.length ? `Over the new limits: ${over.join(", ")}. Deactivate users or remove products, or give an override.` : "",
  ];
  return done(tenantId, message.filter(Boolean).join(" "));
}

/** Agreed price, discount, limit overrides, grace days and auto-suspend. */
export async function saveSubscriptionPricing(tenantId: string, input: PricingInput): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  if (!isUuid(tenantId)) return fail("That organization wasn't found.");
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  const admin = createAdminClient();
  const sub = await loadSubscription(admin, tenantId);
  if (!sub) return fail("This organization has no subscription.");

  const row = {
    agreed_price: v.agreedPrice,
    discount_type: v.discountType,
    discount_value: v.discountType === "none" ? 0 : v.discountValue,
    price_note: v.priceNote || null,
    max_stores: v.maxStores,
    max_users: v.maxUsers,
    max_products: v.maxProducts,
    allowed_modules: v.modules,
    grace_days: v.graceDays,
    auto_suspend: v.autoSuspend,
  };
  const { error } = await admin
    .from("tenant_subscriptions")
    .update({ ...row, updated_by: me.userId, change_reason: v.reason, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("saveSubscriptionPricing failed:", error);
    return fail("We couldn't save the price and limits. Please try again.");
  }
  const diff = changedFields(sub as unknown as Record<string, unknown>, row);
  await audit({ adminId: me.userId, action: "subscription.pricing", tenantId, reason: v.reason, details: diff });
  return done(tenantId, "Price and limits saved. A new price applies from the next invoice.");
}

/**
 * Extends the trial (never paid yet) or the due date, with a reason. An organization suspended or
 * past due for non-payment is active again until then.
 */
export async function extendSubscription(tenantId: string, input: { until: string; reason: string }): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  if (!isUuid(tenantId)) return fail("That organization wasn't found.");
  const parsed = extendSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { until, reason } = parsed.data;
  const today = billingToday();
  if (until < today) return fail("Choose today or a later date.");
  const admin = createAdminClient();
  const sub = await loadSubscription(admin, tenantId);
  if (!sub) return fail("This organization has no subscription.");
  if (sub.status === "cancelled") return fail("The subscription has ended. Resume it instead.");

  const trial = sub.paid_until === null && sub.trial_ends_at !== null;
  const row = trial
    ? { trial_ends_at: until, next_due_date: addDays(until, 1), status: "trial" }
    : { extended_until: until, next_due_date: until, status: sub.status === "trial" ? "trial" : "active" };
  const { error } = await admin
    .from("tenant_subscriptions")
    .update({ ...row, updated_by: me.userId, change_reason: reason, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("extendSubscription failed:", error);
    return fail("We couldn't extend it. Please try again.");
  }
  await reactivate(admin, tenantId);
  await audit({ adminId: me.userId, action: trial ? "subscription.extend_trial" : "subscription.extend_due", tenantId, reason, details: { until } });
  return done(tenantId, trial ? `The trial now ends on ${billingDate(until)}.` : `Payment is now due by ${billingDate(until)}.`);
}

/**
 * Moves the start date while nothing has been invoiced yet (it only decides where the first billing
 * period begins). After the first invoice, extend the due date instead.
 */
export async function setSubscriptionStart(tenantId: string, input: { until: string; reason: string }): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  if (!isUuid(tenantId)) return fail("That organization wasn't found.");
  const parsed = extendSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { until: start, reason } = parsed.data;
  const admin = createAdminClient();
  const sub = await loadSubscription(admin, tenantId);
  if (!sub) return fail("This organization has no subscription.");
  if (sub.status === "cancelled") return fail("The subscription has ended. Resume it instead.");
  const { count } = await admin.from("subscription_invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "void");
  if (count) return fail("It has invoices already, so the start date is fixed. Extend the due date instead.");

  // Billing starts on the start date unless a trial still covers it; free plans have no due date.
  const trialCovers = sub.trial_ends_at !== null && sub.trial_ends_at >= start;
  const row = { started_at: start, ...(sub.next_due_date !== null && !trialCovers ? { next_due_date: start } : {}) };
  const { error } = await admin
    .from("tenant_subscriptions")
    .update({ ...row, updated_by: me.userId, change_reason: reason, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("setSubscriptionStart failed:", error);
    return fail("We couldn't change the start date. Please try again.");
  }
  await audit({ adminId: me.userId, action: "subscription.start_date", tenantId, reason, details: { before: { started_at: sub.started_at }, after: { started_at: start } } });
  return done(tenantId, `The subscription now starts on ${billingDate(start)}.`);
}

/** Usable until the end of the paid period (or trial), then "Subscription ended". */
export async function cancelSubscription(tenantId: string, reason: string): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  if (!isUuid(tenantId)) return fail("That organization wasn't found.");
  const why = z.string().trim().min(3, "Say why.").max(300).safeParse(reason);
  if (!why.success) return fail(firstIssue(why.error));
  const admin = createAdminClient();
  const sub = await loadSubscription(admin, tenantId);
  if (!sub) return fail("This organization has no subscription.");
  if (sub.status === "cancelled" || sub.cancel_at) return fail("The subscription is already cancelled.");
  const today = billingToday();
  const covered = [sub.paid_until, sub.trial_ends_at].filter((d): d is string => d !== null).sort().at(-1);
  const cancelAt = covered && covered > today ? covered : today;
  const { error } = await admin
    .from("tenant_subscriptions")
    .update({ cancel_at: cancelAt, updated_by: me.userId, change_reason: why.data, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) return fail("We couldn't cancel it. Please try again.");
  await audit({ adminId: me.userId, action: "subscription.cancel", tenantId, reason: why.data, details: { cancelAt } });
  return done(tenantId, `The subscription ends after ${billingDate(cancelAt)}.`);
}

/** Undoes a cancellation; after it has ended, billing restarts from today (the gap isn't billed). */
export async function resumeSubscription(tenantId: string, reason: string): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  if (!isUuid(tenantId)) return fail("That organization wasn't found.");
  const why = z.string().trim().min(3, "Say why.").max(300).safeParse(reason);
  if (!why.success) return fail(firstIssue(why.error));
  const admin = createAdminClient();
  const sub = await loadSubscription(admin, tenantId);
  if (!sub) return fail("This organization has no subscription.");
  if (sub.status !== "cancelled" && !sub.cancel_at) return fail("The subscription isn't cancelled.");
  const today = billingToday();
  const row: Record<string, unknown> = { cancel_at: null };
  if (sub.status === "cancelled") {
    // The run bills from the day after the last covered day: cover up to yesterday so the next
    // period starts today. trial_ends_at in the past doesn't make it a trial.
    Object.assign(row, { status: "active", next_due_date: today, trial_ends_at: addDays(today, -1) });
  }
  const { error } = await admin
    .from("tenant_subscriptions")
    .update({ ...row, updated_by: me.userId, change_reason: why.data, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) return fail("We couldn't resume it. Please try again.");
  if (sub.status === "cancelled") await reactivate(admin, tenantId);
  await audit({ adminId: me.userId, action: "subscription.resume", tenantId, reason: why.data });
  return done(tenantId, "The subscription is active again.");
}

// ---------------------------------------------------------------------------
// Adjustments and invoices
// ---------------------------------------------------------------------------

/** A one-off charge (positive) or credit (negative) on the next invoice. */
export async function addSubscriptionAdjustment(tenantId: string, input: { description: string; amount: number }): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  if (!isUuid(tenantId)) return fail("That organization wasn't found.");
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const admin = createAdminClient();
  const { error } = await admin
    .from("subscription_adjustments")
    .insert({ tenant_id: tenantId, description: parsed.data.description, amount: parsed.data.amount, created_by: me.userId });
  if (error) return fail("We couldn't add it. Please try again.");
  await audit({ adminId: me.userId, action: "subscription.adjustment", tenantId, details: { description: parsed.data.description, amount: parsed.data.amount } });
  refresh();
  return ok(`${parsed.data.amount > 0 ? "Charge" : "Credit"} of ${pkr(Math.abs(parsed.data.amount))} added to the next invoice.`);
}

export async function removeSubscriptionAdjustment(id: string): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  if (!isUuid(id)) return fail("That line wasn't found.");
  const admin = createAdminClient();
  const { data } = await admin.from("subscription_adjustments").delete().eq("id", id).is("invoice_id", null).select("tenant_id, description, amount");
  if (!data?.length) return fail("That line is already on an invoice.");
  await audit({ adminId: me.userId, action: "subscription.adjustment_removed", tenantId: data[0].tenant_id, details: { description: data[0].description, amount: data[0].amount } });
  refresh();
  return ok("Removed.");
}

/** Issues the next period's invoice today (the daily run does it on the lead day). */
export async function createSubscriptionInvoiceNow(tenantId: string): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  if (!isUuid(tenantId)) return fail("That organization wasn't found.");
  const admin = createAdminClient();
  const sub = await loadSubscription(admin, tenantId);
  if (!sub) return fail("This organization has no subscription.");
  if (sub.status === "cancelled") return fail("The subscription has ended.");
  const periodStart = nextPeriodStart({ paidUntil: sub.paid_until, trialEndsAt: sub.trial_ends_at, startedAt: sub.started_at });
  if (sub.cancel_at && periodStart > sub.cancel_at) return fail("The subscription is cancelled, so there's no next period to bill.");

  const { data: existing } = await admin
    .from("subscription_invoices")
    .select("number")
    .eq("tenant_id", tenantId)
    .eq("period_start", periodStart)
    .neq("status", "void")
    .maybeSingle();
  if (existing) return fail(`The period from ${billingDate(periodStart)} is already on ${existing.number}.`);

  const { data: id, error } = await admin.rpc("admin_create_subscription_invoice", {
    p_tenant: tenantId,
    p_period_start: periodStart,
    p_issue_date: billingToday(),
    p_by: me.userId,
  });
  if (error || !id) {
    console.error("admin_create_subscription_invoice failed:", error);
    return fail("We couldn't create the invoice. Please try again.");
  }
  const { data: inv } = await admin.from("subscription_invoices").select("number, total").eq("id", id).single();
  await audit({ adminId: me.userId, action: "subscription.invoice", tenantId, details: { number: inv?.number ?? "", total: Number(inv?.total ?? 0) } });
  return done(tenantId, `${inv?.number ?? "The invoice"} was created and emailed to the owner.`);
}

/** Voids an invoice without payments; its adjustment lines go back on the next invoice. */
export async function voidSubscriptionInvoice(invoiceId: string, reason: string): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  if (!isUuid(invoiceId)) return fail("That invoice wasn't found.");
  const why = z.string().trim().min(3, "Say why.").max(300).safeParse(reason);
  if (!why.success) return fail(firstIssue(why.error));
  const admin = createAdminClient();
  const { data: inv } = await admin.from("subscription_invoices").select("id, tenant_id, number, status").eq("id", invoiceId).maybeSingle();
  if (!inv) return fail("That invoice wasn't found.");
  if (inv.status === "void") return fail(`${inv.number} is already void.`);
  const { count } = await admin
    .from("subscription_payments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId)
    .in("status", ["pending", "verified"]);
  if ((count ?? 0) > 0) return fail(`${inv.number} has payments. Reject or reverse them first.`);
  const { error } = await admin.from("subscription_invoices").update({ status: "void", void_reason: why.data }).eq("id", invoiceId);
  if (error) return fail("We couldn't void it. Please try again.");
  await admin.from("subscription_adjustments").update({ invoice_id: null }).eq("invoice_id", invoiceId);
  await audit({ adminId: me.userId, action: "subscription.invoice_void", tenantId: inv.tenant_id, reason: why.data, details: { number: inv.number } });
  refresh();
  return ok(`${inv.number} is void.`);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** The superadmin records a payment received (verified at once). Form fields + optional "proof" file. */
export async function recordSubscriptionPayment(form: FormData): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  const parsed = recordPaymentSchema.safeParse({
    invoiceId: text(form, "invoiceId"),
    paidOn: text(form, "paidOn"),
    method: text(form, "method"),
    reference: text(form, "reference"),
    payerName: text(form, "payerName"),
    note: text(form, "note"),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = parsed.data;
  if (v.paidOn > billingToday()) return fail("The payment date can't be in the future.");
  const admin = createAdminClient();
  const { data: inv } = await admin.from("subscription_invoices").select("*").eq("id", v.invoiceId).maybeSingle();
  if (!inv || !["unpaid", "partly_paid"].includes(inv.status)) return fail("That invoice isn't open.");
  // No part payments: a payment is always the full amount due (checked again in SQL).
  const due = Number(inv.total) - Number(inv.amount_paid);
  const { count: waiting } = await admin
    .from("subscription_payments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", inv.id)
    .eq("status", "pending");
  if (waiting) return fail(`${inv.number} has a payment reported by the organization. Verify or reject it instead.`);

  const proof = await uploadProof(admin, inv.tenant_id, form.get("proof") as File | null);
  if ("error" in proof) return fail(proof.error!);
  const { data: pay, error } = await admin
    .from("subscription_payments")
    .insert({
      tenant_id: inv.tenant_id,
      invoice_id: inv.id,
      amount: due,
      paid_on: v.paidOn,
      method: v.method,
      reference: v.reference || null,
      payer_name: v.payerName || null,
      note: v.note || null,
      proof_path: proof.path,
      status: "verified",
      verified_by: me.userId,
      verified_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    console.error("recordSubscriptionPayment failed:", error);
    return fail("We couldn't record the payment. Please try again.");
  }
  await admin.from("subscription_events").insert({ tenant_id: inv.tenant_id, invoice_id: inv.id, payment_id: pay.id, kind: "payment_verified" });
  await audit({ adminId: me.userId, action: "subscription.payment", tenantId: inv.tenant_id, details: { number: inv.number, amount: due, method: v.method, reference: v.reference } });
  return done(inv.tenant_id, `${pkr(due)} recorded on ${inv.number}. A receipt was emailed.`);
}

async function loadPayment(admin: Admin, paymentId: string) {
  if (!isUuid(paymentId)) return null;
  const { data } = await admin.from("subscription_payments").select("*, subscription_invoices(number, total, amount_paid, status)").eq("id", paymentId).maybeSingle();
  return data;
}

/** A payment the organization reported: confirmed against the wallet / bank statement. */
export async function verifySubscriptionPayment(paymentId: string): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  const admin = createAdminClient();
  const pay = await loadPayment(admin, paymentId);
  if (!pay || pay.status !== "pending") return fail("That payment isn't waiting to be verified.");
  const inv = pay.subscription_invoices;
  if (!inv || !["unpaid", "partly_paid"].includes(inv.status)) return fail("Its invoice isn't open any more. Reject the payment instead.");
  const due = Number(inv.total) - Number(inv.amount_paid);
  if (Math.abs(Number(pay.amount) - due) > 0.005) {
    return fail(`${inv.number} is for ${pkr(due)} and this payment is ${pkr(Number(pay.amount))}. Part payments aren't accepted, so reject it.`);
  }
  const { data, error } = await admin
    .from("subscription_payments")
    .update({ status: "verified", verified_by: me.userId, verified_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id");
  if (error || !data?.length) return fail("We couldn't verify it. Please try again.");
  await admin.from("subscription_events").insert({ tenant_id: pay.tenant_id, invoice_id: pay.invoice_id, payment_id: pay.id, kind: "payment_verified" });
  await audit({ adminId: me.userId, action: "subscription.payment_verified", tenantId: pay.tenant_id, details: { number: inv.number, amount: Number(pay.amount), reference: pay.reference } });
  return done(pay.tenant_id, `${pkr(Number(pay.amount))} verified on ${inv.number}. A receipt was emailed.`);
}

/** Rejects a reported payment; the organization's admin sees the reason. */
export async function rejectSubscriptionPayment(paymentId: string, reason: string): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  const why = z.string().trim().min(3, "Say why (the organization sees it).").max(300).safeParse(reason);
  if (!why.success) return fail(firstIssue(why.error));
  const admin = createAdminClient();
  const pay = await loadPayment(admin, paymentId);
  if (!pay || pay.status !== "pending") return fail("That payment isn't waiting to be verified.");
  const { data } = await admin
    .from("subscription_payments")
    .update({ status: "rejected", reason: why.data, verified_by: me.userId, verified_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id");
  if (!data?.length) return fail("We couldn't reject it. Please try again.");
  await admin.from("subscription_events").insert({ tenant_id: pay.tenant_id, invoice_id: pay.invoice_id, payment_id: pay.id, kind: "payment_rejected" });
  await audit({ adminId: me.userId, action: "subscription.payment_rejected", tenantId: pay.tenant_id, reason: why.data, details: { number: pay.subscription_invoices?.number ?? "", amount: Number(pay.amount) } });
  return done(pay.tenant_id, "Rejected. The organization's admin was told why.");
}

/** Reverses a verified payment (e.g. it bounced); the invoice reopens. */
export async function reverseSubscriptionPayment(paymentId: string, reason: string): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  const why = z.string().trim().min(3, "Say why.").max(300).safeParse(reason);
  if (!why.success) return fail(firstIssue(why.error));
  const admin = createAdminClient();
  const pay = await loadPayment(admin, paymentId);
  if (!pay || pay.status !== "verified") return fail("Only verified payments can be reversed.");
  const { data } = await admin
    .from("subscription_payments")
    .update({ status: "reversed", reason: why.data })
    .eq("id", paymentId)
    .eq("status", "verified")
    .select("id");
  if (!data?.length) return fail("We couldn't reverse it. Please try again.");
  await audit({ adminId: me.userId, action: "subscription.payment_reversed", tenantId: pay.tenant_id, reason: why.data, details: { number: pay.subscription_invoices?.number ?? "", amount: Number(pay.amount) } });
  refresh();
  return ok("Reversed. The invoice is open again.");
}

/** A short-lived link to a payment's screenshot (private bucket). */
export async function subscriptionProofUrl(paymentId: string): Promise<{ url: string } | { error: string }> {
  await requireSuperadmin();
  const admin = createAdminClient();
  const pay = await loadPayment(admin, paymentId);
  if (!pay?.proof_path) return { error: "There's no screenshot on this payment." };
  const { data, error } = await admin.storage.from("subscription-proofs").createSignedUrl(pay.proof_path, 300);
  if (error || !data) return { error: "We couldn't open the screenshot." };
  return { url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// The daily run, by hand
// ---------------------------------------------------------------------------

/** Runs today's subscription cycle (idempotent) and sends what it queued. */
export async function runSubscriptionCycleNow(): Promise<SubscriptionActionResult> {
  const me = await requireSuperadmin();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("run_subscription_cycle", { p_date: billingToday() });
  if (error) {
    console.error("run_subscription_cycle failed:", error);
    return fail("The run failed. Please try again.");
  }
  const sent = await deliverSubscriptionEvents({ limit: 200 });
  const r = (data ?? {}) as Record<string, Json>;
  await audit({ adminId: me.userId, action: "subscription.run", details: { ...r, emails: sent } });
  refresh();
  return ok(`Done: ${r.invoicesIssued ?? 0} invoices issued, ${r.reminders ?? 0} reminders, ${r.suspended ?? 0} suspended, ${sent} emails sent.`);
}

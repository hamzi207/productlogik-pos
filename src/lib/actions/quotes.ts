"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getShopSession } from "@/lib/auth";
import { parsePhone } from "@/lib/phone";
import { isRangePastEnd, pageRange, type Paged, type Pagination } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import {
  localDate,
  SECTION,
  sectionForStatus,
  type DocumentSection,
  type DocumentStage,
} from "@/lib/documents";
import type { DocumentListItem, QuoteDocument } from "@/lib/types/quote";
import { ITEM_UNITS_EMBED, unitOptions } from "@/lib/uom";
import {
  DOCUMENT_STAGES,
  documentFiltersSchema,
  paymentSchema,
  quoteSchema,
  type DocumentFilters,
  type PaymentInput,
  type QuoteInput,
} from "@/lib/validations/quote.schema";

// Every query runs with the caller's session, so RLS limits it to their own
// shop. Totals, numbers, stock (reserve / deduct / release) and paid status
// are handled in SQL (save_quote, convert_quote and their triggers), never
// taken from the client.

export type QuoteActionResult =
  | { status: "success"; id: string; section: DocumentSection; number: string }
  | { status: "error"; message: string };

type PlainResult = { status: "success" } | { status: "error"; message: string };

const idSchema = z.uuid();
const stageSchema = z.enum(DOCUMENT_STAGES);

const LIST_SELECT =
  "id, quote_number, draft_number, quotation_number, status, total_amount, amount_paid, due_date, created_at, updated_at, quoted_at, invoiced_at, valid_until, walk_in_name, customers(id, name, customer_type, is_walk_in)";

// The time each section sorts and dates its documents by.
const SECTION_DATE = {
  drafts: "updated_at",
  quotations: "quoted_at",
  invoices: "invoiced_at",
} as const satisfies Record<DocumentSection, keyof DocumentListItem>;

export type DocumentPage = Paged<DocumentListItem> & {
  /** Footer totals for everything matching the filters (cancelled excluded). */
  sum: { total: number; owed: number };
};

/**
 * One page of a section's documents, newest first. `status` filters by the displayed
 * status (e.g. "due", "partial"); search matches a number or customer. Both run in SQL
 * (filter_documents), with today's date in the shop's timezone for "due".
 */
export async function getDocuments(
  section: DocumentSection,
  filters: DocumentFilters = {},
  pagination: Pagination = { page: 1, limit: 25 },
): Promise<DocumentPage> {
  const { search, status } = documentFiltersSchema.parse(filters);
  const [{ tenant }, supabase] = await Promise.all([getShopSession(), createClient()]);
  const args = {
    p_statuses: [...SECTION[section].statuses],
    p_status_key: status ?? "",
    p_search: search ?? "",
    p_today: localDate(tenant.timezone),
  };

  // A builder is single-use, hence a function (the page and the past-the-end retry).
  const build = () =>
    supabase
      .rpc("filter_documents", args, { count: "exact" })
      .select(LIST_SELECT)
      .order(SECTION_DATE[section], { ascending: false })
      .order("created_at", { ascending: false })
      .order("id");

  const { from, to } = pageRange(pagination);
  const [pageResult, sumResult] = await Promise.all([build().range(from, to), supabase.rpc("document_list_totals", args).single()]);
  let { data, count, error } = pageResult;
  if (isRangePastEnd(error)) {
    // Asked for a page past the end: report the total so the page can redirect.
    ({ count, error } = await build().range(0, 0));
    data = [];
  }
  if (error || sumResult.error) {
    console.error("getDocuments failed:", (error ?? sumResult.error)?.message);
    throw new Error("Could not load documents.");
  }

  const rows: DocumentListItem[] = (data ?? []).map(({ customers, ...doc }) => ({
    ...doc,
    total_amount: Number(doc.total_amount),
    amount_paid: Number(doc.amount_paid),
    customer: customers,
  }));
  return {
    rows,
    total: count ?? 0,
    sum: { total: Number(sumResult.data.total), owed: Number(sumResult.data.owed) },
    ...pagination,
  };
}

/** One document with its lines (in order) and payments, or null when it doesn't exist. */
export async function getQuote(id: string): Promise<QuoteDocument | null> {
  if (!idSchema.safeParse(id).success) return null;
  const [supabase, { tenant }] = await Promise.all([createClient(), getShopSession()]);
  const { data, error } = await supabase
    .from("quotes")
    .select(
      `*, customers(id, name, customer_type, whatsapp_number, is_walk_in, default_discount_percentage, billing_address, credit_days, email), quote_items(*, inventory_items(sku, quantity_on_hand, reserved_quantity, selling_price, ${ITEM_UNITS_EMBED})), invoice_payments(*, invoice_payment_items(*))`,
    )
    .eq("id", id)
    .order("sort_order", { referencedTable: "quote_items" })
    .order("paid_on", { referencedTable: "invoice_payments" })
    .maybeSingle();

  if (error) {
    console.error("getQuote failed:", error.message);
    throw new Error("Could not load this document.");
  }
  if (!data) return null;

  const { customers, quote_items, invoice_payments, ...quote } = data;
  return {
    ...quote,
    amount_paid: Number(quote.amount_paid),
    customer: customers,
    payments: invoice_payments.map(({ invoice_payment_items: allocations, ...p }) => ({
      ...p,
      amount: Number(p.amount),
      allocations: allocations.map((a) => ({ ...a, amount: Number(a.amount), quantity: a.quantity === null ? null : Number(a.quantity) })),
    })),
    lines: quote_items.map(({ inventory_items: stock, ...line }) => ({
      ...line,
      quantity: Number(line.quantity),
      uom_factor: Number(line.uom_factor),
      // Packs switched off: the base unit only, plus the unit this line was saved in.
      units: stock ? unitOptions(stock, tenant.packsEnabled, line.uom_id) : [],
      unit_price: Number(line.unit_price),
      discount_value: Number(line.discount_value),
      sku: stock?.sku ?? null,
      // What this line could use: free stock plus what it already holds.
      available: stock ? Number(stock.quantity_on_hand) - Number(stock.reserved_quantity) + Number(line.reserved_qty) + Number(line.deducted_qty) : null,
    })),
  };
}

function dbError(error: { code?: string; message: string }, action: string): QuoteActionResult & { status: "error" } {
  switch (error.code) {
    // Raised by save_quote / convert_quote / the stock and payment triggers with messages written for users.
    case "22023":
    case "23503":
    case "23514":
    case "55000":
    case "P0002":
      return { status: "error", message: error.message };
    case "42501":
      return { status: "error", message: "Your session has expired. Please sign in again." };
    default:
      console.error(`${action} failed:`, error);
      return { status: "error", message: "We couldn't save this document. Please try again." };
  }
}

type SavedRow = { id: string; status: string; quote_number: string };

const success = (row: SavedRow): QuoteActionResult => ({
  status: "success",
  id: row.id,
  section: sectionForStatus(row.status),
  number: row.quote_number,
});

/**
 * Creates (no id) or updates a document, then moves it to `stage` when that's
 * a step forward: Draft → Quotation, Draft → Invoice, Quotation → Invoice.
 */
export async function saveQuote(id: string | null, input: QuoteInput, stage: DocumentStage): Promise<QuoteActionResult> {
  if (id !== null && !idSchema.safeParse(id).success) return { status: "error", message: "Invalid document." };
  if (!stageSchema.safeParse(stage).success) return { status: "error", message: "Unknown document type." };
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the document and try again." };
  }
  const q = parsed.data;

  // Walk-in phone: same rules as customer phones (Pakistani by default).
  let walkInPhone: string | undefined;
  if (q.walkInPhone) {
    const { tenant } = await getShopSession();
    const phone = parsePhone(q.walkInPhone, tenant.allowInternationalPhones);
    if (!phone.ok) return { status: "error", message: `Walk-in phone: ${phone.error}` };
    walkInPhone = phone.e164;
  }

  const supabase = await createClient();
  const { data: saved, error } = await supabase.rpc("save_quote", {
    p_quote_id: id ?? undefined,
    p_stage: stage,
    p_customer_id: q.customerId,
    p_discount_type: q.discountType,
    p_discount_value: q.discountValue,
    p_discount_reason: q.discountReason || undefined,
    p_notes: q.notes || undefined,
    p_walk_in_name: q.walkInName || undefined,
    p_walk_in_phone: walkInPhone,
    p_due_date: q.dueDate || undefined,
    p_items: q.lines.map((l) => ({
      item_id: l.itemId,
      description: l.description,
      is_labor: l.isLabor,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount_type: l.discountType,
      discount_value: l.discountValue,
      uom_id: l.itemId ? (l.uomId ?? null) : null,
    })),
  });
  if (error) return dbError(error, "saveQuote");

  let row: SavedRow = saved;
  const current = sectionForStatus(row.status);
  const convertTo =
    (stage === "quotation" && current === "drafts") || (stage === "invoice" && current !== "invoices") ? stage : null;
  if (convertTo) {
    const converted = await supabase.rpc("convert_quote", { p_quote_id: row.id, p_target: convertTo });
    if (converted.error) {
      refresh();
      const failed = dbError(converted.error, "convertQuote");
      return { status: "error", message: `Saved as ${row.quote_number}, but it couldn't be converted: ${failed.message}` };
    }
    row = converted.data;
  }

  refresh();
  return success(row);
}

/**
 * One-click stage changes: Draft → Quotation / Invoice, Quotation → Invoice,
 * and Quotation → Draft (releases its reserved stock).
 */
export async function convertQuote(id: string, target: DocumentStage): Promise<QuoteActionResult> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid document." };
  if (!stageSchema.safeParse(target).success) return { status: "error", message: "Unknown conversion." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_quote", { p_quote_id: id, p_target: target });
  if (error) return dbError(error, "convertQuote");

  refresh();
  return success(data);
}

// Status moves: quotations (accept, cancel, re-open) and invoices (cancel → void,
// which gives its stock back; only possible without payments).
const STATUS_MOVES = {
  accepted: ["sent"],
  cancelled: ["sent", "accepted"],
  sent: ["accepted", "cancelled"],
  void: ["invoiced"],
} as const;

export async function setDocumentStatus(id: string, status: keyof typeof STATUS_MOVES): Promise<QuoteActionResult> {
  if (!idSchema.safeParse(id).success || !(status in STATUS_MOVES)) {
    return { status: "error", message: "Invalid request." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", [...STATUS_MOVES[status]])
    .select("id, status, quote_number");
  if (error) return dbError(error, "setDocumentStatus");
  if (data.length === 0) {
    return { status: "error", message: "This document has changed since you opened it. Reload and try again." };
  }

  refresh();
  return success(data[0]);
}

/** Anything without payments can be deleted (RLS policy); lines cascade and give back their stock. */
export async function deleteDocument(id: string): Promise<PlainResult> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid document." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("quotes").delete().eq("id", id).eq("amount_paid", 0).neq("status", "paid").select("id");
  if (error) {
    console.error("deleteDocument failed:", error);
    return { status: "error", message: "We couldn't delete this document. Please try again." };
  }
  if (data.length === 0) {
    return { status: "error", message: "Invoices with payments can't be deleted. Mark it unpaid first." };
  }

  refresh();
  return { status: "success" };
}

/** Records a payment; the invoice becomes Partially Paid or Paid automatically. */
export async function recordPayment(quoteId: string, input: PaymentInput): Promise<PlainResult> {
  if (!idSchema.safeParse(quoteId).success) return { status: "error", message: "Invalid invoice." };
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the payment." };
  }
  const p = parsed.data;

  // One step in the database: the payment, plus any amounts applied to specific lines.
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_quote_id: quoteId,
    p_amount: Math.round(p.amount * 100) / 100,
    p_method: p.method,
    p_paid_on: p.paidOn,
    p_notes: p.notes,
    p_items: p.items.map((i) => ({ quoteItemId: i.quoteItemId, amount: Math.round(i.amount * 100) / 100, quantity: i.quantity })),
  });
  if (error) return dbError(error, "recordPayment");

  refresh();
  return { status: "success" };
}

/** Removes every payment on an invoice, so it is unpaid again (and can then be cancelled or deleted). */
export async function markUnpaid(quoteId: string): Promise<PlainResult> {
  if (!idSchema.safeParse(quoteId).success) return { status: "error", message: "Invalid invoice." };

  const supabase = await createClient();
  const { error } = await supabase.from("invoice_payments").delete().eq("quote_id", quoteId);
  if (error) return dbError(error, "markUnpaid");

  refresh();
  return { status: "success" };
}

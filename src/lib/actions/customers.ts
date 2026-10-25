"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getShopSession } from "@/lib/auth";
import { isRangePastEnd, pageRange, type Paged, type Pagination } from "@/lib/pagination";
import type { Tables } from "@/lib/types/database.types";
import { createClient } from "@/lib/supabase/server";
import type { CustomerTag, CustomerTypeOption } from "@/lib/customer-lists";
import { getCustomerTags, getCustomerTypes } from "@/lib/customer-list-data";
import type { CustomerDetail, CustomerListItem } from "@/lib/types/customer";
import {
  customerFiltersSchema,
  customerSchema,
  type CustomerFilters,
  type CustomerFormValues,
  type CustomerInput,
} from "@/lib/validations/customer.schema";

// Every query runs with the caller's session, so RLS limits it to their own
// shop. tenant_id always comes from the session, never from the client.

export type CustomerActionResult =
  | { status: "success"; id: string }
  | { status: "error"; message: string; field?: keyof CustomerInput };

const idSchema = z.uuid();

const LIST_SELECT = "*, quotes(status, total_amount, amount_paid), customer_tag_links(tag_id)";
// ?tag= filter: an inner join on a second copy of the links, so the row still lists all its tags.
const TAGGED_SELECT = `${LIST_SELECT}, tagged:customer_tag_links!inner(tag_id)`;

// Unpaid (or part-paid) invoices; what is owed is the total minus payments.
const isOutstanding = (status: string) => status === "invoiced";
const owed = (q: { total_amount: number | string; amount_paid: number | string }) => Number(q.total_amount) - Number(q.amount_paid);
const isCancelled = (status: string) => status === "cancelled" || status === "void";

/** One page of the directory (A–Z). Each row's activity comes from its own documents. */
export async function getCustomers(filters: CustomerFilters = {}, pagination: Pagination = { page: 1, limit: 25 }): Promise<Paged<CustomerListItem>> {
  const { search, type, tag } = customerFiltersSchema.parse(filters);
  const columns = tag ? TAGGED_SELECT : LIST_SELECT;
  const supabase = await createClient();

  // Search runs in SQL (search_customers) so phone numbers match whether typed
  // as 0300-1234567 or +92 300 1234567. A builder is single-use, hence a function.
  const build = () => {
    let query = (
      search
        ? supabase.rpc("search_customers", { p_query: search }, { count: "exact" }).select(columns)
        : supabase.from("customers").select(columns, { count: "exact" })
    )
      // The shop's walk-in / cash record isn't a directory entry.
      .eq("is_walk_in", false);
    if (type) query = query.eq("customer_type", type);
    if (tag) query = query.eq("tagged.tag_id", tag);
    return query.order("name").order("id");
  };

  const { from, to } = pageRange(pagination);
  type Row = Tables<"customers"> & {
    quotes: { status: string; total_amount: number; amount_paid: number }[];
    customer_tag_links: { tag_id: string }[];
  };
  let { data, count, error } = await build().range(from, to).overrideTypes<Row[], { merge: false }>();
  if (isRangePastEnd(error)) {
    // Asked for a page past the end: report the total so the page can redirect.
    ({ count, error } = await build().range(0, 0).overrideTypes<Row[], { merge: false }>());
    data = [];
  }
  if (error) {
    console.error("getCustomers failed:", error.message);
    throw new Error("Could not load customers.");
  }

  const rows = (data ?? []).map(({ quotes, customer_tag_links, ...customer }) => ({
    ...customer,
    tagIds: customer_tag_links.map((l) => l.tag_id),
    quoteCount: quotes.filter((q) => !isCancelled(q.status)).length,
    outstanding: quotes.filter((q) => isOutstanding(q.status)).reduce((sum, q) => sum + owed(q), 0),
  }));
  return { rows, total: count ?? 0, ...pagination };
}

export type CustomerStats = { total: number; b2b: number; outstanding: number };

/** Totals for the whole directory (the summary tiles), whatever the filters or page. */
export async function getCustomerStats(): Promise<CustomerStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_directory_stats").single();
  if (error) {
    console.error("getCustomerStats failed:", error.message);
    throw new Error("Could not load customers.");
  }
  return { total: Number(data.total), b2b: Number(data.b2b), outstanding: Number(data.outstanding) };
}

/** One customer with their full quote / invoice history (newest first), or null. */
export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "*, quotes(id, quote_number, status, total_amount, amount_paid, due_date, created_at, walk_in_name), customer_tag_links(tag_id)",
    )
    .eq("id", id)
    .order("created_at", { referencedTable: "quotes", ascending: false })
    .maybeSingle();

  if (error) {
    console.error("getCustomer failed:", error.message);
    throw new Error("Could not load this customer.");
  }
  if (!data) return null;

  const { quotes, customer_tag_links, ...customer } = data;
  return {
    ...customer,
    tagIds: customer_tag_links.map((l) => l.tag_id),
    quotes: quotes.map((q) => ({ ...q, total_amount: Number(q.total_amount), amount_paid: Number(q.amount_paid) })),
    outstanding: quotes.filter((q) => isOutstanding(q.status)).reduce((sum, q) => sum + owed(q), 0),
  };
}

/** What the customer dialog needs: the organization's customer types and tags (Phase 19). */
export async function getCustomerFormOptions(): Promise<{ types: CustomerTypeOption[]; tags: CustomerTag[] }> {
  const [types, tags] = await Promise.all([getCustomerTypes(), getCustomerTags()]);
  return { types, tags };
}

/** Validates against the shop's *current* phone setting and customer types, read on the server. */
async function validate(input: CustomerFormValues) {
  const [session, types] = await Promise.all([getShopSession(), getCustomerTypes()]);
  const taxTypes = new Set(types.filter((t) => t.requires_tax_details).map((t) => t.name));
  const parsed = customerSchema(session.tenant.allowInternationalPhones, (type) => taxTypes.has(type)).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      session,
      error: {
        status: "error",
        message: issue?.message ?? "Check the highlighted fields.",
        field: issue?.path[0] as keyof CustomerInput | undefined,
      } satisfies CustomerActionResult,
    };
  }
  return { session, data: parsed.data };
}

const toRow = (c: CustomerInput) => ({
  name: c.name,
  customer_type: c.customerType,
  contact_person: c.contactPerson || null,
  whatsapp_number: c.whatsappNumber,
  phone: c.phone || null,
  email: c.email || null,
  billing_address: c.billingAddress || null,
  cnic_or_ntn: c.cnicOrNtn || null,
  tax_registration_status: c.taxRegistrationStatus,
  strn: c.taxRegistrationStatus === "registered" ? c.strn || null : null,
  default_discount_percentage: Math.round(c.defaultDiscountPercentage * 100) / 100,
  credit_days: c.creditDays,
  notes: c.notes || null,
});

// Check constraints the form also validates, in case the two ever drift.
const CONSTRAINT_ERRORS: Record<string, { field: keyof CustomerInput; message: string }> = {
  customers_tax_identity_check: { field: "cnicOrNtn", message: "This customer needs a CNIC or NTN for tax invoices." },
  customers_strn_required_check: { field: "strn", message: "Tax-registered customers need an STRN." },
  customers_cnic_or_ntn_format_check: { field: "cnicOrNtn", message: "Enter a valid CNIC or NTN." },
  customers_strn_format_check: { field: "strn", message: "An STRN has 13 digits." },
};

function dbError(error: { code?: string; message: string }, action: string): CustomerActionResult {
  // Customer type rules (customers_check_type) explain themselves.
  if (error.code === "23514" && error.message.includes("customer type")) return { status: "error", field: "customerType", message: error.message };
  if (error.code === "23514" && error.message.includes("need a CNIC")) return { status: "error", field: "cnicOrNtn", message: error.message };
  if (error.code === "23503" && error.message.includes("customer_type")) {
    return { status: "error", field: "customerType", message: "That customer type no longer exists. Choose another one." };
  }
  console.error(`${action} failed:`, error);
  if (error.code === "23514") {
    const known = Object.entries(CONSTRAINT_ERRORS).find(([name]) => error.message.includes(name));
    if (known) return { status: "error", ...known[1] };
    return { status: "error", message: "A phone number isn't in a valid format.", field: "whatsappNumber" };
  }
  return { status: "error", message: "We couldn't save this customer. Please try again." };
}

export async function createCustomer(input: CustomerFormValues): Promise<CustomerActionResult> {
  const v = await validate(input);
  if (v.error) return v.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ tenant_id: v.session.tenant.id, ...toRow(v.data) })
    .select("id")
    .single();
  if (error) return dbError(error, "createCustomer");
  const tagged = await saveTags(data.id, v.data.tagIds);
  if (tagged) return tagged;

  refresh();
  return { status: "success", id: data.id };
}

export async function updateCustomer(id: string, input: CustomerFormValues): Promise<CustomerActionResult> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid customer." };
  const v = await validate(input);
  if (v.error) return v.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ ...toRow(v.data), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return dbError(error, "updateCustomer");
  if (data.length === 0) {
    return { status: "error", message: "This customer no longer exists. They may have been deleted." };
  }
  const tagged = await saveTags(id, v.data.tagIds);
  if (tagged) return tagged;

  refresh();
  return { status: "success", id };
}

/** RF-19.2: replaces the customer's tags; returns an error result only when that fails. */
async function saveTags(id: string, tagIds: string[]): Promise<CustomerActionResult | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_customer_tags", { p_customer_id: id, p_tag_ids: tagIds });
  if (!error) return null;
  console.error("set_customer_tags failed:", error);
  refresh();
  return { status: "error", field: "tagIds", message: "The details were saved, but the tags weren't. Please try again." };
}

/** "Export CSV" on the customer directory: every customer (not the walk-in record), with their tags (RF-19.2). */
export async function exportCustomersCsv(): Promise<{ status: "success"; header: string[]; rows: (string | number)[][] } | { status: "error"; message: string }> {
  const supabase = await createClient();
  const tags = new Map((await getCustomerTags()).map((t) => [t.id, t.name]));
  const all: (Tables<"customers"> & { customer_tag_links: { tag_id: string }[] })[] = [];
  // PostgREST returns at most 1000 rows per request: page through everything.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("customers")
      .select("*, customer_tag_links(tag_id)")
      .eq("is_walk_in", false)
      .order("name")
      .order("id")
      .range(from, from + 999);
    if (error) {
      console.error("exportCustomersCsv failed:", error.message);
      return { status: "error", message: "We couldn't export the customers. Please try again." };
    }
    all.push(...data);
    if (data.length < 1000) break;
  }
  return {
    status: "success",
    header: ["Name", "Type", "Tags", "Contact Person", "WhatsApp", "Phone", "Email", "Billing Address", "CNIC / NTN", "Tax Registration", "STRN", "Credit Days", "Default Discount %", "Notes"],
    rows: all.map((c) => [
      c.name,
      c.customer_type,
      c.customer_tag_links.flatMap((l) => tags.get(l.tag_id) ?? []).sort((a, b) => a.localeCompare(b)).join("; "),
      c.contact_person ?? "",
      c.whatsapp_number ?? "",
      c.phone ?? "",
      c.email ?? "",
      c.billing_address ?? "",
      c.cnic_or_ntn ?? "",
      c.tax_registration_status === "registered" ? "Registered" : "Not registered",
      c.strn ?? "",
      c.credit_days,
      Number(c.default_discount_percentage),
      c.notes ?? "",
    ]),
  };
}

/** Customers with quotes can't be deleted (quotes.customer_id is ON DELETE RESTRICT). */
export async function deleteCustomer(id: string): Promise<CustomerActionResult> {
  if (!idSchema.safeParse(id).success) return { status: "error", message: "Invalid customer." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") {
      return {
        status: "error",
        message: "This customer has quotes or invoices, so they can't be deleted. Their history must be kept.",
      };
    }
    console.error("deleteCustomer failed:", error);
    return { status: "error", message: "We couldn't delete this customer. Please try again." };
  }
  if (data.length === 0) {
    return { status: "error", message: "This customer no longer exists. They may have been deleted." };
  }

  refresh();
  return { status: "success", id };
}

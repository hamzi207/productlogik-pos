import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { localDate, sectionForStatus, statusDisplay, statusKey, type DocumentSection } from "@/lib/documents";
import { documentAccent } from "@/lib/accent";
import { applicableAttributes, asValues, documentAttributeLine } from "@/lib/attributes";
import { buildCategoryIndex, CATEGORY_COLUMNS } from "@/lib/categories";
import { formatDate, type MoneyFormat } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { formatStrn } from "@/lib/tax-id";
import { kitIncludes } from "@/lib/kits";
import { GROUP_IMAGES_EMBED, ITEM_IMAGES_EMBED, mainImage, thumbUrl, type ProductImage } from "@/lib/product-images";
import { formatNumber } from "@/lib/uom";
import { formatIban, formatWalletNumber, parseWallets } from "@/lib/validations/document-settings.schema";

// Everything a quotation / invoice needs to be printed or shown to the customer.
// Loaded the same way for the signed-in PDF route (RLS client) and the public
// share link (server-only admin client, looked up by the document's share token).

export type PrintableLine = {
  description: string;
  /** RF-18.1: "Warranty: 12 months · Colour: Black" from the product's attributes flagged "show on documents". */
  details: string | null;
  sku: string | null;
  quantity: number;
  /** The line's unit ("kg", "box"); null for custom items (Phase 19). */
  unit: string | null;
  unitPrice: number;
  /** Per-unit discount (money). */
  discount: number;
  salePrice: number;
  total: number;
  /** RF-21.2: the product's thumbnail, when Settings → Tax & Printing shows images on this kind of document. */
  imageUrl: string | null;
  /** RF-21.1: what a kit line holds ("2 × Clip, 1 × Cable"), from the kit as it was when the line was added. */
  includes: string | null;
};

export type PrintablePayment = { paidOn: string; method: string; amount: number; notes: string | null; forItems: string | null };

/** Settings → Documents → Bank details: the "Bank Remittance" card on invoices. Display-formatted. */
export type PrintableBank = {
  bankName: string | null;
  accountTitle: string | null;
  accountNumber: string | null;
  /** Grouped in 4s, e.g. "PK36 SCBL 0000 …"; `ibanRaw` (no spaces) is what Copy IBAN copies. */
  iban: string | null;
  ibanRaw: string | null;
  raastId: string | null;
  wallets: { provider: string; number: string; title: string | null }[];
};

export type PrintableDocument = {
  id: string;
  shareToken: string;
  section: DocumentSection;
  /** "Quotation", "Invoice" or "Estimate" (drafts). */
  title: string;
  number: string;
  statusLabel: string;
  statusKey: string;
  money: MoneyFormat;
  /** Labelled dates in print order, already formatted in the shop's timezone. */
  dates: { label: string; value: string }[];
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    ntn: string | null;
    strn: string | null;
    logoUrl: string | null;
    /** Accent colour for the A4 PDF, share page and emails (always readable on white). */
    accent: string;
    /** Quotation terms on quotations / estimates, payment terms on invoices. */
    terms: string | null;
  };
  /** Invoices that still have a balance to pay, when the shop has entered bank details; else null. */
  bank: PrintableBank | null;
  customer: {
    name: string;
    contact: string | null;
    phone: string | null;
    /** E.164, for the WhatsApp button. */
    whatsapp: string | null;
    email: string | null;
    address: string | null;
    taxIds: string[];
  };
  lines: PrintableLine[];
  /** RF-21.2: where the lines' images show (Settings → Tax & Printing → On the A4 PDF / customer link). */
  pdfImages: boolean;
  shareImages: boolean;
  totals: {
    subtotal: number;
    discount: number;
    /** "Discount 25%" on the A4 PDF; null for a fixed-amount discount. The reason stays internal. */
    discountPercent: number | null;
    taxRate: number;
    tax: number;
    /** Some prices already include tax. */
    taxIncluded: boolean;
    total: number;
  };
  /** Invoices only. */
  payments: PrintablePayment[];
  paid: number;
  balance: number;
};

const SELECT =
  `*, customers(name, contact_person, whatsapp_number, phone, email, billing_address, cnic_or_ntn, strn, is_walk_in), quote_items(*, inventory_items(sku, category_id, attributes, ${ITEM_IMAGES_EMBED}, group:product_groups!inventory_items_group_fkey(${GROUP_IMAGES_EMBED}))), invoice_payments(*, invoice_payment_items(description, quantity)), tenants(industry_id, name, address, phone, email, ntn, strn, logo_url, accent_color, quote_footer_notes, invoice_terms, bank_name, bank_account_title, bank_account_number, bank_iban, bank_raast_id, bank_wallets, currency, show_paisa, timezone, images_on_drafts, images_on_quotations, images_on_invoices, images_on_pdf, images_on_share), stores!quotes_store_fkey(name, address, phone, ntn, strn)` as const;

const TITLE: Record<DocumentSection, string> = { drafts: "Estimate", quotations: "Quotation", invoices: "Invoice" };

/** Loads one document by id (signed-in, RLS) or by share token (admin client). Null when not found. */
export async function loadPrintable(
  supabase: SupabaseClient<Database>,
  by: { id: string } | { token: string },
): Promise<PrintableDocument | null> {
  let query = supabase.from("quotes").select(SELECT);
  query = "id" in by ? query.eq("id", by.id) : query.eq("share_token", by.token);
  const { data: q, error } = await query
    .order("sort_order", { referencedTable: "quote_items" })
    .order("paid_on", { referencedTable: "invoice_payments" })
    .maybeSingle();
  if (error) {
    console.error("loadPrintable failed:", error.message);
    throw new Error("Could not load this document.");
  }
  if (!q || !q.tenants) return null;

  const t = q.tenants;
  const c = q.customers;
  const tz = t.timezone;
  const day = (v: string | null) => (v ? formatDate(v.length === 10 ? `${v}T12:00:00Z` : v, tz) : null);
  const section = sectionForStatus(q.status);
  const key = statusKey(q, localDate(tz));
  const walkIn = Boolean(c?.is_walk_in);

  // Phase 20: with more than one store the document names its store, and the store's own address, phone
  // and tax numbers (when set) replace the business profile's.
  const store = q.stores;
  const { count: storeCount } = await supabase.from("stores").select("id", { count: "exact", head: true }).eq("tenant_id", q.tenant_id).eq("is_active", true);
  const dates = [
    { label: "Date", value: day(section === "invoices" ? q.invoiced_at : section === "quotations" ? q.quoted_at : q.created_at) },
    { label: "Store", value: store && (storeCount ?? 0) > 1 ? store.name : null },
    { label: "Valid until", value: section === "quotations" ? day(q.valid_until) : null },
    { label: "Due date", value: section === "invoices" ? day(q.due_date) : null },
  ].filter((d): d is { label: string; value: string } => Boolean(d.value));

  const details = await attributeDetails(supabase, q.tenant_id, t.industry_id, q.quote_items.map((l) => l.inventory_items));
  const includes = await kitContents(supabase, q.tenant_id, q.quote_items.map((l) => l.kit_components));
  // RF-21.2: each kind of document has its own switch.
  const images = section === "invoices" ? t.images_on_invoices : section === "quotations" ? t.images_on_quotations : t.images_on_drafts;
  const lines = q.quote_items.map((l, i) => ({
    description: l.description,
    details: details[i],
    sku: l.inventory_items?.sku ?? null,
    quantity: Number(l.quantity),
    unit: l.item_id ? l.uom_label : null,
    unitPrice: Number(l.unit_price),
    discount: Number(l.quantity) > 0 ? Number(l.discount_amount) / Number(l.quantity) : 0,
    salePrice: Number(l.sale_price),
    total: Number(l.total_price),
    imageUrl: images && l.inventory_items ? imageOf(l.inventory_items) : null,
    includes: includes[i],
  }));

  const payments = section === "invoices"
    ? q.invoice_payments.map((p) => ({
        paidOn: day(p.paid_on) ?? p.paid_on,
        method: p.payment_method === "Check" ? "Cheque" : p.payment_method,
        amount: Number(p.amount),
        notes: p.notes,
        forItems: p.invoice_payment_items.length
          ? p.invoice_payment_items.map((a) => (a.quantity ? `${a.description} ×${formatNumber(Number(a.quantity))}` : a.description)).join(", ")
          : null,
      }))
    : [];
  const total = Number(q.total_amount);
  const paid = Number(q.amount_paid);
  const balance = Math.max(Math.round((total - paid) * 100) / 100, 0);

  const wallets = parseWallets(t.bank_wallets).map((w) => ({ provider: w.provider, number: formatWalletNumber(w.number), title: w.title || null }));
  const hasBank = Boolean(t.bank_name || t.bank_account_number || t.bank_iban || t.bank_raast_id || wallets.length);
  // Only where there is something left to pay: not on quotations, paid or void invoices.
  const bank: PrintableBank | null =
    section === "invoices" && hasBank && balance > 0 && key !== "void" && key !== "cancelled"
      ? {
          bankName: t.bank_name,
          accountTitle: t.bank_account_title,
          accountNumber: t.bank_account_number,
          iban: t.bank_iban ? formatIban(t.bank_iban) : null,
          ibanRaw: t.bank_iban,
          raastId: t.bank_raast_id,
          wallets,
        }
      : null;

  return {
    id: q.id,
    shareToken: q.share_token,
    section,
    title: TITLE[section],
    number: q.quote_number,
    statusLabel: statusDisplay(key).label,
    statusKey: key,
    money: { currency: t.currency, showPaisa: t.show_paisa },
    dates,
    shop: {
      name: t.name,
      address: store?.address || t.address,
      phone: store?.phone ? formatPhone(store.phone) : t.phone ? formatPhone(t.phone) : null,
      email: t.email,
      ntn: store?.ntn || t.ntn,
      strn: store?.strn ? formatStrn(store.strn) : t.strn ? formatStrn(t.strn) : null,
      logoUrl: t.logo_url,
      accent: documentAccent(t.accent_color),
      terms: section === "invoices" ? t.invoice_terms : t.quote_footer_notes,
    },
    bank,
    customer: {
      name: walkIn ? (q.walk_in_name || "Walk-in customer") : (c?.name ?? "Customer"),
      contact: walkIn ? null : (c?.contact_person ?? null),
      phone: walkIn ? (q.walk_in_phone ? formatPhone(q.walk_in_phone) : null) : formatPhone(c?.whatsapp_number ?? c?.phone ?? null) || null,
      whatsapp: walkIn ? q.walk_in_phone : (c?.whatsapp_number ?? null),
      email: walkIn ? null : (c?.email ?? null),
      address: walkIn ? null : (c?.billing_address ?? null),
      taxIds: walkIn
        ? []
        : [
            c?.cnic_or_ntn ? `${c.cnic_or_ntn.length === 15 ? "CNIC" : "NTN"} ${c.cnic_or_ntn}` : null,
            c?.strn ? `STRN ${formatStrn(c.strn)}` : null,
          ].filter((v): v is string => Boolean(v)),
    },
    lines,
    pdfImages: images && t.images_on_pdf,
    shareImages: images && t.images_on_share,
    totals: {
      subtotal: Number(q.subtotal),
      discount: Number(q.discount_amount),
      discountPercent: q.discount_type === "percent" ? Number(q.discount_value) : null,
      taxRate: Number(q.tax_rate),
      tax: Number(q.tax_amount),
      taxIncluded: q.quote_items.some((l) => l.price_includes_tax),
      total,
    },
    payments,
    paid,
    balance,
  };
}

type LineProduct = { category_id: string | null; attributes: unknown } | null;

/**
 * Per line, the "show on documents" attribute values of its product (null for custom lines and products
 * without such values). Read at print time like the SKU. The share link uses the admin client, so the
 * definitions and categories are limited to the document's organization by hand, as RLS would.
 */
async function attributeDetails(supabase: SupabaseClient<Database>, tenantId: string, industryId: string, products: LineProduct[]) {
  const none = products.map(() => null);
  if (!products.some((p) => p && Object.keys(asValues(p.attributes)).length)) return none;
  const scope = `industry_id.eq.${industryId},tenant_id.eq.${tenantId}`;
  const { data: attributes, error } = await supabase
    .from("category_attributes")
    .select("*")
    .eq("show_on_documents", true)
    .eq("is_archived", false)
    .or(scope);
  if (error) console.error("Document attributes failed:", error.message);
  if (!attributes?.length) return none;

  let categories: Parameters<typeof buildCategoryIndex>[0] = [];
  if (attributes.some((a) => a.category_id)) {
    const { data, error: catError } = await supabase.from("categories").select(CATEGORY_COLUMNS).or(scope);
    if (catError) console.error("Document categories failed:", catError.message);
    categories = data ?? [];
  }
  const index = buildCategoryIndex(categories);
  return products.map((p) => (p ? documentAttributeLine(applicableAttributes(attributes, index, p.category_id), p.attributes) || null : null));
}

type ImageOwner = { product_images: ProductImage[]; group: { product_images: ProductImage[] } | null };

/** The line's thumbnail: the product's main image, else its group's (variants). */
function imageOf(item: unknown) {
  const owner = item as ImageOwner;
  const url = mainImage(owner.product_images ?? [], owner.group?.product_images);
  return url ? thumbUrl(url) : null;
}

/** RF-21.1: "2 × Clip, 1.5 kg × Cable" per line from the kit snapshot saved on the line (null for others). */
async function kitContents(supabase: SupabaseClient<Database>, tenantId: string, snapshots: unknown[]): Promise<(string | null)[]> {
  const parse = (s: unknown) =>
    Array.isArray(s)
      ? s.flatMap((e) => (e && typeof e === "object" && "item_id" in e ? [{ id: String(e.item_id), quantity: Number((e as { quantity: unknown }).quantity) }] : []))
      : [];
  const parts = snapshots.map(parse);
  const ids = [...new Set(parts.flat().map((p) => p.id))];
  if (ids.length === 0) return snapshots.map(() => null);
  // The share link uses the admin client, so the organization is checked here too.
  const { data } = await supabase
    .from("inventory_items")
    .select("id, name, base_uom:units_of_measure!inventory_items_base_uom_fkey(code)")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  const byId = new Map((data ?? []).map((r) => [r.id, r]));
  return parts.map((list) =>
    list.length === 0
      ? null
      : kitIncludes(list.map((p) => ({ name: byId.get(p.id)?.name ?? "Product", quantity: p.quantity, unit: byId.get(p.id)?.base_uom?.code ?? null }))),
  );
}

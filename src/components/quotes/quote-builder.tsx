"use client";

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Copy,
  FilePen,
  FileText,
  Loader2,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  LogOut,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  convertQuote,
  deleteDocument,
  markUnpaid,
  saveQuote,
  setDocumentStatus,
  type QuoteActionResult,
} from "@/lib/actions/quotes";
import {
  addDays,
  isDeletable,
  isEditable,
  SECTION,
  sectionForStatus,
  statusDisplay,
  type DocumentSection,
  type DocumentStage,
  type StatusKey, customerLabel } from "@/lib/documents";
import { formatDate, formatMoney, type MoneyFormat } from "@/lib/format";
import { notify } from "@/lib/notify";
import { formatPhone } from "@/lib/phone";
import { quoteTotals, type DiscountType } from "@/lib/quote-math";
import type { CustomerOption, CustomerOptionsResponse, PickerItem, QuoteDocument } from "@/lib/types/quote";
import { quoteSchema, type QuoteInput } from "@/lib/validations/quote.schema";
import { CustomerDialog } from "@/components/customers/customer-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLeaveGuard } from "@/lib/hooks/use-leave-guard";
import { LeaveDialog } from "./leave-dialog";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { CustomerPicker } from "./customer-picker";
import { LineItems, type BuilderLine } from "./line-items";
import type { CategoryChip } from "./line-search";
import { MobileActionBar } from "./mobile-action-bar";
import { PaymentDialog } from "./payment-dialog";
import type { PrintFormat } from "@/lib/validations/settings.schema";
import { usePrintDocument } from "./print-document";
import { ShareMenu } from "./share-menu";
import { allocationSummary, lineBalances } from "@/lib/payments";

type Props = {
  /** The saved document, or null for a new one. */
  doc: QuoteDocument | null;
  /** The section the page belongs to (decides the document type for new documents). */
  section: DocumentSection;
  /** Worked out on the server so dates render in the shop's timezone. */
  title: string;
  /** Header facts shown on the right: number, dates, validity… */
  meta: { label: string; value: string }[];
  /** Displayed status (worked out on the server: due dates follow the shop's timezone). */
  status: StatusKey | null;
  /** Shop-local today (YYYY-MM-DD). */
  today: string;
  /** The invoice's date (YYYY-MM-DD, shop-local): today for a new one. Due date = this + the customer's credit days. */
  invoiceDate: string;
  /** New documents: the number it will most likely get (the next free one). */
  numberPreview: string | null;
  money: MoneyFormat;
  /** Shop's current rate for drafts; issued documents keep their own. */
  taxRate: number;
  /** Tax treatment for custom items (shop setting). */
  customIncludesTax: boolean;
  allowInternationalPhones: boolean;
  terms: string | null;
  /** For the PDF / WhatsApp message. */
  shopName: string;
  /** Shop setting: A4 PDF or 80mm POS slip from this screen. */
  printFormat: PrintFormat;
  /** Pre-selected customer (?customer= from a customer profile). */
  initialCustomer: CustomerOption | null;
  /** The shop's walk-in / cash customer. */
  walkIn: CustomerOption | null;
  /** Main categories, for the phone product search's filter chips. */
  categories: CategoryChip[];
  /** The product search also matches linked vehicles (Vehicle Fitment module on). */
  vehicleSearch: boolean;
};

type Action = {
  key: string;
  label: string;
  icon: ReactNode;
  tone?: "primary" | "danger";
  disabled?: boolean;
  run: () => void;
  /** Extra choices shown in a dropdown beside the button (split button). */
  menu?: Omit<Action, "tone" | "menu">[];
};

/** Reason filled in when a customer's default discount is applied. */
const AUTO_REASON = "Customer default discount";

/** A calendar date (YYYY-MM-DD) as "22 Oct 2026"; noon UTC keeps it on the same day everywhere. */
const formatDay = (day: string) => formatDate(`${day}T12:00:00Z`, "UTC");
const autoReason = (pct: number) => `${AUTO_REASON} (${pct}%)`;

function linesFrom(doc: QuoteDocument | null): BuilderLine[] {
  return (doc?.lines ?? []).map((l) => ({
    key: l.id,
    itemId: l.item_id,
    sku: l.sku,
    description: l.description,
    isLabor: l.is_labor,
    quantity: l.quantity,
    unitPrice: l.unit_price,
    priceIncludesTax: l.price_includes_tax,
    discountType: l.discount_type === "amount" ? "amount" : "percent",
    discountValue: l.discount_value,
    stock: l.item_id ? l.available : null,
    uomId: l.item_id ? l.uom_id : null,
    uomLabel: l.uom_label,
    uomFactor: l.uom_factor,
    uomDecimals: l.item_id ? (l.units.find((u) => u.id === l.uom_id)?.decimals ?? 0) : 3,
    units: l.units,
  }));
}

/** Document discount to start with: the saved one, or the customer's default. */
function initialDiscount(doc: QuoteDocument | null, customer: CustomerOption | null) {
  if (doc) {
    return {
      type: (doc.discount_type === "percent" ? "percent" : "amount") as DiscountType,
      value: Number(doc.discount_value),
      reason: doc.discount_reason ?? "",
    };
  }
  const pct = customer ? Number(customer.default_discount_percentage) : 0;
  return pct > 0
    ? { type: "percent" as DiscountType, value: pct, reason: autoReason(pct) }
    : { type: "amount" as DiscountType, value: 0, reason: "" };
}

/**
 * Next.js keeps visited pages mounted but hidden (Cache Components +
 * <Activity>), so a "new" form would still hold the document it just created
 * when the user comes back to it. Remount the form after each create so it
 * starts blank; unsaved work is still kept if the user simply navigates away.
 */
export function QuoteBuilder(props: Props) {
  const [formKey, setFormKey] = useState(0);
  return <BuilderForm key={formKey} {...props} onCreated={() => setFormKey((k) => k + 1)} />;
}

function BuilderForm({
  doc,
  section,
  title,
  meta,
  status: displayStatus,
  today,
  invoiceDate,
  numberPreview,
  money,
  taxRate,
  customIncludesTax,
  allowInternationalPhones,
  terms,
  shopName,
  printFormat,
  initialCustomer,
  walkIn,
  categories,
  vehicleSearch,
  onCreated,
}: Props & { onCreated: () => void }) {
  const router = useRouter();
  const status = doc?.status ?? null;
  const editable = doc === null || isEditable(doc.status);
  const current: DocumentSection = doc ? sectionForStatus(doc.status) : section;
  const isInvoice = current === "invoices";
  const printer = usePrintDocument(printFormat);

  const [customer, setCustomer] = useState<CustomerOption | null>(doc?.customer ?? initialCustomer);
  const [walkInName, setWalkInName] = useState(doc?.walk_in_name ?? "");
  const [walkInPhone, setWalkInPhone] = useState(formatPhone(doc?.walk_in_phone));
  const [savingProfile, setSavingProfile] = useState(false);
  const [lines, setLines] = useState<BuilderLine[]>(() => linesFrom(doc));
  const [discount] = useState(() => initialDiscount(doc, doc?.customer ?? initialCustomer));
  const [discountType, setDiscountType] = useState<DiscountType>(discount.type);
  const [discountValue, setDiscountValue] = useState<number>(discount.value);
  const [discountReason, setDiscountReason] = useState(discount.reason);
  const [notes, setNotes] = useState(doc?.notes ?? "");
  // New invoices fall due on the invoice date plus the customer's credit period.
  const [dueDate, setDueDate] = useState(
    doc?.due_date ?? (section === "invoices" ? addDays(invoiceDate, initialCustomer?.credit_days ?? 0) : ""),
  );

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [paying, setPaying] = useState(false);
  // Phones: the header folds into one summary row once a customer is chosen.
  const headerId = useId();
  const [headerOpen, setHeaderOpen] = useState(() => !(doc?.customer ?? initialCustomer));

  const nextKey = useRef(0);
  const newKey = () => `new-${nextKey.current++}`;

  /**
   * Picking a customer applies their default discount and, on invoices, sets
   * the due date to the invoice date + their credit period. Both stay editable.
   */
  const chooseCustomer = (next: CustomerOption | null) => {
    setCustomer(next);
    // Walk-ins stay open for the buyer's name and phone.
    if (next && !next.is_walk_in) setHeaderOpen(false);
    if (isInvoice && editable && next) setDueDate(addDays(invoiceDate, next.credit_days));
    if (!next?.is_walk_in) {
      setWalkInName("");
      setWalkInPhone("");
    }
    const pct = next ? Number(next.default_discount_percentage) : 0;
    if (pct > 0) {
      setDiscountType("percent");
      setDiscountValue(pct);
      setDiscountReason(autoReason(pct));
    } else if (discountReason.startsWith(AUTO_REASON)) {
      setDiscountValue(0);
      setDiscountReason("");
    }
  };

  const input: QuoteInput = useMemo(
    () => ({
      customerId: customer?.id ?? "",
      discountType,
      discountValue,
      discountReason,
      notes,
      walkInName: customer?.is_walk_in ? walkInName : "",
      walkInPhone: customer?.is_walk_in ? walkInPhone : "",
      dueDate: isInvoice ? dueDate : "",
      lines: lines.map((l) => ({
        itemId: l.itemId,
        description: l.description,
        isLabor: l.isLabor,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountType: l.discountType,
        discountValue: l.discountValue,
        uomId: l.uomId,
      })),
    }),
    [customer, walkInName, walkInPhone, discountType, discountValue, discountReason, notes, isInvoice, dueDate, lines],
  );

  // The builder remounts after each save (keyed by updated_at), so "dirty"
  // means changed since this document was loaded.
  const [savedSnapshot] = useState(() => JSON.stringify(input));
  const dirty = JSON.stringify(input) !== savedSnapshot;

  // ---- Leaving with unsaved changes: back arrow, browser back and links ask first ----
  const { leaving, setLeaving, leaveWith } = useLeaveGuard(dirty, editable);
  const goTo = (href: string | null) => () => (href ? router.push(href) : window.history.back());

  const totals = quoteTotals(lines, { taxRate, discountType, discountValue });
  const paid = doc ? Number(doc.amount_paid) : 0;
  const balance = Math.max(Number(doc?.total_amount ?? totals.total) - paid, 0);

  const addItem = useCallback((item: PickerItem) => {
    setLines((prev) => {
      // A scanned pack adds to a line in that pack, else starts its own line.
      const scanned = item.scan_uom_id ?? null;
      const existing = prev.find((l) => l.itemId === item.id && (scanned === null || l.uomId === scanned));
      if (existing) {
        const qty = existing.quantity || 0;
        return prev.map((l) => (l === existing ? { ...l, quantity: (existing.uomDecimals > 0 ? qty : Math.floor(qty)) + 1 } : l));
      }
      // RF-19.1: a new line starts in the scanned pack, else the product's sale unit, else its base unit.
      const unit = item.units.find((u) => u.id === scanned) ?? item.units.find((u) => u.id === item.sale_uom_id) ?? item.units[0];
      return [
        ...prev,
        {
          key: newKey(),
          itemId: item.id,
          sku: item.sku,
          description: item.name,
          isLabor: false,
          quantity: 1,
          unitPrice: unit?.price ?? item.selling_price,
          priceIncludesTax: item.price_includes_tax,
          discountType: "percent",
          discountValue: 0,
          stock: item.quantity_on_hand - item.reserved_quantity,
          uomId: unit?.id ?? null,
          uomLabel: unit?.code ?? null,
          uomFactor: unit?.factor ?? 1,
          uomDecimals: unit?.decimals ?? 0,
          units: item.units,
        },
      ];
    });
  }, []);

  const addCustom = (description: string) =>
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        itemId: null,
        sku: null,
        description,
        isLabor: false,
        quantity: 1,
        unitPrice: 0,
        priceIncludesTax: customIncludesTax,
        discountType: "percent",
        discountValue: 0,
        stock: null,
        uomId: null,
        uomLabel: null,
        uomFactor: 1,
        uomDecimals: 3,
        units: [],
      },
    ]);

  /** "Save details to customer directory": the new profile replaces the walk-in on this document. */
  const onProfileSaved = async (id: string) => {
    try {
      const res = await fetch(`/api/customers?id=${id}`);
      const body = (await res.json()) as CustomerOptionsResponse;
      if (body.customers[0]) {
        chooseCustomer(body.customers[0]);
        notify.success(`${body.customers[0].name} saved to your customers`, "Now used on this document instead of the walk-in.");
      }
    } catch {
      setError("The customer was saved, but couldn't be selected. Search for them by name.");
    }
  };

  // ---- Saving and stage changes ---------------------------------------------

  /** Ends an action: toast + inline error on failure, toast with what happened on success. */
  const finish = (
    result: QuoteActionResult | { status: "success" } | { status: "error"; message: string },
    message?: string,
    description?: string,
    errorTitle = "That didn't work",
  ) => {
    setPending(false);
    setConfirm(null);
    if (result.status === "error") {
      setError(result.message);
      notify.error(errorTitle, result.message);
      return false;
    }
    setError(null);
    if (message) notify.success(message, description);
    return true;
  };

  /** "Precision Auto · Rs. 25,000.00" for toast descriptions. */
  const summary = () => {
    const who = customer?.is_walk_in ? walkInName || "Walk-in / Cash Customer" : customer?.name ?? "No customer";
    return `${who} · ${formatMoney(totals.total, money)}`;
  };

  /** The form as a valid save payload, or null (with the problem shown). */
  const validInput = (): QuoteInput | null => {
    setError(null);
    const parsed = quoteSchema.safeParse(input);
    const problem = !parsed.success
      ? parsed.error.issues[0]?.message ?? "Check the document and try again."
      : totals.discountTooLarge
        ? "The discount can't be more than the subtotal."
        : null;
    if (problem || !parsed.success) {
      finish({ status: "error", message: problem ?? "Check the document and try again." }, undefined, undefined, "Check the document");
      return null;
    }
    return parsed.data;
  };

  const save = async (stage: DocumentStage, then?: () => void) => {
    const data = validInput();
    if (!data) return;
    setPending(true);
    const result = await saveQuote(doc?.id ?? null, data, stage);
    if (result.status !== "success") {
      finish(result, undefined, undefined, doc ? "Changes not saved" : "Not created");
      return;
    }
    const label = SECTION[result.section].singular;
    const verb = doc && result.section === current ? "saved" : "created";
    // Someone else may have taken the previewed number in the meantime.
    const taken = !doc && numberPreview && result.section === section && result.number !== numberPreview;
    const stockNote =
      result.section === "invoices"
        ? verb === "created" ? "Products deducted from stock." : "Stock updated to match."
        : result.section === "quotations"
          ? verb === "created" ? "Products reserved until it is cancelled, deleted or invoiced." : "Reserved stock updated to match."
          : "Saved as a draft; nothing reserved or deducted.";
    finish(
      result,
      `${label} ${result.number} ${verb}`,
      `${summary()}. ${stockNote}${taken ? ` ${numberPreview} was used by another document in the meantime.` : ""}`,
    );
    // Navigate first, then (for a new document) reset the form kept alive in the background.
    const navigate =
      then ?? (!doc || result.section !== current ? () => router.replace(`${SECTION[result.section].path}/${result.id}`) : null);
    if (navigate) {
      leaveWith(() => {
        navigate();
        if (!doc) onCreated();
      });
    }
  };

  /** "Save as Copy": the form's current contents become a new draft; this document stays as it was. */
  const saveAsCopy = async () => {
    const data = validInput();
    if (!data || !doc) return;
    setPending(true);
    const result = await saveQuote(null, { ...data, dueDate: "" }, "draft");
    if (result.status !== "success") {
      finish(result, undefined, undefined, "Copy not saved");
      return;
    }
    finish(result, `Copy saved as draft ${result.number}`, `${summary()}. ${doc.quote_number} is unchanged.`);
    leaveWith(() => {
      router.push(`${SECTION.drafts.path}/${result.id}`);
      // Drop the edits from this document's form; it keeps its saved contents.
      onCreated();
    });
  };

  const ask = (request: Omit<ConfirmRequest, "onConfirm">, onConfirm: () => Promise<void>) =>
    setConfirm({
      ...request,
      onConfirm: async () => {
        setPending(true);
        await onConfirm();
      },
    });

  const number = doc?.quote_number;
  const unsavedNote = doc && dirty ? " Your unsaved changes are saved first." : "";

  const toQuotation = () =>
    ask(
      {
        title: doc ? `Turn ${number} into a quotation?` : "Create this quotation?",
        icon: <FileText size={18} />,
        confirmLabel: doc ? "Convert to Quotation" : "Create Quotation",
        body: (
          <p>
            It gets {doc?.quotation_number ? `its number ${doc.quotation_number} back` : <>the next <strong>Q-</strong> number</>} and moves to
            Quotations. <strong>The products on it are reserved</strong> until the quotation is cancelled, deleted or invoiced.
            {unsavedNote}
          </p>
        ),
      },
      () => save("quotation"),
    );

  const toInvoice = () =>
    ask(
      {
        title: doc ? `Turn ${number} into an invoice?` : "Create this invoice?",
        icon: <ReceiptText size={18} />,
        confirmLabel: doc ? "Convert to Invoice" : "Create Invoice",
        body: (
          <p>
            It gets the next <strong>INV-</strong> number and moves to Invoices
            {doc ? `, keeping ${number} as its earlier number` : ""}. <strong>The products are deducted from your stock</strong>
            {status === "sent" || status === "accepted" ? " (their reservation is released)" : ""}. Custom items don&apos;t
            affect stock.{unsavedNote}
          </p>
        ),
      },
      () => save("invoice"),
    );

  const STATUS_NOTE = {
    accepted: "The customer accepted; its products stay reserved.",
    cancelled: "Its reserved stock was released.",
    sent: "Re-opened; its products are reserved again.",
    void: "Cancelled; its products went back into stock.",
  } as const;
  const changeStatus = (next: keyof typeof STATUS_NOTE, message: string) => async () => {
    if (!doc) return;
    setPending(true);
    finish(await setDocumentStatus(doc.id, next), message, STATUS_NOTE[next], "Status not changed");
  };

  const cancelDocument = () =>
    ask(
      {
        title: `Cancel ${number}?`,
        icon: <Ban size={18} />,
        tone: "danger",
        confirmLabel: isInvoice ? "Cancel Invoice" : "Cancel Quotation",
        body: isInvoice ? (
          <p>The invoice stays on record as cancelled and <strong>its products go back into stock</strong>. A cancelled invoice can&apos;t be re-opened, only deleted.</p>
        ) : (
          <p>Its reserved stock is released. The quotation stays on record as cancelled and can be re-opened later.</p>
        ),
      },
      changeStatus(isInvoice ? "void" : "cancelled", `${number} cancelled`),
    );

  const toDraft = () =>
    ask(
      {
        title: `Move ${number} back to drafts?`,
        icon: <FilePen size={18} />,
        confirmLabel: "Move to Drafts",
        body: (
          <p>
            Its reserved stock is released so you can rework it. It keeps {number} and gets that number back when you issue
            it again.{dirty ? " Unsaved changes are discarded." : ""}
          </p>
        ),
      },
      async () => {
        if (!doc) return;
        const result = await convertQuote(doc.id, "draft");
        if (finish(result, `${number} moved to drafts`, `Its reserved stock was released. It gets ${number} back when re-issued.`, "Not moved") && result.status === "success") {
          leaveWith(() => router.replace(`${SECTION.drafts.path}/${result.id}`));
        }
      },
    );

  const removeDocument = () =>
    ask(
      {
        title: `Delete ${number}?`,
        icon: <Trash2 size={18} />,
        tone: "danger",
        confirmLabel: `Delete ${SECTION[current].singular}`,
        body: (
          <p>
            This {SECTION[current].singular.toLowerCase()} and its lines will be removed
            {status === "sent" || status === "accepted" ? ", and its reserved stock released" : ""}
            {status === "invoiced" ? ", and its products put back into stock" : ""}. This can&apos;t be undone.
          </p>
        ),
      },
      async () => {
        if (!doc) return;
        const freed =
          status === "invoiced" ? "Its products went back into stock." : status === "sent" || status === "accepted" ? "Its reserved stock was released." : "It's gone for good.";
        if (finish(await deleteDocument(doc.id), `${number} deleted`, freed, "Not deleted")) leaveWith(() => router.replace(SECTION[current].path));
      },
    );

  const unpay = () =>
    ask(
      {
        title: `Mark ${number} unpaid?`,
        icon: <Undo2 size={18} />,
        tone: "danger",
        confirmLabel: "Mark Unpaid",
        body: (
          <p>
            All {doc?.payments.length ?? 0} recorded {doc?.payments.length === 1 ? "payment" : "payments"} ({formatMoney(paid, money)}) are
            removed. The invoice can then be edited, cancelled or deleted. Stock is not affected.
          </p>
        ),
      },
      async () => {
        if (!doc) return;
        finish(await markUnpaid(doc.id), `${number} marked unpaid`, "Its payments were removed; it can now be edited, cancelled or deleted.", "Not changed");
      },
    );

  const saveIcon = pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />;
  /** Save, with "Save & Close" and "Save as Copy" in its dropdown (existing documents). */
  const saveAction = (stage: DocumentStage, label: string, tone?: "primary"): Action => ({
    key: "save",
    label,
    icon: saveIcon,
    tone,
    disabled: !dirty,
    run: () => void save(stage),
    menu: [
      {
        key: "save-close",
        label: "Save & Close",
        icon: <LogOut size={14} />,
        disabled: !dirty,
        run: () => void save(stage, () => router.push(SECTION[current].path)),
      },
      { key: "save-copy", label: "Save as Copy", icon: <Copy size={14} />, run: () => void saveAsCopy() },
    ],
  });
  const actions: Action[] = [];
  if (doc && isDeletable(doc)) {
    actions.push({ key: "delete", label: "Delete", icon: <Trash2 size={14} />, tone: "danger", run: removeDocument });
  }
  if (!doc) {
    actions.push(
      { key: "draft", label: "Save Draft", icon: saveIcon, tone: section === "drafts" ? "primary" : undefined, run: () => void save("draft") },
      { key: "quotation", label: "Save as Quotation", icon: <FileText size={14} />, tone: section === "quotations" ? "primary" : undefined, run: toQuotation },
      { key: "invoice", label: "Create Invoice", icon: <ReceiptText size={14} />, tone: section === "invoices" ? "primary" : undefined, run: toInvoice },
    );
  } else if (status === "draft") {
    actions.push(
      saveAction("draft", "Save Draft", "primary"),
      { key: "quotation", label: "Convert to Quotation", icon: <FileText size={14} />, run: toQuotation },
      { key: "invoice", label: "Convert to Invoice", icon: <ReceiptText size={14} />, run: toInvoice },
    );
  } else if (status === "sent" || status === "accepted") {
    actions.push(
      { key: "cancel", label: "Cancel", icon: <Ban size={14} />, tone: "danger", run: cancelDocument },
      { key: "draft", label: "Move to Drafts", icon: <FilePen size={14} />, run: toDraft },
    );
    if (status === "sent") {
      actions.push({
        key: "accept",
        label: "Mark Accepted",
        icon: <CheckCircle2 size={14} />,
        disabled: dirty,
        run: () => void changeStatus("accepted", `${number} marked accepted`)(),
      });
    }
    actions.push(
      saveAction("quotation", "Save Changes"),
      { key: "invoice", label: "Convert to Invoice", icon: <ReceiptText size={14} />, tone: "primary", run: toInvoice },
    );
  } else if (status === "cancelled") {
    actions.push(
      { key: "draft", label: "Move to Drafts", icon: <FilePen size={14} />, run: toDraft },
      { key: "reopen", label: "Re-open Quotation", icon: <RotateCcw size={14} />, run: () => void changeStatus("sent", `${number} re-opened`)() },
    );
  } else if (status === "invoiced") {
    if (paid === 0) actions.push({ key: "cancel", label: "Cancel Invoice", icon: <Ban size={14} />, tone: "danger", run: cancelDocument });
    else actions.push({ key: "unpay", label: "Mark Unpaid", icon: <Undo2 size={14} />, run: unpay });
    actions.push(
      saveAction("invoice", "Save Changes"),
      { key: "pay", label: "Record Payment", icon: <Banknote size={14} />, tone: "primary", disabled: dirty, run: () => setPaying(true) },
    );
  } else if (status === "paid") {
    actions.push({ key: "unpay", label: "Mark Unpaid", icon: <Undo2 size={14} />, run: unpay });
  }

  const buttonClass = (a: Action) =>
    `button${a.tone === "primary" ? " button-primary" : a.tone === "danger" ? " button-ghost danger" : ""}`;
  const isWalkIn = Boolean(customer?.is_walk_in);
  const shownStatus = displayStatus ? statusDisplay(displayStatus) : null;
  const showTerms = Boolean(terms);

  // Phone cashier bar: unsaved edits put Save first, otherwise the stage's main action.
  const barAction = (dirty ? actions.find((a) => a.key === "save") : undefined) ?? actions.find((a) => a.tone === "primary") ?? null;
  const showBalance = isInvoice && doc !== null && paid > 0 && !dirty;
  const headerCustomer = customer
    ? isWalkIn ? walkInName || "Walk-in / Cash customer" : customer.name
    : "Choose a customer";
  const headerFacts = [
    meta.find((m) => m.label === "Number")?.value,
    isInvoice && dueDate ? `Due ${formatDay(dueDate)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="page quote-page doc-page">
      <div className="quote-toolbar">
        <div className="quote-title">
          <Link href={SECTION[current].path} className="icon-button" aria-label={`Back to ${SECTION[current].title}`}>
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="quote-title-line">
              <h1>{title}</h1>
              {shownStatus && <span className={`badge ${shownStatus.tone}`}>{shownStatus.label}</span>}
              {dirty && <span className="badge badge-amber">Unsaved changes</span>}
            </div>
          </div>
        </div>
        <div className="heading-actions">
          {doc && (
            <ShareMenu
              id={doc.id}
              shareToken={doc.share_token}
              kind={SECTION[current].singular}
              number={doc.quote_number}
              shareable={status !== "draft" && status !== "cancelled" && status !== "void"}
              shopName={shopName}
              customerName={customerLabel(doc, customer)}
              whatsapp={isWalkIn ? doc.walk_in_phone : (customer?.whatsapp_number ?? null)}
              email={isWalkIn ? null : (customer?.email ?? null)}
              hasPayments={isInvoice && doc.payments.length > 0}
              total={Number(doc.total_amount)}
              balance={isInvoice ? balance : null}
              validUntil={current === "quotations" ? (meta.find((m) => m.label === "Valid until")?.value ?? null) : null}
              money={money}
              printFormat={printFormat}
              disabled={pending || dirty}
            />
          )}
          {doc && (
            <button type="button" className="button" disabled={pending || dirty || printer.loading} onClick={() => printer.print(doc.id)}>
              {printer.loading ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} {printer.label}
            </button>
          )}
          {printer.element}
          {actions.map((a) =>
            a.menu ? (
              <div key={a.key} className="split-button">
                <button type="button" className={buttonClass(a)} disabled={pending || a.disabled} onClick={a.run}>
                  {a.icon} {a.label}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={`${buttonClass(a)} split-toggle`} disabled={pending} aria-label="More save options">
                      <ChevronDown size={14} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto min-w-44">
                    {a.menu.map((m) => (
                      <DropdownMenuItem key={m.key} disabled={m.disabled} onSelect={m.run}>
                        {m.icon} {m.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <button key={a.key} type="button" className={buttonClass(a)} disabled={pending || a.disabled} onClick={a.run}>
                {a.icon} {a.label}
              </button>
            ),
          )}
        </div>
      </div>

      {error && <div className="form-alert form-alert-error quote-alert" role="alert">{error}</div>}
      {status === "paid" && (
        <div className="form-alert form-alert-info quote-alert" role="status">
          This invoice is paid, so it can&apos;t be changed. Mark it unpaid to edit, cancel or delete it.
        </div>
      )}
      {(status === "cancelled" || status === "void") && (
        <div className="form-alert form-alert-info quote-alert" role="status">
          {status === "void" ? "This invoice is cancelled; its products went back into stock." : "This quotation is cancelled. Re-open it to make changes."}
        </div>
      )}
      {(status === "sent" || status === "accepted") && (
        <div className="form-alert form-alert-info quote-alert" role="status">
          The products on this quotation are reserved until it is cancelled, deleted, moved back to drafts or invoiced.
        </div>
      )}

      {/* ---- Header: customer (left), document details (right) ---- */}
      <section className="card doc-header" data-open={headerOpen}>
        <button
          type="button"
          className="doc-header-toggle"
          aria-expanded={headerOpen}
          aria-controls={`${headerId}-customer ${headerId}-meta`}
          onClick={() => setHeaderOpen((o) => !o)}
        >
          <span>
            <strong className={customer ? "" : "doc-header-empty"}>{headerCustomer}</strong>
            <small>{headerFacts}</small>
          </span>
          {shownStatus && <span className={`badge ${shownStatus.tone}`}>{shownStatus.label}</span>}
          <ChevronDown size={18} className="doc-header-chevron" />
        </button>
        <div className="doc-customer" id={`${headerId}-customer`}>
          <span className="field-label">CUSTOMER</span>
          <CustomerPicker
            value={customer}
            onChange={chooseCustomer}
            allowInternationalPhones={allowInternationalPhones}
            walkIn={walkIn}
            disabled={!editable}
          />
          {customer && !isWalkIn && (
            <div className="doc-bill-to">
              <span className="field-label">BILL TO</span>
              <strong>{customer.name}</strong>
              {customer.billing_address && <span>{customer.billing_address}</span>}
              {customer.whatsapp_number && <span>{formatPhone(customer.whatsapp_number)}</span>}
            </div>
          )}
          {isWalkIn && (
            <div className="walk-in-panel">
              <label className="field">
                <span className="field-label">BUYER NAME (OPTIONAL)</span>
                <input
                  className="field-input"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="e.g. Bilal Ahmed"
                  maxLength={120}
                  readOnly={!editable}
                />
              </label>
              <label className="field">
                <span className="field-label">PHONE (OPTIONAL)</span>
                <input
                  className="field-input"
                  type="tel"
                  inputMode="tel"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  placeholder="e.g. 0300-1234567"
                  maxLength={30}
                  readOnly={!editable}
                />
              </label>
              {editable && (
                <label className="walk-in-save">
                  <input type="checkbox" checked={savingProfile} onChange={(e) => setSavingProfile(e.target.checked)} />
                  <span>
                    <strong>Save details to customer directory for future use</strong>
                    <small>Opens the full customer form (type, CNIC / NTN, address). This document then uses the new profile.</small>
                  </span>
                </label>
              )}
              <CustomerDialog
                open={savingProfile}
                onOpenChange={setSavingProfile}
                allowInternationalPhones={allowInternationalPhones}
                prefill={{ name: walkInName, whatsappNumber: walkInPhone }}
                onSaved={(id) => void onProfileSaved(id)}
              />
            </div>
          )}
        </div>

        <dl className="doc-meta" id={`${headerId}-meta`}>
          {meta.map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
          {isInvoice && (
            <div>
              <dt>Due date</dt>
              <dd>
                {editable ? (
                  <input
                    type="date"
                    className="field-input doc-date"
                    value={dueDate}
                    min={doc ? undefined : today}
                    onChange={(e) => setDueDate(e.target.value)}
                    aria-label="Due date"
                  />
                ) : dueDate ? (
                  formatDay(dueDate)
                ) : (
                  "—"
                )}
              </dd>
            </div>
          )}
          {shownStatus && (
            <div>
              <dt>Status</dt>
              <dd><span className={`badge ${shownStatus.tone}`}>{shownStatus.label}</span></dd>
            </div>
          )}
        </dl>
      </section>

      {/* ---- Line items ---- */}
      <LineItems
        lines={lines}
        onChange={setLines}
        onAdd={addItem}
        onAddCustom={addCustom}
        money={money}
        readOnly={!editable}
        categories={categories}
        vehicleSearch={vehicleSearch}
      />

      {/* ---- Footer: notes / terms (left), totals / payments (right) ---- */}
      <div className="doc-footer">
        <section className="card doc-notes">
          <label className="notes-field">
            <span>INTERNAL NOTES (NOT SHOWN TO THE CUSTOMER)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Fleet pricing approved by the owner."
              maxLength={2000}
              readOnly={!editable}
            />
          </label>
          {showTerms && (
            <div className="disclaimer">
              <strong>{isInvoice ? "Payment terms" : "Quote terms"}</strong>
              <p>{terms}</p>
            </div>
          )}
        </section>

        <section className="card doc-totals">
          <div className="summary-lines">
            {totals.lineDiscounts > 0 && (
              <div>
                <span>Line discounts given</span>
                <strong className="discount-amount">−{formatMoney(totals.lineDiscounts, money)}</strong>
              </div>
            )}
            <div>
              <span>Subtotal</span>
              <strong>{formatMoney(totals.subtotal, money)}</strong>
            </div>
            <div className="discount-row">
              <span>{isInvoice ? "Invoice discount" : "Discount"}</span>
              <div>
                <button
                  type="button"
                  className={discountType === "amount" ? "active" : ""}
                  aria-pressed={discountType === "amount"}
                  disabled={!editable}
                  onClick={() => setDiscountType("amount")}
                >
                  {money.currency}
                </button>
                <button
                  type="button"
                  className={discountType === "percent" ? "active" : ""}
                  aria-pressed={discountType === "percent"}
                  disabled={!editable}
                  onClick={() => setDiscountType("percent")}
                >
                  %
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={discountType === "percent" ? 100 : undefined}
                  step="0.01"
                  value={Number.isFinite(discountValue) ? discountValue : ""}
                  onChange={(e) => setDiscountValue(e.target.valueAsNumber)}
                  aria-label={discountType === "percent" ? "Document discount percentage" : "Document discount amount"}
                  aria-invalid={totals.discountTooLarge || undefined}
                  readOnly={!editable}
                />
              </div>
            </div>
            {(discountValue > 0 || discountReason) && (
              <label className="discount-reason">
                <span>Reason (required)</span>
                <input
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder="e.g. Fleet pricing approved by owner"
                  maxLength={255}
                  aria-invalid={(discountValue > 0 && !discountReason.trim()) || undefined}
                  readOnly={!editable}
                />
              </label>
            )}
            {totals.discount > 0 && (
              <div>
                <span>Discount applied</span>
                <strong className="discount-amount">−{formatMoney(totals.discount, money)}</strong>
              </div>
            )}
            {totals.discount > 0 && taxRate > 0 && (
              <div>
                <span>Taxable amount</span>
                <strong>{formatMoney(totals.taxable, money)}</strong>
              </div>
            )}
            <div>
              <span>Sales tax <span className="badge">{taxRate}%</span></span>
              <strong>{taxRate > 0 ? formatMoney(totals.tax, money) : "None"}</strong>
            </div>
          </div>
          <div className="grand-total">
            <div>
              <span>Total</span>
              <small>
                {taxRate === 0
                  ? "No tax charged"
                  : totals.addedTax > 0 && totals.includedTax > 0
                    ? `${formatMoney(totals.includedTax, money)} tax in prices + ${formatMoney(totals.addedTax, money)} added`
                    : totals.addedTax > 0
                      ? "Tax added on top"
                      : "Tax included in prices"}
              </small>
            </div>
            <strong>{formatMoney(totals.total, money)}</strong>
          </div>
          {totals.discountTooLarge && <p className="field-error summary-error">The discount is more than the subtotal.</p>}

          {isInvoice && doc && status !== "void" && (
            <div className="doc-payments">
              {doc.payments.map((p) => (
                <div key={p.id}>
                  <span>
                    {p.payment_method === "Check" ? "Cheque" : p.payment_method} · {formatDay(p.paid_on)}
                    {p.allocations.length > 0 && <small className="pay-for">For {allocationSummary(p.allocations)}</small>}
                    {p.notes && <small>{p.notes}</small>}
                  </span>
                  <strong>−{formatMoney(Number(p.amount), money)}</strong>
                </div>
              ))}
              <div className="doc-balance">
                <span>Balance due</span>
                <strong>{formatMoney(balance, money)}</strong>
              </div>
            </div>
          )}
        </section>
      </div>

      <MobileActionBar
        label={showBalance ? "Balance due" : "Total"}
        amount={formatMoney(showBalance ? balance : totals.total, money)}
        lineCount={lines.length}
        action={barAction}
        pending={pending}
      />

      {doc && isInvoice && (
        <PaymentDialog
          open={paying}
          onOpenChange={setPaying}
          invoiceId={doc.id}
          number={doc.quote_number}
          balance={balance}
          lines={lineBalances(doc)}
          money={money}
          today={today}
        />
      )}
      <ConfirmDialog request={confirm} pending={pending} onOpenChange={(open) => !open && setConfirm(null)} />
      <LeaveDialog
        open={leaving !== null}
        what={doc ? `${SECTION[current].singular} ${doc.quote_number}` : `this new ${SECTION[current].singular.toLowerCase()}`}
        saveLabel={doc ? "Save Changes" : `Save ${SECTION[current].singular}`}
        pending={pending}
        onKeepEditing={() => setLeaving(null)}
        onDiscard={() => {
          const target = leaving?.href ?? null;
          setLeaving(null);
          notify.warning("Changes discarded", doc ? `${doc.quote_number} was left as it was last saved.` : `The new ${SECTION[current].singular.toLowerCase()} was not saved.`);
          leaveWith(() => {
            goTo(target)();
            // A new form is kept alive in the background; start it blank next time.
            if (!doc) onCreated();
          });
        }}
        onSave={async () => {
          const target = leaving?.href ?? null;
          setLeaving(null);
          await save(SECTION[current].stage, goTo(target));
        }}
      />
    </div>
  );
}

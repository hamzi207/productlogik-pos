import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatMoney } from "@/lib/format";
import { FONT, FONT_BOLD } from "./fonts";
import type { PrintableDocument } from "@/lib/printable";
import { formatQty } from "@/lib/uom";

// Vector PDF for quotations, invoices and estimates (PROJECT_SPEC Phase 6).
// Slate text; the organization's accent colour (doc.shop.accent, RF-16.1) on the header rule, title and
// bank card. Money owed is always rose, whatever the accent.

const DANGER = "#be123c";
const PAID = "#0f766e";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const SOFT = "#f8fafc";
const STATUS_COLOUR: Record<string, string> = { paid: PAID, partial: "#7c3aed", due: DANGER, pending: "#b45309", void: MUTED, cancelled: MUTED };

const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 56, fontSize: 9, color: INK, fontFamily: FONT },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, borderBottomWidth: 2 },
  shopBlock: { width: "58%" },
  logo: { maxWidth: 170, maxHeight: 54, objectFit: "contain", marginBottom: 6 },
  shopName: { fontSize: 15, fontFamily: FONT_BOLD, marginBottom: 3 },
  small: { fontSize: 8.5, color: MUTED, lineHeight: 1.45 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 22, fontFamily: FONT_BOLD, letterSpacing: 1.5 },
  number: { fontSize: 11, fontFamily: FONT_BOLD, marginTop: 4 },
  status: { marginTop: 6, fontSize: 8, fontFamily: FONT_BOLD, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 3, color: "#ffffff" },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, marginBottom: 16 },
  box: { width: "56%", padding: 10, backgroundColor: SOFT, borderRadius: 4, borderWidth: 1, borderColor: LINE },
  label: { fontSize: 7, fontFamily: FONT_BOLD, color: MUTED, letterSpacing: 0.8, marginBottom: 4 },
  strong: { fontSize: 10.5, fontFamily: FONT_BOLD, marginBottom: 2 },
  dates: { width: "38%" },
  dateRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: LINE },
  th: { flexDirection: "row", backgroundColor: INK, color: "#ffffff", paddingVertical: 6, paddingHorizontal: 6, fontSize: 7.5, fontFamily: FONT_BOLD, letterSpacing: 0.5 },
  tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  cNo: { width: "5%" },
  cItem: { width: "34%", paddingRight: 6 },
  // Wide enough for "1.25 kg" / "12 pcs" (Phase 19 units).
  cQty: { width: "11%", textAlign: "right" },
  cNum: { width: "12.5%", textAlign: "right" },
  sku: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  bottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  notes: { width: "52%" },
  totals: { width: "42%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5 },
  grand: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingVertical: 7, paddingHorizontal: 8, backgroundColor: INK, color: "#ffffff", borderRadius: 3 },
  grandText: { fontSize: 11.5, fontFamily: FONT_BOLD },
  payRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  balance: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1.5, borderColor: DANGER, borderRadius: 3 },
  bank: { marginTop: 16, padding: 10, borderWidth: 1, borderColor: LINE, borderLeftWidth: 3, borderRadius: 4, backgroundColor: SOFT },
  bankHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  bankGrid: { flexDirection: "row", flexWrap: "wrap" },
  bankItem: { width: "50%", paddingVertical: 3, paddingRight: 8 },
  bankValue: { fontSize: 9.5, fontFamily: FONT_BOLD, marginTop: 1 },
  bankMono: { fontSize: 9.5, fontFamily: "Courier-Bold", marginTop: 1 },
  terms: { marginTop: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: LINE },
  footer: { position: "absolute", left: 36, right: 36, bottom: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED },
});

type Props = { doc: PrintableDocument; logo: { data: Buffer; format: "png" | "jpg" } | null };

/** Invoices with a balance: where to send the money (Settings → Documents → Bank details). */
function BankRemittance({ bank, balance, reference, accent }: { bank: NonNullable<PrintableDocument["bank"]>; balance: string; reference: string; accent: string }) {
  const items = [
    { label: "BANK", value: bank.bankName },
    { label: "ACCOUNT TITLE", value: bank.accountTitle },
    { label: "ACCOUNT NUMBER", value: bank.accountNumber, mono: true },
    { label: "IBAN", value: bank.iban, mono: true },
    { label: "RAAST ID", value: bank.raastId, mono: true },
    ...bank.wallets.map((w) => ({ label: w.provider.toUpperCase(), value: w.title ? `${w.number} · ${w.title}` : w.number, mono: false })),
  ].filter((i): i is { label: string; value: string; mono?: boolean } => Boolean(i.value));
  return (
    <View style={[s.bank, { borderLeftColor: accent }]} wrap={false}>
      <View style={s.bankHead}>
        <Text style={[s.label, { color: accent, marginBottom: 0 }]}>BANK REMITTANCE</Text>
        <Text style={s.small}>Pay {balance} · reference {reference}</Text>
      </View>
      <View style={s.bankGrid}>
        {items.map((i) => (
          <View key={i.label} style={s.bankItem}>
            <Text style={[s.label, { marginBottom: 0 }]}>{i.label}</Text>
            <Text style={i.mono ? s.bankMono : s.bankValue}>{i.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function DocumentPdf({ doc, logo }: Props) {
  const money = (n: number) => formatMoney(n, doc.money);
  const shopLines = [
    doc.shop.address,
    [doc.shop.phone, doc.shop.email].filter(Boolean).join("  ·  ") || null,
    [doc.shop.ntn && `NTN ${doc.shop.ntn}`, doc.shop.strn && `STRN ${doc.shop.strn}`].filter(Boolean).join("  ·  ") || null,
  ].filter(Boolean) as string[];
  const isInvoice = doc.section === "invoices";
  const anyDiscount = doc.lines.some((l) => l.discount > 0);
  const accent = doc.shop.accent;

  return (
    <Document title={`${doc.title} ${doc.number} — ${doc.shop.name}`} author={doc.shop.name} creator="ProductLogik Invoicing System">
      <Page size="A4" style={s.page}>
        {/* ---- Header: shop (left), document title (right) ---- */}
        <View style={[s.header, { borderBottomColor: accent }]}>
          <View style={s.shopBlock}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            {logo && <Image src={logo} style={s.logo} />}
            <Text style={s.shopName}>{doc.shop.name}</Text>
            {shopLines.map((line) => (
              <Text key={line} style={s.small}>{line}</Text>
            ))}
          </View>
          <View style={s.titleBlock}>
            <Text style={[s.title, { color: accent }]}>{doc.title.toUpperCase()}</Text>
            <Text style={s.number}>{doc.number}</Text>
            {doc.section !== "drafts" && (
              <Text style={[s.status, { backgroundColor: STATUS_COLOUR[doc.statusKey] ?? INK }]}>{doc.statusLabel.toUpperCase()}</Text>
            )}
          </View>
        </View>

        {/* ---- Bill to + dates ---- */}
        <View style={s.meta}>
          <View style={s.box}>
            <Text style={s.label}>{isInvoice ? "BILL TO" : "PREPARED FOR"}</Text>
            <Text style={s.strong}>{doc.customer.name}</Text>
            {doc.customer.contact && <Text style={s.small}>Attn: {doc.customer.contact}</Text>}
            {doc.customer.address && <Text style={s.small}>{doc.customer.address}</Text>}
            {(doc.customer.phone || doc.customer.email) && (
              <Text style={s.small}>{[doc.customer.phone, doc.customer.email].filter(Boolean).join("  ·  ")}</Text>
            )}
            {doc.customer.taxIds.length > 0 && <Text style={s.small}>{doc.customer.taxIds.join("  ·  ")}</Text>}
          </View>
          <View style={s.dates}>
            {doc.dates.map((d) => (
              <View key={d.label} style={s.dateRow}>
                <Text style={{ color: MUTED }}>{d.label}</Text>
                <Text style={{ fontFamily: FONT_BOLD }}>{d.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ---- Items ---- */}
        <View style={s.th} fixed>
          <Text style={s.cNo}>#</Text>
          <Text style={s.cItem}>ITEM</Text>
          <Text style={s.cQty}>QTY</Text>
          <Text style={s.cNum}>UNIT PRICE</Text>
          <Text style={s.cNum}>{anyDiscount ? "DISCOUNT" : ""}</Text>
          <Text style={s.cNum}>SALE PRICE</Text>
          <Text style={s.cNum}>TOTAL</Text>
        </View>
        {doc.lines.map((l, i) => (
          <View key={i} style={[s.tr, i % 2 === 1 ? { backgroundColor: SOFT } : {}]} wrap={false}>
            <Text style={s.cNo}>{i + 1}</Text>
            <View style={s.cItem}>
              <Text style={{ fontFamily: FONT_BOLD }}>{l.description}</Text>
              {l.details && <Text style={s.sku}>{l.details}</Text>}
              {l.sku && <Text style={s.sku}>{l.sku}</Text>}
            </View>
            <Text style={s.cQty}>{formatQty(l.quantity, l.unit)}</Text>
            <Text style={s.cNum}>{money(l.unitPrice)}</Text>
            <Text style={s.cNum}>{l.discount > 0 ? `−${money(l.discount)}` : ""}</Text>
            <Text style={s.cNum}>{money(l.salePrice)}</Text>
            <Text style={[s.cNum, { fontFamily: FONT_BOLD }]}>{money(l.total)}</Text>
          </View>
        ))}

        {/* ---- Totals (+ payments on invoices) ---- */}
        <View style={s.bottom} wrap={false}>
          <View style={s.notes}>
            {doc.section === "quotations" && doc.dates.some((d) => d.label === "Valid until") && (
              <Text style={s.small}>Prices are valid until {doc.dates.find((d) => d.label === "Valid until")!.value}.</Text>
            )}
          </View>
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text style={{ color: MUTED }}>Subtotal</Text>
              <Text>{money(doc.totals.subtotal)}</Text>
            </View>
            {doc.totals.discount > 0 && (
              <View style={s.totalRow}>
                <Text style={{ color: MUTED }}>Discount{doc.totals.discountReason ? ` (${doc.totals.discountReason})` : ""}</Text>
                <Text>−{money(doc.totals.discount)}</Text>
              </View>
            )}
            {doc.totals.taxRate > 0 && (
              <View style={s.totalRow}>
                <Text style={{ color: MUTED }}>
                  Sales tax {doc.totals.taxRate}%{doc.totals.taxIncluded ? " (incl. in prices)" : ""}
                </Text>
                <Text>{money(doc.totals.tax)}</Text>
              </View>
            )}
            <View style={s.grand}>
              <Text style={s.grandText}>Total</Text>
              <Text style={s.grandText}>{money(doc.totals.total)}</Text>
            </View>
            {isInvoice && doc.statusKey !== "void" && (
              <>
                {doc.payments.map((p, i) => (
                  <View key={i} style={s.payRow}>
                    <View>
                      <Text style={{ color: MUTED }}>{p.method} · {p.paidOn}</Text>
                      {p.forItems && <Text style={{ fontSize: 7, color: MUTED }}>For {p.forItems}</Text>}
                    </View>
                    <Text style={{ color: PAID }}>−{money(p.amount)}</Text>
                  </View>
                ))}
                <View style={s.balance}>
                  <Text style={[s.grandText, { color: DANGER }]}>Balance due</Text>
                  <Text style={[s.grandText, { color: DANGER }]}>{money(doc.balance)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {doc.bank && <BankRemittance bank={doc.bank} balance={money(doc.balance)} reference={doc.number} accent={accent} />}

        {doc.shop.terms && (
          <View style={s.terms} wrap={false}>
            <Text style={s.label}>{isInvoice ? "PAYMENT TERMS" : "TERMS & NOTES"}</Text>
            <Text style={s.small}>{doc.shop.terms}</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>{doc.shop.name} · {doc.title} {doc.number}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

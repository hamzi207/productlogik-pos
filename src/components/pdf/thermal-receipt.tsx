import { Document, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { formatMoney } from "@/lib/format";
import { FONT, FONT_BOLD } from "./fonts";
import type { PrintableDocument } from "@/lib/printable";
import { formatQty } from "@/lib/uom";
import { qrPath } from "@/lib/qr";

// 80mm POS slip (PROJECT_SPEC Phase 11) for roll printers (Epson TM, Xprinter, Sunmi):
// one page, 80mm wide, as tall as the content, black only, ~72mm printable width.

const WIDTH = 226.77; // 80mm in points
const MUTED = "#444444";

const s = StyleSheet.create({
  page: { paddingVertical: 14, paddingHorizontal: 12, fontSize: 8.5, fontFamily: FONT, color: "#000000" },
  center: { alignItems: "center", textAlign: "center" },
  shopName: { fontSize: 12.5, fontFamily: FONT_BOLD, textAlign: "center", marginBottom: 2 },
  small: { fontSize: 7.5, color: MUTED, textAlign: "center", lineHeight: 1.35 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#000000", borderBottomStyle: "dashed", marginVertical: 6 },
  title: { fontSize: 10.5, fontFamily: FONT_BOLD, textAlign: "center", letterSpacing: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  muted: { color: MUTED },
  bold: { fontFamily: FONT_BOLD },
  item: { paddingVertical: 2.5 },
  itemName: { fontFamily: FONT_BOLD, fontSize: 8.5 },
  itemSub: { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
  grand: { flexDirection: "row", justifyContent: "space-between", marginTop: 3, paddingVertical: 4, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: "#000000" },
  grandText: { fontSize: 11, fontFamily: FONT_BOLD },
  qr: { width: 92, height: 92, marginTop: 4 },
  thanks: { fontSize: 8.5, fontFamily: FONT_BOLD, textAlign: "center", marginTop: 6 },
});

function QrCode({ text }: { text: string }) {
  const { size, d } = qrPath(text);
  return (
    <Svg style={s.qr} viewBox={`0 0 ${size} ${size}`}>
      <Path d={d} fill="#000000" />
    </Svg>
  );
}

type Props = {
  doc: PrintableDocument;
  /** The customer's view-only link, for the QR code; null leaves it out (drafts, cancelled). */
  shareUrl: string | null;
};

export function ThermalReceipt({ doc, shareUrl }: Props) {
  const money = (n: number) => formatMoney(n, doc.money);
  const isInvoice = doc.section === "invoices";
  const shopLines = [
    doc.shop.address,
    doc.shop.phone,
    [doc.shop.ntn && `NTN ${doc.shop.ntn}`, doc.shop.strn && `STRN ${doc.shop.strn}`].filter(Boolean).join("  ·  ") || null,
  ].filter(Boolean) as string[];
  const methods = [...new Set(doc.payments.map((p) => p.method))].join(", ");

  return (
    <Document title={`${doc.title} ${doc.number} — POS slip`} author={doc.shop.name} creator="ProductLogik Invoicing System">
      {/* No wrapping: a roll has no page breaks, so the page grows to fit everything. */}
      <Page size={{ width: WIDTH }} style={s.page} wrap={false}>
        {/* ---- Shop ---- */}
        <Text style={s.shopName}>{doc.shop.name}</Text>
        {shopLines.map((line) => (
          <Text key={line} style={s.small}>{line}</Text>
        ))}
        <View style={s.rule} />

        {/* ---- Document ---- */}
        <Text style={s.title}>{doc.title.toUpperCase()}</Text>
        <View style={[s.row, { marginTop: 3 }]}>
          <Text style={s.muted}>No.</Text>
          <Text style={s.bold}>{doc.number}</Text>
        </View>
        {doc.dates.map((d) => (
          <View key={d.label} style={s.row}>
            <Text style={s.muted}>{d.label}</Text>
            <Text>{d.value}</Text>
          </View>
        ))}
        {doc.section !== "drafts" && (
          <View style={s.row}>
            <Text style={s.muted}>Status</Text>
            <Text style={s.bold}>{doc.statusLabel}</Text>
          </View>
        )}
        <View style={s.row}>
          <Text style={s.muted}>Customer</Text>
          <Text style={[s.bold, { maxWidth: "70%", textAlign: "right" }]}>{doc.customer.name}</Text>
        </View>
        {doc.customer.phone && (
          <View style={s.row}>
            <Text style={s.muted}>Phone</Text>
            <Text>{doc.customer.phone}</Text>
          </View>
        )}
        <View style={s.rule} />

        {/* ---- Items: name, then "qty × sale price" and the line total ---- */}
        {doc.lines.map((l, i) => (
          <View key={i} style={s.item} wrap={false}>
            <Text style={s.itemName}>{l.description}</Text>
            {l.includes && <Text style={[s.muted, { fontSize: 7.5 }]}>Includes: {l.includes}</Text>}
            {l.details && <Text style={[s.muted, { fontSize: 7.5 }]}>{l.details}</Text>}
            <View style={s.itemSub}>
              <Text style={s.muted}>
                {formatQty(l.quantity, l.unit)} × {money(l.salePrice)}
                {l.discount > 0 ? `  (−${money(l.discount)} ea)` : ""}
              </Text>
              <Text style={s.bold}>{money(l.total)}</Text>
            </View>
          </View>
        ))}
        <View style={s.rule} />

        {/* ---- Totals ---- */}
        <View style={s.row}>
          <Text style={s.muted}>Subtotal ({doc.lines.length} {doc.lines.length === 1 ? "item" : "items"})</Text>
          <Text>{money(doc.totals.subtotal)}</Text>
        </View>
        {doc.totals.discount > 0 && (
          <View style={s.row}>
            <Text style={s.muted}>Discount</Text>
            <Text>−{money(doc.totals.discount)}</Text>
          </View>
        )}
        {doc.totals.taxRate > 0 && (
          <View style={s.row}>
            <Text style={s.muted}>Sales tax {doc.totals.taxRate}%{doc.totals.taxIncluded ? " (incl.)" : ""}</Text>
            <Text>{money(doc.totals.tax)}</Text>
          </View>
        )}
        <View style={s.grand}>
          <Text style={s.grandText}>TOTAL</Text>
          <Text style={s.grandText}>{money(doc.totals.total)}</Text>
        </View>

        {/* ---- Payments (invoices) ---- */}
        {isInvoice && doc.statusKey !== "void" && (
          <View style={{ marginTop: 4 }}>
            {doc.payments.length > 0 && (
              <>
                <View style={s.row}>
                  <Text style={s.muted}>Paid by</Text>
                  <Text>{methods}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.muted}>Paid</Text>
                  <Text>{money(doc.paid)}</Text>
                </View>
              </>
            )}
            <View style={s.row}>
              <Text style={s.bold}>Balance due</Text>
              <Text style={s.bold}>{money(doc.balance)}</Text>
            </View>
          </View>
        )}

        {/* ---- QR to the customer link ---- */}
        {shareUrl && (
          <View style={[s.center, { marginTop: 6 }]} wrap={false}>
            <QrCode text={shareUrl} />
            <Text style={s.small}>Scan to view or download this {doc.title.toLowerCase()}</Text>
          </View>
        )}

        {doc.shop.terms && (
          <>
            <View style={s.rule} />
            <Text style={s.small}>{doc.shop.terms}</Text>
          </>
        )}
        <Text style={s.thanks}>Thank you for your business!</Text>
      </Page>
    </Document>
  );
}

import "server-only";
import path from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import { DocumentPdf } from "@/components/pdf/document-pdf";
import { SubscriptionInvoicePdf, type SubscriptionInvoicePdfData } from "@/components/pdf/subscription-invoice-pdf";
import { ThermalReceipt } from "@/components/pdf/thermal-receipt";
import { customerLink } from "@/lib/customer-link";
import type { PrintableDocument } from "@/lib/printable";

// Urdu / Arabic-script fallback for both PDFs (see components/pdf/fonts.ts). next.config.ts traces these
// files into the server bundle.
const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts");
Font.register({ family: "NotoSansArabic", src: path.join(FONT_DIR, "NotoSansArabic-Regular.ttf") });
Font.register({ family: "NotoSansArabic-Bold", src: path.join(FONT_DIR, "NotoSansArabic-Bold.ttf") });

/** Downloads the shop logo (or a product image) for embedding; a missing or broken one is just left out. */
async function fetchLogo(url: string | null) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const format = type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : null;
    if (!format) return null;
    return { data: Buffer.from(await res.arrayBuffer()), format } as const;
  } catch {
    return null;
  }
}

/** RF-21.2: the lines' thumbnails (each one fetched once), in line order. */
async function fetchLineImages(doc: PrintableDocument) {
  if (!doc.pdfImages) return [];
  const urls = [...new Set(doc.lines.flatMap((l) => (l.imageUrl ? [l.imageUrl] : [])))].slice(0, 100);
  const fetched = new Map(await Promise.all(urls.map(async (u) => [u, await fetchLogo(u)] as const)));
  return doc.lines.map((l) => (l.imageUrl ? (fetched.get(l.imageUrl) ?? null) : null));
}

/** The A4 PDF as a file: its bytes and a safe filename (also attached to emails). */
export async function documentPdf(doc: PrintableDocument) {
  const [logo, lineImages] = await Promise.all([fetchLogo(doc.shop.logoUrl), fetchLineImages(doc)]);
  const buffer = await renderToBuffer(<DocumentPdf doc={doc} logo={logo} lineImages={lineImages} />);
  return { buffer, filename: safeFilename(`${doc.title}-${doc.number}.pdf`) };
}

/** The document as a PDF response: inline (opens in the browser) or as a download. */
export async function pdfResponse(doc: PrintableDocument, download: boolean) {
  const { buffer, filename } = await documentPdf(doc);
  return pdfFile(buffer, filename, download);
}

/** The 80mm POS slip as a PDF (inline or as a download), with a QR code to the customer link. */
export async function receiptResponse(doc: PrintableDocument, origin: string, download: boolean) {
  const buffer = await renderToBuffer(<ThermalReceipt doc={doc} shareUrl={customerLink(doc, origin)} />);
  return pdfFile(buffer, `${doc.title}-${doc.number}-slip.pdf`, download);
}

/** ProductLogik's subscription invoice to an organization (Phase 17), inline or as a download. */
export async function subscriptionInvoiceResponse(data: SubscriptionInvoicePdfData, download: boolean) {
  const buffer = await renderToBuffer(<SubscriptionInvoicePdf data={data} />);
  return pdfFile(buffer, `ProductLogik-invoice-${data.invoice.number}.pdf`, download);
}

const safeFilename = (name: string) => name.replace(/[^\w.-]+/g, "-");

function pdfFile(buffer: Buffer, name: string, download: boolean) {
  const filename = safeFilename(name);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

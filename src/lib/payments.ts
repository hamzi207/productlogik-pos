import type { QuoteDocument } from "@/lib/types/quote";
import { formatNumber } from "@/lib/uom";

/** What one invoice line is worth and how much of it has been paid through item payments. */
export type LineBalance = {
  id: string;
  description: string;
  sku: string | null;
  quantity: number;
  /** The line's share of the invoice total (its net total, plus its share of tax and the invoice discount). */
  share: number;
  /** Share per unit, for "pay for 2 of 5". */
  unitShare: number;
  paid: number;
  remaining: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mirrors public.record_payment: share = line net total / all lines' net total × invoice total. */
export function lineBalances(doc: QuoteDocument): LineBalance[] {
  const linesTotal = doc.lines.reduce((sum, l) => sum + Number(l.total_price), 0);
  const paidByLine = new Map<string, number>();
  for (const p of doc.payments) {
    for (const a of p.allocations) {
      if (a.quote_item_id) paidByLine.set(a.quote_item_id, (paidByLine.get(a.quote_item_id) ?? 0) + Number(a.amount));
    }
  }
  return doc.lines.map((l) => {
    const share = linesTotal > 0 ? round2((Number(l.total_price) / linesTotal) * Number(doc.total_amount)) : 0;
    const paid = round2(paidByLine.get(l.id) ?? 0);
    return {
      id: l.id,
      description: l.description,
      sku: l.sku,
      quantity: l.quantity,
      share,
      unitShare: l.quantity > 0 ? share / l.quantity : share,
      paid,
      remaining: Math.max(round2(share - paid), 0),
    };
  });
}

/** "Brake pads ×2, Oil filter" for toasts and the payments list. */
export function allocationSummary(items: { description: string; quantity: number | null }[]) {
  return items.map((i) => (i.quantity ? `${i.description} ×${formatNumber(Number(i.quantity))}` : i.description)).join(", ");
}

import type { NextRequest } from "next/server";
import { z } from "zod";
import { documentHref, localDate, sectionForStatus, SECTION, statusDisplay, statusKey } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { formatQty } from "@/lib/uom";
import { getShopSession } from "@/lib/auth";
import { KIT_EMBED, kitAvailable, mapKitParts, type KitEmbedRow } from "@/lib/kits";
import { getStoreContext } from "@/lib/store";
import { availableElsewhere, mapItemStock, stockAt } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

/** One row in the Ctrl K search: where it goes and what it shows. */
export type SearchHit = { href: string; title: string; detail: string; badge?: string };
export type SearchResponse = { customers: SearchHit[]; items: SearchHit[]; documents: SearchHit[] };

const querySchema = z.object({ q: z.string().trim().min(1).max(100) });

/**
 * A quoted PostgREST filter value for "contains q": LIKE wildcards escaped (so "50%" means a literal
 * percent sign) and the whole value in double quotes, so commas / brackets in the search text are safe.
 */
const contains = (q: string) => {
  const escaped = q.replace(/[\\%_]/g, (c) => "\\" + c).replace(/"/g, '\\"');
  return `"%${escaped}%"`;
};

/**
 * Global search (top bar, Ctrl/⌘ K): up to 5 customers, parts and documents.
 * Runs with the caller's session, so RLS limits it to their shop.
 */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return Response.json({ customers: [], items: [], documents: [] } satisfies SearchResponse);
  const { q } = parsed.data;

  const [session, supabase, stores] = await Promise.all([getShopSession(), createClient(), getStoreContext()]);
  const money = (n: number) => formatMoney(Number(n), session.tenant.money);

  const [customers, items] = await Promise.all([
    supabase.rpc("search_customers", { p_query: q }).select("id, name, customer_type, whatsapp_number").eq("is_walk_in", false).order("name").limit(5),
    supabase.rpc("search_inventory_items", { p_query: q }).select(`id, name, sku, is_kit, quantity_on_hand, reserved_quantity, selling_price, base_uom:units_of_measure!inventory_items_base_uom_fkey(code), stock_levels(store_id, on_hand, reserved, low_stock_threshold), ${KIT_EMBED}`).order("name").limit(5),
  ]);

  // Documents: by number (draft / quotation / invoice), walk-in name, or a matching customer.
  const customerIds = (customers.data ?? []).map((c) => c.id);
  const pattern = contains(q);
  const filters = [
    `quote_number.ilike.${pattern}`,
    `draft_number.ilike.${pattern}`,
    `quotation_number.ilike.${pattern}`,
    `invoice_number.ilike.${pattern}`,
    `walk_in_name.ilike.${pattern}`,
    ...(customerIds.length ? [`customer_id.in.(${customerIds.join(",")})`] : []),
  ];
  const docs = await supabase
    .from("quotes")
    .select("id, quote_number, status, total_amount, amount_paid, due_date, walk_in_name, customers(name, is_walk_in)")
    .or(filters.join(","))
    .order("created_at", { ascending: false })
    .limit(5);

  if (customers.error || items.error || docs.error) {
    console.error("search failed:", (customers.error ?? items.error ?? docs.error)?.message);
    return Response.json({ error: "Search failed." }, { status: 500 });
  }

  const today = localDate(session.tenant.timezone);
  const body: SearchResponse = {
    customers: customers.data.map((c) => ({ href: `/customers/${c.id}`, title: c.name, detail: c.customer_type })),
    items: items.data.map((i) => ({
      href: `/inventory?q=${encodeURIComponent(i.sku)}`,
      title: i.name,
      detail: `${i.sku} · ${money(i.selling_price)}`,
      // Phase 20: the current store's stock once there is more than one store. RF-21.1: kits show the whole kits their products make.
      badge: i.is_kit
        ? `${formatQty(kitAvailable(mapKitParts(i as KitEmbedRow), stores.multi ? stores.current.id : null))} kits available${stores.multi ? " here" : ""}`
        : stores.multi
        ? (() => {
            const { stock } = mapItemStock({ stock_levels: i.stock_levels, store_item_prices: [] });
            const unit = i.base_uom?.code;
            return `Here: ${formatQty(stockAt(stock, stores.current.id).available, unit)} · Other stores: ${formatQty(availableElsewhere(stock, stores.current.id), unit)}`;
          })()
        : `${formatQty(i.quantity_on_hand - i.reserved_quantity, i.base_uom?.code)} available`,
    })),
    documents: docs.data.map((d) => ({
      href: documentHref(d),
      title: d.quote_number,
      detail: `${SECTION[sectionForStatus(d.status)].singular} · ${d.customers?.is_walk_in ? (d.walk_in_name || "Walk-in") : (d.customers?.name ?? "")} · ${money(d.total_amount)}`,
      badge: statusDisplay(statusKey(d, today)).label,
    })),
  };
  return Response.json(body);
}

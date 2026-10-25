import type { NextRequest } from "next/server";
import { z } from "zod";
import { buildCategoryIndex, descendantIds } from "@/lib/categories";
import { getCategories } from "@/lib/category-data";
import { createClient } from "@/lib/supabase/server";
import type { PickerItemsResponse } from "@/lib/types/quote";
import { ITEM_UNITS_EMBED, unitOptions, type BaseUnit, type ItemConversion } from "@/lib/uom";

/**
 * Products for the line-item search on drafts, quotations and invoices.
 *   GET /api/quote-items?q=tint   → up to 20 products matching "tint" (SKU, name, attribute values,
 *                                   or a linked vehicle when the Vehicle Fitment module is on)
 *   GET /api/quote-items          → the first 20 products by name
 *   GET /api/quote-items?category=<id> → only that category and everything below it (phone chips)
 * Search uses search_inventory_items; a query that is exactly a pack's barcode (Phase 19) finds its
 * product, marked with `scan_uom_id` so the line starts in that pack. Runs with the caller's session,
 * so RLS limits it to their shop.
 */
const querySchema = z.object({ q: z.string().trim().max(100).optional(), category: z.uuid().optional() });

const ITEM_COLUMNS = `id, sku, name, category:categories(name), selling_price, quantity_on_hand, reserved_quantity, low_stock_threshold, price_includes_tax, sale_uom_id, ${ITEM_UNITS_EMBED}`;

type Row = {
  id: string;
  sku: string;
  name: string;
  category: { name: string } | null;
  selling_price: number;
  quantity_on_hand: number;
  reserved_quantity: number;
  low_stock_threshold: number;
  price_includes_tax: boolean;
  sale_uom_id: string | null;
  base_uom: BaseUnit | null;
  item_uom_conversions: ItemConversion[];
};

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "Invalid search." }, { status: 400 });
  }
  const { q, category } = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let query = q ? supabase.rpc("search_inventory_items", { p_query: q }).select(ITEM_COLUMNS) : supabase.from("inventory_items").select(ITEM_COLUMNS);
  if (category) {
    // An unknown id matches nothing.
    const node = buildCategoryIndex(await getCategories()).byId.get(category);
    query = query.in("category_id", node ? descendantIds(node) : [category]);
  }
  const [{ data, error }, scanned, tenant] = await Promise.all([
    query.order("name").limit(20).overrideTypes<Row[], { merge: false }>(),
    q ? supabase.from("item_uom_conversions").select("item_id, uom_id").eq("barcode", q).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("tenants").select("packs_enabled").maybeSingle(),
  ]);
  // Settings → Units: with packs off, products go on documents in their base unit only.
  const packs = tenant.data?.packs_enabled ?? false;
  if (error) {
    console.error("Quote item lookup failed:", error.message);
    return Response.json({ error: "Couldn't load products." }, { status: 500 });
  }

  const body: PickerItemsResponse = {
    items: data.map(({ base_uom, item_uom_conversions, ...item }) => ({
      ...item,
      selling_price: Number(item.selling_price),
      quantity_on_hand: Number(item.quantity_on_hand),
      reserved_quantity: Number(item.reserved_quantity),
      low_stock_threshold: Number(item.low_stock_threshold),
      units: unitOptions({ selling_price: item.selling_price, base_uom, item_uom_conversions }, packs),
      sale_uom_id: packs ? item.sale_uom_id : null,
      scan_uom_id: packs && scanned.data?.item_id === item.id ? scanned.data.uom_id : null,
    })),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

import type { NextRequest } from "next/server";
import { z } from "zod";
import { buildCategoryIndex, descendantIds } from "@/lib/categories";
import { getCategories } from "@/lib/category-data";
import { mapOptions, type GroupRow } from "@/lib/inventory-rows";
import { KIT_EMBED, kitAvailable, kitIncludes, kitStoreStock, mapKitParts, type KitEmbedRow } from "@/lib/kits";
import { GROUP_IMAGES_EMBED, ITEM_IMAGES_EMBED, mainImage, thumbUrl, type ProductImage } from "@/lib/product-images";
import { ITEM_STOCK_EMBED, mapItemStock, priceAt, stockAt, type ItemStockRow } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";
import type { PickerGroup, PickerItem, PickerItemsResponse, PickerResult } from "@/lib/types/quote";
import { ITEM_UNITS_EMBED, unitOptions, type BaseUnit, type ItemConversion } from "@/lib/uom";

/**
 * Products for the line-item search on drafts, quotations and invoices.
 *   GET /api/quote-items?q=tint   → up to 20 results matching "tint" (SKU, name, attribute values,
 *                                   or a linked vehicle when the Vehicle Fitment module is on)
 *   GET /api/quote-items          → the first 20 by name
 *   GET /api/quote-items?category=<id> → only that category and everything below it (phone chips)
 * Search uses search_inventory_items; a query that is exactly a product's or a pack's barcode finds it,
 * marked with `scan_uom_id` when it's a pack so the line starts in that pack. Runs with the caller's
 * session, so RLS limits it to their organization.
 *   &store=<id> (Phase 20) → stock, low-stock level and price at the document's store, plus
 *                            `store_stock` (available per store) for "15 at Store B".
 * Phase 21: variants come as their product group (with every variant that's switched on, for the option
 * picker), unless the query is that variant's barcode. Kits show the whole kits their components make.
 *   &flat=1 → variants as products and no kits (picking a kit's components).
 */
const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.uuid().optional(),
  store: z.uuid().optional(),
  flat: z.literal("1").optional(),
});

const ITEM_COLUMNS = `id, sku, name, barcode, is_kit, group_id, variant_label, option_values, category:categories(name), selling_price, quantity_on_hand, reserved_quantity, low_stock_threshold, price_includes_tax, sale_uom_id, ${ITEM_UNITS_EMBED}, ${ITEM_STOCK_EMBED}, ${ITEM_IMAGES_EMBED}, ${KIT_EMBED}, group:product_groups!inventory_items_group_fkey(${GROUP_IMAGES_EMBED})`;

const LIMIT = 20;

type Row = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  is_kit: boolean;
  group_id: string | null;
  variant_label: string | null;
  option_values: unknown;
  category: { name: string } | null;
  selling_price: number;
  quantity_on_hand: number;
  reserved_quantity: number;
  low_stock_threshold: number;
  price_includes_tax: boolean;
  sale_uom_id: string | null;
  base_uom: BaseUnit | null;
  item_uom_conversions: ItemConversion[];
  product_images: ProductImage[];
  group: { product_images: ProductImage[] } | null;
} & ItemStockRow & KitEmbedRow;

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "Invalid search." }, { status: 400 });
  }
  const { q, category, store, flat } = parsed.data;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let query = q
    ? supabase.rpc("search_inventory_items", { p_query: q }).select(ITEM_COLUMNS)
    : supabase.from("inventory_items").select(ITEM_COLUMNS).eq("is_archived", false);
  if (category) {
    // An unknown id matches nothing.
    const node = buildCategoryIndex(await getCategories()).byId.get(category);
    query = query.in("category_id", node ? descendantIds(node) : [category]);
  }
  if (flat) query = query.eq("is_kit", false);
  // Several variants of one group make one result, so read more than are shown.
  const [{ data, error }, scanned, tenant] = await Promise.all([
    query.order("name").limit(LIMIT * 3).overrideTypes<Row[], { merge: false }>(),
    q ? supabase.from("item_uom_conversions").select("item_id, uom_id").eq("barcode", q).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("tenants").select("packs_enabled").maybeSingle(),
  ]);
  // Settings → Units: with packs off, products go on documents in their base unit only.
  const packs = tenant.data?.packs_enabled ?? false;
  if (error) {
    console.error("Quote item lookup failed:", error.message);
    return Response.json({ error: "Couldn't load products." }, { status: 500 });
  }

  const toPicker = ({ base_uom, item_uom_conversions, stock_levels, store_item_prices, product_images, group, kit_components, option_values, ...item }: Row): PickerItem => {
    const { stock, store_prices } = mapItemStock({ stock_levels, store_item_prices });
    // RF-20.1: the store's own price replaces the base price (packs with their own price keep theirs).
    const price = store ? priceAt({ selling_price: item.selling_price, store_prices }, store) : Number(item.selling_price);
    const image = mainImage(product_images, group?.product_images);
    const base = { ...item, selling_price: price, image_url: image ? thumbUrl(image) : null, option_values: Array.isArray(option_values) ? option_values.map(String) : [] };
    if (item.is_kit) {
      // RF-21.1: no stock of its own and no packs: the whole kits its components make.
      const parts = mapKitParts({ kit_components });
      return {
        ...base,
        quantity_on_hand: kitAvailable(parts, store ?? null),
        reserved_quantity: 0,
        low_stock_threshold: 0,
        units: unitOptions({ selling_price: price, base_uom, item_uom_conversions: [] }, false),
        sale_uom_id: null,
        scan_uom_id: null,
        store_stock: kitStoreStock(parts),
        kit_includes: kitIncludes(parts) || null,
      };
    }
    const at = store ? stockAt(stock, store) : null;
    return {
      ...base,
      quantity_on_hand: at ? at.onHand : Number(item.quantity_on_hand),
      reserved_quantity: at ? at.reserved : Number(item.reserved_quantity),
      low_stock_threshold: at?.threshold ?? Number(item.low_stock_threshold),
      units: unitOptions({ selling_price: price, base_uom, item_uom_conversions }, packs),
      sale_uom_id: packs ? item.sale_uom_id : null,
      scan_uom_id: packs && scanned.data?.item_id === item.id ? scanned.data.uom_id : null,
      store_stock: Object.fromEntries(stock.map((l) => [l.store_id, l.on_hand - l.reserved])),
      kit_includes: null,
    };
  };

  // A scanned barcode (the product's or a pack's) is that exact product, so it isn't folded into its group.
  const exact = (row: Row) => Boolean(q && (row.barcode === q || scanned.data?.item_id === row.id));
  const grouped = !flat ? [...new Set(data.filter((r) => r.group_id && !exact(r)).map((r) => r.group_id!))] : [];

  const groups = new Map<string, PickerGroup>();
  if (grouped.length) {
    const [groupRows, variantRows] = await Promise.all([
      supabase
        .from("product_groups")
        .select(`id, name, category:categories(name), product_option_types(id, name, position, product_option_values(id, value, position, price_delta)), ${GROUP_IMAGES_EMBED}`)
        .in("id", grouped)
        .overrideTypes<(Pick<GroupRow, "id" | "name" | "product_option_types" | "product_images"> & { category: { name: string } | null })[], { merge: false }>(),
      supabase.from("inventory_items").select(ITEM_COLUMNS).in("group_id", grouped).eq("is_archived", false).order("sku").overrideTypes<Row[], { merge: false }>(),
    ]);
    if (groupRows.error || variantRows.error) {
      console.error("Quote item groups failed:", (groupRows.error ?? variantRows.error)?.message);
      return Response.json({ error: "Couldn't load products." }, { status: 500 });
    }
    for (const g of groupRows.data) {
      const image = mainImage(g.product_images);
      groups.set(g.id, {
        id: g.id,
        name: g.name,
        category: g.category,
        image_url: image ? thumbUrl(image) : null,
        options: mapOptions(g.product_option_types).map((o) => ({ id: o.id, name: o.name, values: o.values.map((v) => ({ id: v.id, value: v.value })) })),
        variants: variantRows.data.filter((v) => v.group_id === g.id).map(toPicker),
      });
    }
  }

  // In the search's order: a group where its first matching variant was.
  const results: PickerResult[] = [];
  const shown = new Set<string>();
  for (const row of data) {
    if (results.length >= LIMIT) break;
    const group = row.group_id && !exact(row) ? groups.get(row.group_id) : undefined;
    if (group) {
      if (shown.has(group.id)) continue;
      shown.add(group.id);
      results.push({ kind: "group", group });
    } else {
      results.push({ kind: "item", item: toPicker(row) });
    }
  }
  const body: PickerItemsResponse = { results };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

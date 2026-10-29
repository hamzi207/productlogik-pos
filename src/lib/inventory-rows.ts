import "server-only";
import { KIT_EMBED, mapKitParts, type KitEmbedRow } from "@/lib/kits";
import { GROUP_IMAGES_EMBED, ITEM_IMAGES_EMBED, sortImages, type ProductImage } from "@/lib/product-images";
import { ITEM_STOCK_EMBED, mapItemStock, type ItemStockRow } from "@/lib/stock";
import type { Tables } from "@/lib/types/database.types";
import type { FitmentVehicle, InventoryListItem, ProductGroupEntry, ProductOption } from "@/lib/types/inventory";
import { ITEM_UNITS_EMBED, type BaseUnit, type ItemConversion } from "@/lib/uom";

// How the inventory page and product dialogs read products and product groups (Phase 21).

/** inventory_items with fitment, units, stock per store, images, kit components and (variants) the group. */
export const ITEM_SELECT = `*, item_vehicle_compatibility(vehicles(id, year, make, model, trim)), ${ITEM_UNITS_EMBED}, ${ITEM_STOCK_EMBED}, ${ITEM_IMAGES_EMBED}, ${KIT_EMBED}, group:product_groups!inventory_items_group_fkey(id, name, ${GROUP_IMAGES_EMBED})`;

/** product_groups with options, values, images and the base unit. */
export const GROUP_SELECT = `*, product_option_types(id, name, position, product_option_values(id, value, position, price_delta)), ${GROUP_IMAGES_EMBED}, base_uom:units_of_measure!product_groups_base_uom_fkey(id, code, decimals)`;

export type ItemRow = Tables<"inventory_items"> & {
  item_vehicle_compatibility: { vehicles: FitmentVehicle | null }[];
  base_uom: BaseUnit | null;
  item_uom_conversions: ItemConversion[];
  product_images: ProductImage[];
  group: { id: string; name: string; product_images: ProductImage[] } | null;
} & ItemStockRow & KitEmbedRow;

export type GroupRow = Tables<"product_groups"> & {
  product_option_types: { id: string; name: string; position: number; product_option_values: { id: string; value: string; position: number; price_delta: number }[] }[];
  product_images: ProductImage[];
  base_uom: BaseUnit | null;
};

/** Numbers from the select (numeric columns can arrive as strings). */
export function mapItem({ item_vehicle_compatibility, item_uom_conversions, stock_levels, store_item_prices, product_images, group, kit_components, ...item }: ItemRow): InventoryListItem {
  return {
    ...item,
    ...mapItemStock({ stock_levels, store_item_prices }),
    cost_price: Number(item.cost_price),
    selling_price: Number(item.selling_price),
    quantity_on_hand: Number(item.quantity_on_hand),
    reserved_quantity: Number(item.reserved_quantity),
    low_stock_threshold: Number(item.low_stock_threshold),
    available_quantity: item.available_quantity === null ? null : Number(item.available_quantity),
    conversions: item_uom_conversions
      .map((c) => ({ ...c, factor: Number(c.factor), selling_price: c.selling_price === null ? null : Number(c.selling_price) }))
      .sort((a, b) => a.sort_order - b.sort_order),
    vehicles: item_vehicle_compatibility
      .flatMap((link) => (link.vehicles ? [link.vehicles] : []))
      .sort((a, b) => b.year - a.year || a.make.localeCompare(b.make) || a.model.localeCompare(b.model)),
    images: sortImages(product_images),
    group: group ? { id: group.id, name: group.name, images: sortImages(group.product_images) } : null,
    kit: mapKitParts({ kit_components }),
  };
}

export function mapOptions(types: GroupRow["product_option_types"]): ProductOption[] {
  return [...types]
    .sort((a, b) => a.position - b.position)
    .map((t) => ({
      id: t.id,
      name: t.name,
      position: t.position,
      values: [...t.product_option_values].sort((a, b) => a.position - b.position).map((v) => ({ ...v, price_delta: Number(v.price_delta) })),
    }));
}

/** A group with its variants in option order (the order of each option's values). */
export function mapGroup({ product_option_types, product_images, base_uom, ...group }: GroupRow, variants: InventoryListItem[]): ProductGroupEntry {
  const options = mapOptions(product_option_types);
  const rank = new Map(options.flatMap((o) => o.values.map((v) => [v.id, v.position] as const)));
  const key = (item: InventoryListItem) => (Array.isArray(item.option_values) ? item.option_values : []).map((id) => rank.get(String(id)) ?? 99);
  const sorted = [...variants].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) if ((ka[i] ?? 0) !== (kb[i] ?? 0)) return (ka[i] ?? 0) - (kb[i] ?? 0);
    return a.sku.localeCompare(b.sku);
  });
  return {
    ...group,
    cost_price: Number(group.cost_price),
    selling_price: Number(group.selling_price),
    low_stock_threshold: Number(group.low_stock_threshold),
    options,
    images: sortImages(product_images),
    variants: sorted,
    base_uom,
    vehicles: sorted[0]?.vehicles ?? [],
  };
}

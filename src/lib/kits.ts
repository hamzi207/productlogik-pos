// RF-21.1 kits: a kit has no stock of its own; its stock is the number of whole kits its components make.
// Same rule as public.kit_available in SQL. Shared by server and client components.
import type { StoreStock } from "@/lib/stores";

/** One component of a kit, with the component's stock (as embedded on inventory rows). */
export type KitPart = {
  item_id: string;
  sku: string;
  name: string;
  /** In the component's base unit, per kit. */
  quantity: number;
  unit: string | null;
  quantity_on_hand: number;
  reserved_quantity: number;
  stock: StoreStock[];
};

/**
 * PostgREST embed for a kit's components and their stock (use on inventory_items selects). kit_components
 * has two foreign keys to inventory_items, so both sides are named.
 */
export const KIT_EMBED =
  "kit_components!kit_components_kit_fkey(quantity, position, component:inventory_items!kit_components_component_fkey(id, sku, name, quantity_on_hand, reserved_quantity, base_uom:units_of_measure!inventory_items_base_uom_fkey(code), stock_levels(store_id, on_hand, reserved, low_stock_threshold)))";

export type KitEmbedRow = {
  kit_components?: {
    quantity: number;
    position: number;
    component: {
      id: string;
      sku: string;
      name: string;
      quantity_on_hand: number;
      reserved_quantity: number;
      base_uom: { code: string } | null;
      stock_levels: { store_id: string; on_hand: number; reserved: number; low_stock_threshold: number | null }[];
    } | null;
  }[];
};

/** The embed as KitParts, in the kit's order (numbers from the embed can arrive as strings). */
export function mapKitParts(row: KitEmbedRow): KitPart[] {
  return [...(row.kit_components ?? [])]
    .sort((a, b) => a.position - b.position)
    .flatMap((k) =>
      k.component
        ? [{
            item_id: k.component.id,
            sku: k.component.sku,
            name: k.component.name,
            quantity: Number(k.quantity),
            unit: k.component.base_uom?.code ?? null,
            quantity_on_hand: Number(k.component.quantity_on_hand),
            reserved_quantity: Number(k.component.reserved_quantity),
            stock: k.component.stock_levels.map((l) => ({
              store_id: l.store_id,
              on_hand: Number(l.on_hand),
              reserved: Number(l.reserved),
              low_stock_threshold: l.low_stock_threshold === null ? null : Number(l.low_stock_threshold),
            })),
          }]
        : [],
    );
}

/** Free stock of one component: at a store, or (null) the organization's totals. Plus `extra` it may use. */
function freeOf(part: KitPart, storeId: string | null) {
  if (storeId === null) return part.quantity_on_hand - part.reserved_quantity;
  const level = part.stock.find((l) => l.store_id === storeId);
  return level ? level.on_hand - level.reserved : 0;
}

/**
 * Whole kits the components make at a store (null = organization totals). `heldKits` are kits a saved
 * document line already holds there (their components count as available to that line).
 */
export function kitAvailable(parts: KitPart[], storeId: string | null, heldKits = 0) {
  if (parts.length === 0) return 0;
  return Math.min(...parts.map((p) => Math.floor(Math.max(freeOf(p, storeId) + heldKits * p.quantity, 0) / p.quantity + 1e-9)));
}

/** Whole kits per store, for every store any component has stock in. */
export function kitStoreStock(parts: KitPart[], held?: { storeId: string; kits: number }) {
  const stores = new Set(parts.flatMap((p) => p.stock.map((l) => l.store_id)));
  if (held) stores.add(held.storeId);
  return Object.fromEntries([...stores].map((id) => [id, kitAvailable(parts, id, held?.storeId === id ? held.kits : 0)]));
}

/** "2 × Clip, 1.5 kg × Cable": what one kit holds, for documents and details. */
export function kitIncludes(parts: { name: string; quantity: number; unit: string | null }[]) {
  const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
  return parts.map((p) => `${qty(p.quantity)}${p.unit && p.unit.toLowerCase() !== "pcs" ? ` ${p.unit}` : ""} × ${p.name}`).join(", ");
}

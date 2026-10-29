import type { Tables } from "./database.types";
import type { KitPart } from "@/lib/kits";
import type { ProductImage } from "@/lib/product-images";
import type { StoreStock } from "@/lib/stores";
import type { BaseUnit, ItemConversion } from "@/lib/uom";

/** A vehicle an item is linked to (via item_vehicle_compatibility). */
export type FitmentVehicle = {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string | null;
};

/** One inventory row with its compatible vehicles and units, as the inventory page shows it. */
export type InventoryListItem = Tables<"inventory_items"> & {
  vehicles: FitmentVehicle[];
  /** The unit stock is counted in (Phase 19). */
  base_uom: BaseUnit | null;
  /** Packs / boxes / other units it can be bought or sold in. */
  conversions: ItemConversion[];
  /** Stock per store (Phase 20); quantity_on_hand / reserved_quantity are the totals. */
  stock: StoreStock[];
  /** RF-20.1: stores that sell it at their own price. */
  store_prices: { store_id: string; selling_price: number }[];
  /** RF-21.2: its own images (variants show their group's: `group.images`). */
  images: ProductImage[];
  /** Phase 21: the product group a variant belongs to. */
  group: { id: string; name: string; images: ProductImage[] } | null;
  /** RF-21.1: a kit's components with their stock (empty for other products). */
  kit: KitPart[];
};

/** One option of a product group (Size, Colour…) with its values in order. */
export type ProductOption = {
  id: string;
  name: string;
  position: number;
  values: { id: string; value: string; position: number; price_delta: number }[];
};

/** A product group (Phase 21) with its options, images and active variants. */
export type ProductGroupEntry = Tables<"product_groups"> & {
  options: ProductOption[];
  images: ProductImage[];
  /** Variants that are switched on, in option order. */
  variants: InventoryListItem[];
  base_uom: BaseUnit | null;
  /** The group's fitment (every variant has the same). */
  vehicles: FitmentVehicle[];
};

/** One row of the inventory list: a product or kit, or a product group with its variants. */
export type InventoryEntry = { kind: "item"; item: InventoryListItem } | { kind: "group"; group: ProductGroupEntry };

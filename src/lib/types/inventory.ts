import type { Tables } from "./database.types";
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
};

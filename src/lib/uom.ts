// Units of measure (Phase 19). Stock is always counted in a product's base unit; a conversion says how
// many base units one pack / box / carton holds. Shared by server and client components.

/** One of the organization's units (units_of_measure). `decimals` = how many decimal places a quantity may have. */
export type Unit = {
  id: string;
  code: string;
  name: string;
  decimals: number;
  is_archived: boolean;
  /** Can be a product's pack (box, carton…), when the organization has packs switched on. */
  is_pack: boolean;
  sort_order: number;
};

export const UNIT_COLUMNS = "id, code, name, decimals, is_archived, is_pack, sort_order";

/** A platform unit preset (uom_presets): Settings → Units → Add unit offers the ones the organization doesn't have. */
export type UnitPreset = { code: string; name: string; decimals: number; is_pack: boolean };

export const UNIT_PRESET_COLUMNS = "code, name, decimals, is_pack";

/** A product's base unit, as embedded on inventory rows. */
export type BaseUnit = { id: string; code: string; decimals: number };

/** One unit conversion of a product: 1 <unit> = factor base units, with an optional own price and barcode. */
export type ItemConversion = {
  uom_id: string;
  factor: number;
  selling_price: number | null;
  barcode: string | null;
  sort_order: number;
  unit: { code: string; decimals: number } | null;
};

/** PostgREST embed for a product's base unit and conversions (use on inventory_items selects). */
export const ITEM_UNITS_EMBED =
  "base_uom:units_of_measure!inventory_items_base_uom_fkey(id, code, decimals), item_uom_conversions(uom_id, factor, selling_price, barcode, sort_order, unit:units_of_measure(code, decimals))";

/** One way a product can go on a document: its base unit (factor 1) or one of its conversions. */
export type UnitOption = {
  id: string;
  code: string;
  /** Base units in one of this unit. */
  factor: number;
  /** Selling price for one of this unit: the conversion's own price, else base price × factor. */
  price: number;
  decimals: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The units a product can be sold in, base unit first (same pricing rule as save_quote).
 * With packs switched off only the base unit is offered; `keep` is a unit a saved line already uses.
 */
export function unitOptions(
  item: {
    selling_price: number;
    base_uom: BaseUnit | null;
    item_uom_conversions?: ItemConversion[] | null;
  },
  packsEnabled = true,
  keep?: string | null,
): UnitOption[] {
  const price = Number(item.selling_price);
  const base: UnitOption[] = item.base_uom
    ? [{ id: item.base_uom.id, code: item.base_uom.code, factor: 1, price, decimals: item.base_uom.decimals }]
    : [];
  const conversions = [...(item.item_uom_conversions ?? [])]
    .filter((c) => packsEnabled || c.uom_id === keep)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      id: c.uom_id,
      code: c.unit?.code ?? "unit",
      factor: Number(c.factor),
      price: c.selling_price === null ? round2(price * Number(c.factor)) : Number(c.selling_price),
      decimals: c.unit?.decimals ?? 0,
    }));
  return [...base, ...conversions];
}

const quantityFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** 1.250 → "1.25", 1200 → "1,200". */
export function formatNumber(qty: number) {
  return Number.isFinite(qty) ? quantityFormat.format(qty) : "—";
}

/** "1.25 kg", "12 pcs"; just the number when there's no unit (custom lines). */
export function formatQty(qty: number, unit?: string | null) {
  return unit ? `${formatNumber(qty)} ${unit}` : formatNumber(qty);
}

/** Input step for a unit's decimals: 0 → "1", 2 → "0.01". */
export function stepFor(decimals: number) {
  return decimals > 0 ? (1 / 10 ** decimals).toFixed(decimals) : "1";
}

/** True when `n` has no more than `decimals` decimal places. */
export function fitsDecimals(n: number, decimals: number) {
  const scaled = n * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** "pcs are counted in whole numbers" / "kg allows up to 3 decimal places". */
export function decimalsRule(code: string, decimals: number) {
  return decimals === 0 ? `${code} is counted in whole numbers.` : `${code} allows up to ${decimals} decimal place${decimals === 1 ? "" : "s"}.`;
}

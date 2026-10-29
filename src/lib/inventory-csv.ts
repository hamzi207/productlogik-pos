// Inventory CSV (Phase 15): the columns, reading a file into rows, and the Vehicles cell format.
// Shared by the import dialog (browser) and src/lib/actions/inventory-csv.ts (server).
// Phase 18: custom attributes are extra "attr:<key>" columns, and the Universal / Vehicles columns
// only count for organizations with the Vehicle Fitment module.
// Phase 19: Unit (the base unit's code), Other Units ("box=12; carton=144@15000") and the purchase / sale units.
// Phase 21: Barcode; Group + Option N Name / Value make rows the variants of a product group (one row per
// variant, the group's details from its first row); Kit Components ("CLIP-01=2; CABLE-3=1") make a kit.
import { parseCsv } from "@/lib/csv";

export const CSV_COLUMNS = [
  { key: "sku", label: "SKU", aliases: ["partcode", "code", "partno", "partnumber"] },
  { key: "name", label: "Name", aliases: ["productname", "product", "itemname"] },
  { key: "category", label: "Category", aliases: ["categorypath"] },
  { key: "costPrice", label: "Cost Price", aliases: ["cost"] },
  { key: "sellingPrice", label: "Sale Price", aliases: ["sellingprice", "price", "saleprice"] },
  { key: "stock", label: "Stock", aliases: ["quantity", "qty", "stockonhand", "onhand"] },
  { key: "universal", label: "Universal", aliases: ["universalfit"] },
  { key: "vehicles", label: "Vehicles", aliases: ["fitment", "compatiblevehicles"] },
  { key: "vendor", label: "Vendor", aliases: ["vendorname", "supplier"] },
  { key: "lowStock", label: "Low Stock Alert", aliases: ["lowstock", "lowstockthreshold", "reorderlevel"] },
  { key: "priceIncludesTax", label: "Price Includes Tax", aliases: ["includestax", "inctax"] },
  { key: "description", label: "Description", aliases: ["notes"] },
  { key: "unit", label: "Unit", aliases: ["uom", "baseunit", "unitofmeasure"] },
  { key: "conversions", label: "Other Units", aliases: ["units", "packs", "packunits", "conversions"] },
  { key: "purchaseUnit", label: "Purchase Unit", aliases: ["buyunit", "purchaseuom"] },
  { key: "saleUnit", label: "Sale Unit", aliases: ["sellunit", "saleuom", "sellingunit"] },
  { key: "barcode", label: "Barcode", aliases: ["ean", "upc", "gtin"] },
  { key: "kit", label: "Kit Components", aliases: ["kit", "kititems", "components", "bundle"] },
  { key: "group", label: "Group", aliases: ["productgroup", "parent", "variantof"] },
  { key: "option1Name", label: "Option 1 Name", aliases: ["option1"] },
  { key: "option1Value", label: "Option 1 Value", aliases: [] },
  { key: "option2Name", label: "Option 2 Name", aliases: ["option2"] },
  { key: "option2Value", label: "Option 2 Value", aliases: [] },
  { key: "option3Name", label: "Option 3 Name", aliases: ["option3"] },
  { key: "option3Value", label: "Option 3 Value", aliases: [] },
] as const;

export type CsvColumnKey = (typeof CSV_COLUMNS)[number]["key"];

/** Columns that need the Vehicle Fitment module (left out of the template and export without it, ignored on import). */
export const FITMENT_COLUMNS: readonly CsvColumnKey[] = ["universal", "vehicles"];

/** Header prefix of an attribute column: "attr:colour". */
export const ATTR_COLUMN = "attr:";

/** The columns an organization's template and export use. */
export const csvColumns = (fitment: boolean) => CSV_COLUMNS.filter((c) => fitment || !FITMENT_COLUMNS.includes(c.key));
export const CSV_COLUMN_LABEL = Object.fromEntries(CSV_COLUMNS.map((c) => [c.key, c.label])) as Record<CsvColumnKey, string>;

/** One data line of the file. A key is missing when the file has no such column. */
export type CsvItemRow = {
  line: number;
  cells: Partial<Record<CsvColumnKey, string>>;
  /** attr:<key> cells, keyed by attribute key. */
  attributes?: Record<string, string>;
};

export const MAX_IMPORT_ROWS = 1000;
/** Rows saved per server call, so the dialog can show progress. */
export const IMPORT_BATCH = 100;
/** A product group's rows go in one call, so a call can be as large as the largest group. */
export const MAX_GROUP_ROWS = 300;

/** The Group cell, for matching rows of one product group (any capitals); null when it's not a variant. */
export const groupKey = (row: CsvItemRow) => row.cells.group?.trim().toLowerCase() || null;

/**
 * The rows in import calls of about IMPORT_BATCH rows. A product group's rows are kept together (where its
 * first row is), so the group is saved in one go.
 */
export function importBatches(rows: CsvItemRow[]): CsvItemRow[][] {
  const units: CsvItemRow[][] = [];
  const byGroup = new Map<string, CsvItemRow[]>();
  for (const row of rows) {
    const key = groupKey(row);
    if (!key) units.push([row]);
    else if (byGroup.has(key)) byGroup.get(key)!.push(row);
    else {
      const unit = [row];
      byGroup.set(key, unit);
      units.push(unit);
    }
  }
  const batches: CsvItemRow[][] = [];
  let current: CsvItemRow[] = [];
  for (const unit of units) {
    if (current.length && current.length + unit.length > IMPORT_BATCH) {
      batches.push(current);
      current = [];
    }
    current.push(...unit);
  }
  if (current.length) batches.push(current);
  return batches;
}

/** "CLIP-01=2; CABLE-3=1.5" → SKU and quantity per kit. Returns the entries it couldn't read too. */
export function parseKitCell(v: string | undefined): { parts: { sku: string; quantity: number; text: string }[]; invalid: string[] } {
  const parts: { sku: string; quantity: number; text: string }[] = [];
  const invalid: string[] = [];
  for (const part of (v ?? "").split(/[;\n|]+/)) {
    const text = part.trim();
    if (!text) continue;
    const m = /^([^=×]+?)\s*(?:[=×]\s*([\d.,]+))?$/.exec(text);
    const quantity = m?.[2] !== undefined ? parseNumberCell(m[2]) : 1;
    if (!m || quantity === null || Number.isNaN(quantity) || quantity <= 0) {
      invalid.push(text);
      continue;
    }
    parts.push({ sku: m[1].trim().toUpperCase(), quantity, text });
  }
  return { parts, invalid };
}

/** Kit components → "CLIP-01=2; CABLE-3=1.5". */
export const formatKitCell = (parts: { sku: string; quantity: number }[]) => parts.map((p) => `${p.sku}=${p.quantity}`).join("; ");

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Reads the file's text: matches headers by name (any order, common synonyms), then the rows. */
export function readInventoryCsv(text: string): { rows: CsvItemRow[]; columns: CsvColumnKey[]; error?: string } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], columns: [], error: "The file is empty." };
  const [header, ...data] = table;
  const map = new Map<number, CsvColumnKey>();
  const attrMap = new Map<number, string>();
  header.forEach((h, i) => {
    const raw = h.trim().toLowerCase();
    if (raw.startsWith(ATTR_COLUMN)) {
      const key = raw.slice(ATTR_COLUMN.length).trim();
      if (key && ![...attrMap.values()].includes(key)) attrMap.set(i, key);
      return;
    }
    const n = normalizeHeader(h);
    const col = CSV_COLUMNS.find((c) => normalizeHeader(c.label) === n || (c.aliases as readonly string[]).includes(n));
    if (col && ![...map.values()].includes(col.key)) map.set(i, col.key);
  });
  const columns = [...map.values()];
  const missing = (["sku", "name", "category", "sellingPrice"] as const).filter((k) => !columns.includes(k));
  if (missing.length) {
    return {
      rows: [],
      columns,
      error: `The first row must name the columns. Missing: ${missing.map((k) => CSV_COLUMN_LABEL[k]).join(", ")}. Download the template to see the layout.`,
    };
  }
  if (data.length === 0) return { rows: [], columns, error: "The file has a header row but no items." };
  if (data.length > MAX_IMPORT_ROWS) {
    return { rows: [], columns, error: `The file has ${data.length} items. Import up to ${MAX_IMPORT_ROWS} at a time (split the file).` };
  }
  const rows = data.map((r, i) => {
    const cells: Partial<Record<CsvColumnKey, string>> = {};
    for (const [index, key] of map) cells[key] = (r[index] ?? "").trim();
    const attributes: Record<string, string> = {};
    for (const [index, key] of attrMap) attributes[key] = (r[index] ?? "").trim();
    // Line numbers as a spreadsheet shows them: the header is line 1.
    return { line: i + 2, cells, ...(attrMap.size ? { attributes } : {}) };
  });
  return { rows, columns };
}

/** "Rs. 1,250.50" → 1250.5; blank → null; not a number → NaN. */
export function parseNumberCell(v: string | undefined): number | null {
  const s = (v ?? "").replace(/rs\.?|pkr|,|\s/gi, "");
  if (s === "") return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Yes / No / true / false / 1 / 0 / Y / N; blank → null; anything else → undefined (an error). */
export function parseYesNo(v: string | undefined): boolean | null | undefined {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "") return null;
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return undefined;
}

export type VehicleSpec = { label: string; from: number; to: number; text: string };

/**
 * "2018-2022 SUZUKI Alto; 2020 Honda Civic" → specs. Each entry is a year or year range, then the
 * make and model exactly as in the vehicle list (any capitals). Returns the entries it couldn't read too.
 */
export function parseVehiclesCell(v: string | undefined): { specs: VehicleSpec[]; invalid: string[] } {
  const specs: VehicleSpec[] = [];
  const invalid: string[] = [];
  for (const part of (v ?? "").split(/[;\n|]+/)) {
    const text = part.trim();
    if (!text) continue;
    const m = /^(\d{4})(?:\s*[-–]\s*(\d{4}))?\s+(.+)$/.exec(text);
    const from = m ? Number(m[1]) : NaN;
    const to = m ? Number(m[2] ?? m[1]) : NaN;
    if (!m || from < 1960 || to > 2100 || to < from || to - from > 70) {
      invalid.push(text);
      continue;
    }
    specs.push({ label: m[3].replace(/\s+/g, " ").toLowerCase(), from, to, text });
  }
  return { specs, invalid };
}

/** Linked vehicles → "2018-2022 SUZUKI Alto; 2015 SUZUKI Alto" (consecutive years become ranges). */
export function formatVehiclesCell(vehicles: { year: number; make: string; model: string }[]) {
  const groups = new Map<string, number[]>();
  for (const v of vehicles) {
    const key = `${v.make} ${v.model}`;
    groups.set(key, [...(groups.get(key) ?? []), v.year]);
  }
  const parts: string[] = [];
  for (const [name, years] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...new Set(years)].sort((a, b) => a - b);
    let start = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) {
        const end = sorted[i - 1];
        parts.push(`${start === end ? start : `${start}-${end}`} ${name}`);
        start = sorted[i];
      }
    }
  }
  return parts.join("; ");
}

export type UnitsSpec = { code: string; factor: number; price: number | null; text: string };

/** "box=12; carton=144@15000" → one entry per unit (price after @ is optional). Returns the entries it couldn't read too. */
export function parseUnitsCell(v: string | undefined): { specs: UnitsSpec[]; invalid: string[] } {
  const specs: UnitsSpec[] = [];
  const invalid: string[] = [];
  for (const part of (v ?? "").split(/[;\n|]+/)) {
    const text = part.trim();
    if (!text) continue;
    const m = /^([^=@]+?)\s*=\s*([\d.,]+)\s*(?:@\s*(.+))?$/.exec(text);
    const factor = m ? parseNumberCell(m[2]) : NaN;
    const price = m?.[3] !== undefined ? parseNumberCell(m[3]) : null;
    if (!m || factor === null || Number.isNaN(factor) || factor <= 0 || (price !== null && (Number.isNaN(price) || price < 0))) {
      invalid.push(text);
      continue;
    }
    specs.push({ code: m[1].trim().toLowerCase(), factor, price, text });
  }
  return { specs, invalid };
}

/** Conversions → "box=12; carton=144@15000" (the price only when the unit has its own). */
export function formatUnitsCell(conversions: { code: string; factor: number; price: number | null }[]) {
  return conversions.map((c) => `${c.code}=${c.factor}${c.price === null ? "" : `@${c.price}`}`).join("; ");
}

/** "Exterior > Wrapping / PPF" → "exterior › wrapping › ppf", for matching category paths. */
export const normalizeCategoryPath = (path: string) =>
  path
    .split(/\s*(?:›|>|\/|\\)\s*/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .join(" › ");

/** Phase 21 columns at the end of each example row: Barcode, Kit Components, Group, Option 1–3 Name / Value. */
const PHASE21_BLANKS = ["", "", "", "", "", "", "", "", ""];

/** The fitment template's header and example rows (V1, plus Phase 21 variants and a kit). */
const FITMENT_TEMPLATE: string[][] = [
  CSV_COLUMNS.map((c) => c.label),
  ["PPF-CLR-001", "Clear PPF roll (1.5m x 15m)", "Exterior › Wrapping › PPF", "38000", "52000", "4", "Yes", "", "Lahore Wraps", "2", "Yes", "Self-healing clear film", "pcs", "", "", "", ...PHASE21_BLANKS],
  ["MAT-ALT-018", "Floor mats (Alto 2019+)", "Interior › Floor Mats", "2500", "4200", "12", "No", "2019-2026 SUZUKI Alto", "", "5", "", "", "set", "", "", "", ...PHASE21_BLANKS],
  ["TINT-20", "Tint film 20%", "Exterior › Wrapping › PPF", "1800", "3000", "10", "Yes", "", "", "3", "Yes", "", "pcs", "", "", "", "", "", "Tint film", "Shade", "20%", "", "", "", ""],
  ["TINT-35", "Tint film 35%", "Exterior › Wrapping › PPF", "1800", "3000", "8", "Yes", "", "", "3", "Yes", "", "pcs", "", "", "", "", "", "Tint film", "Shade", "35%", "", "", "", ""],
  ["KIT-ALT-MATS", "Alto mats + clear PPF kit", "Interior › Floor Mats", "", "55000", "", "Yes", "", "", "", "Yes", "Bundle sold as one line", "pcs", "", "", "", "", "MAT-ALT-018=1; PPF-CLR-001=1", "", "", "", "", "", "", ""],
];

/**
 * The import template: the organization's columns, one attr:<key> column per attribute, and example
 * rows (the automotive ones with the fitment module; one row using the organization's first category otherwise).
 */
export function templateRows(fitment: boolean, attributeKeys: string[], exampleCategory: string): string[][] {
  const attrHeader = attributeKeys.map((k) => ATTR_COLUMN + k);
  const blanks = attributeKeys.map(() => "");
  if (fitment) return [[...FITMENT_TEMPLATE[0], ...attrHeader], ...FITMENT_TEMPLATE.slice(1).map((r) => [...r, ...blanks])];
  const category = exampleCategory || "Main category › Subcategory";
  return [
    [...csvColumns(false).map((c) => c.label), ...attrHeader],
    ["ITM-001", "Example product", category, "100", "150", "120", "Your supplier", "24", "Yes", "Notes for your team", "pcs", "box=12@1700", "box", "pcs", "8901234567890", "", "", "", "", "", "", "", "", ...blanks],
    ["POLO-RED-M", "Polo Shirt – Red / M", category, "600", "1200", "10", "", "3", "Yes", "", "pcs", "", "", "", "", "", "Polo Shirt", "Colour", "Red", "Size", "M", "", "", ...blanks],
    ["POLO-RED-L", "Polo Shirt – Red / L", category, "600", "1300", "6", "", "3", "Yes", "", "pcs", "", "", "", "", "", "Polo Shirt", "Colour", "Red", "Size", "L", "", "", ...blanks],
    ["KIT-STARTER", "Starter kit", category, "", "1500", "", "", "", "Yes", "Bundle sold as one line", "pcs", "", "", "", "", "ITM-001=2; POLO-RED-M=1", "", "", "", "", "", "", "", ...blanks],
  ];
}

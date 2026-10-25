// Inventory CSV (Phase 15): the columns, reading a file into rows, and the Vehicles cell format.
// Shared by the import dialog (browser) and src/lib/actions/inventory-csv.ts (server).
// Phase 18: custom attributes are extra "attr:<key>" columns, and the Universal / Vehicles columns
// only count for organizations with the Vehicle Fitment module.
// Phase 19: Unit (the base unit's code), Other Units ("box=12; carton=144@15000") and the purchase / sale units.
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

/** The fitment template's header and two example rows (V1). */
const FITMENT_TEMPLATE: string[][] = [
  CSV_COLUMNS.map((c) => c.label),
  ["PPF-CLR-001", "Clear PPF roll (1.5m x 15m)", "Exterior › Wrapping › PPF", "38000", "52000", "4", "Yes", "", "Lahore Wraps", "2", "Yes", "Self-healing clear film", "pcs", "", "", ""],
  ["MAT-ALT-018", "Floor mats (Alto 2019+)", "Interior › Floor Mats", "2500", "4200", "12", "No", "2019-2026 SUZUKI Alto", "", "5", "", "", "set", "", "", ""],
];

/**
 * The import template: the organization's columns, one attr:<key> column per attribute, and example
 * rows (the automotive ones with the fitment module; one row using the organization's first category otherwise).
 */
export function templateRows(fitment: boolean, attributeKeys: string[], exampleCategory: string): string[][] {
  const attrHeader = attributeKeys.map((k) => ATTR_COLUMN + k);
  const blanks = attributeKeys.map(() => "");
  if (fitment) return [[...FITMENT_TEMPLATE[0], ...attrHeader], ...FITMENT_TEMPLATE.slice(1).map((r) => [...r, ...blanks])];
  return [
    [...csvColumns(false).map((c) => c.label), ...attrHeader],
    ["ITM-001", "Example product", exampleCategory || "Main category › Subcategory", "100", "150", "120", "Your supplier", "24", "Yes", "Notes for your team", "pcs", "box=12@1700", "box", "pcs", ...blanks],
  ];
}

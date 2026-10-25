"use server";

import { refresh } from "next/cache";
import { applicableAttributes, asValues, type Attribute, type AttrValues } from "@/lib/attributes";
import { getShopSession } from "@/lib/auth";
import { buildCategoryIndex, fullPath } from "@/lib/categories";
import { getAttributes, getCategories } from "@/lib/category-data";
import {
  ATTR_COLUMN,
  CSV_COLUMN_LABEL,
  csvColumns,
  formatVehiclesCell,
  IMPORT_BATCH,
  MAX_IMPORT_ROWS,
  normalizeCategoryPath,
  formatUnitsCell,
  parseNumberCell,
  parseUnitsCell,
  parseVehiclesCell,
  parseYesNo,
  templateRows,
  type CsvColumnKey,
  type CsvItemRow,
} from "@/lib/inventory-csv";
import { hasModule } from "@/lib/module-data";
import { getUnits } from "@/lib/uom-data";
import { createClient } from "@/lib/supabase/server";
import { planLimitMessage } from "@/lib/plan-limits";
import { getStoreContext } from "@/lib/store";
import type { Json } from "@/lib/types/database.types";
import { inventoryItemSchema, type InventoryItemInput } from "@/lib/validations/inventory.schema";

// Inventory CSV import / export (Phase 15). Every query runs with the caller's session (RLS: their
// own shop); rows are saved one by one through save_inventory_item, the same function as the
// part dialog, so the same rules apply (SKU unique per shop, stock can't go below reservations).
// Phase 18: import never creates categories (an unknown one is a row error), attr:<key> columns carry
// custom attribute values, and without the Vehicle Fitment module the Universal / Vehicles columns are
// ignored (the database keeps any stored fitment).

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CsvRowCheck = {
  line: number;
  sku: string;
  name: string;
  /** new = will be added · update = replaces the item with this SKU · error = skipped. */
  action: "new" | "update" | "error";
  errors: { column: string; message: string }[];
};

export type CsvImportResult = { line: number; sku: string; status: "created" | "updated" | "error"; message?: string };

type Existing = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  vendor_name: string | null;
  category_id: string;
  cost_price: number;
  selling_price: number;
  quantity_on_hand: number;
  low_stock_threshold: number;
  is_universal: boolean;
  price_includes_tax: boolean;
  attributes: Json;
  base_uom_id: string;
  purchase_uom_id: string | null;
  sale_uom_id: string | null;
  item_uom_conversions: { uom_id: string; factor: number; selling_price: number | null; barcode: string | null; sort_order: number }[];
  item_vehicle_compatibility: { vehicle_id: number }[];
  stock_levels: { store_id: string; on_hand: number }[];
};

/**
 * Phase 20: the Stock column is the current store's stock (the organization total with one store);
 * imports set it there and leave other stores as they are.
 */
async function csvStore(): Promise<string | null> {
  const ctx = await getStoreContext();
  return ctx.multi ? ctx.current.id : null;
}

const stockOf = (row: Pick<Existing, "quantity_on_hand" | "stock_levels">, storeId: string | null) =>
  storeId ? Number(row.stock_levels.find((l) => l.store_id === storeId)?.on_hand ?? 0) : Number(row.quantity_on_hand);

const ITEM_COLUMNS =
  "id, sku, name, description, vendor_name, category_id, cost_price, selling_price, quantity_on_hand, low_stock_threshold, is_universal, price_includes_tax, attributes, base_uom_id, purchase_uom_id, sale_uom_id, item_uom_conversions(uom_id, factor, selling_price, barcode, sort_order), stock_levels(store_id, on_hand)";

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** Items already in the shop with these SKUs (upper-cased). */
async function existingBySku(supabase: Supabase, skus: string[]) {
  const map = new Map<string, Existing>();
  for (const part of chunks([...new Set(skus)].filter(Boolean), 200)) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select(`${ITEM_COLUMNS}, item_vehicle_compatibility(vehicle_id)`)
      .in("sku", part);
    if (error) throw new Error("Could not check existing SKUs.");
    for (const item of data as Existing[]) map.set(item.sku, item);
  }
  return map;
}

/** Vehicles cell entries → vehicle ids (match_vehicles), keyed by the entry's normalised text. */
async function resolveVehicles(supabase: Supabase, cells: (string | undefined)[]) {
  const unique = new Map<string, { label: string; from: number; to: number }>();
  for (const cell of cells) for (const s of parseVehiclesCell(cell).specs) unique.set(`${s.from}-${s.to} ${s.label}`, s);
  const keys = [...unique.keys()];
  const ids = new Map<string, number[]>(keys.map((k) => [k, []]));
  for (const part of chunks(keys, 2000)) {
    const { data, error } = await supabase.rpc("match_vehicles", { p_specs: part.map((k) => unique.get(k)!) });
    if (error) throw new Error("Could not look up the vehicles.");
    for (const m of data) ids.get(part[m.spec_index])!.push(m.vehicle_id);
  }
  return ids;
}

type Prepared = { check: CsvRowCheck; input?: InventoryItemInput; existingId?: string };

/** "Red" for a list attribute is matched to its option ignoring capitals; returns the value to store or an error. */
function attributeCell(a: Attribute, raw: string): { value: AttrValues[string] } | { error: string } {
  switch (a.type) {
    case "number": {
      const n = parseNumberCell(raw);
      return n === null || Number.isNaN(n) ? { error: `"${raw}" isn't a number.` } : { value: n };
    }
    case "boolean": {
      const b = parseYesNo(raw);
      return b === undefined || b === null ? { error: `Use Yes or No (not "${raw}").` } : { value: b };
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? { value: raw } : { error: `Write the date as YYYY-MM-DD (not "${raw}").` };
    case "select": {
      const option = a.options.find((o) => o.toLowerCase() === raw.toLowerCase());
      return option ? { value: option } : { error: `"${raw}" isn't one of: ${a.options.join(", ")}.` };
    }
    default:
      return raw.length > 200 ? { error: "Use 200 characters or fewer." } : { value: raw };
  }
}

/** Validates every row against the shop (categories, SKUs, vehicles, attributes) and builds what would be saved. */
async function prepare(rows: CsvItemRow[], updateExisting: boolean): Promise<Prepared[]> {
  const supabase = await createClient();
  const [{ tenant }, categories, attributes, fitment, units, storeId] = await Promise.all([
    getShopSession(),
    getCategories(),
    getAttributes(),
    hasModule("vehicle_fitment"),
    getUnits(),
    csvStore(),
  ]);
  const index = buildCategoryIndex(categories);
  const unitByCode = new Map(units.map((u) => [u.code.toLowerCase(), u]));
  const unitCodes = units.filter((u) => !u.is_archived).map((u) => u.code).join(", ");
  const defaultUnit = unitByCode.get("pcs") ?? units.find((u) => !u.is_archived);
  const byPath = new Map(index.flat.map((n) => [normalizeCategoryPath(fullPath(n)), n.id]));
  // A category's own name works too when only one category has it ("PPF").
  const byName = new Map<string, string | null>();
  for (const n of index.flat) {
    const k = n.name.trim().toLowerCase();
    byName.set(k, byName.has(k) ? null : n.id);
  }
  const skuOf = (r: CsvItemRow) => (r.cells.sku ?? "").trim().toUpperCase();
  const [existing, vehicleIds] = await Promise.all([
    existingBySku(supabase, rows.map(skuOf)),
    resolveVehicles(supabase, fitment ? rows.map((r) => r.cells.vehicles) : []),
  ]);

  const seen = new Map<string, number>();
  return rows.map((row) => {
    const c = row.cells;
    const sku = skuOf(row);
    const errors: CsvRowCheck["errors"] = [];
    const err = (column: CsvColumnKey | "row", message: string) =>
      errors.push({ column: column === "row" ? "" : CSV_COLUMN_LABEL[column], message });
    const attrErr = (key: string, message: string) => errors.push({ column: ATTR_COLUMN + key, message });
    const has = (k: CsvColumnKey) => c[k] !== undefined && c[k] !== "";
    const current = sku ? existing.get(sku) : undefined;
    const update = Boolean(current && updateExisting);

    if (sku && seen.has(sku)) err("sku", `SKU ${sku} is already on line ${seen.get(sku)} of this file.`);
    else if (sku) seen.set(sku, row.line);
    if (current && !updateExisting) err("sku", `SKU ${sku} is already in your inventory. Tick "Update items with the same SKU" to change it.`);

    // Category
    let categoryId = current && update && !has("category") ? current.category_id : "";
    if (has("category")) {
      const path = normalizeCategoryPath(c.category!);
      categoryId = byPath.get(path) ?? byName.get(path) ?? "";
      const node = categoryId ? index.byId.get(categoryId) : undefined;
      if (!categoryId) {
        err("category", `"${c.category}" isn't in your categories. Use the full path, or request it from Settings → Categories.`);
      } else if (node?.archived && categoryId !== current?.category_id) {
        err("category", `"${fullPath(node)}" is archived. Choose another category.`);
      }
    } else if (!update) err("category", "Enter a category.");

    // Numbers: blank keeps the current value on updates; new items get the defaults.
    const num = (k: CsvColumnKey, fallback: number, required = false) => {
      const v = parseNumberCell(c[k]);
      if (v === null) {
        if (required && !update) err(k, `Enter a ${CSV_COLUMN_LABEL[k].toLowerCase()}.`);
        return fallback;
      }
      if (Number.isNaN(v)) {
        err(k, `"${c[k]}" isn't a number.`);
        return fallback;
      }
      return v;
    };
    const costPrice = num("costPrice", current && update ? Number(current.cost_price) : 0);
    const sellingPrice = num("sellingPrice", current && update ? Number(current.selling_price) : 0, true);
    const quantityOnHand = num("stock", current && update ? stockOf(current, storeId) : 0);
    const lowStockThreshold = num("lowStock", current && update ? current.low_stock_threshold : 5);

    const yesNo = (k: CsvColumnKey, fallback: boolean | null) => {
      const v = parseYesNo(c[k]);
      if (v === undefined) {
        err(k, `Use Yes or No (not "${c[k]}").`);
        return fallback;
      }
      return v ?? fallback;
    };
    const priceIncludesTax = yesNo("priceIncludesTax", current && update ? current.price_includes_tax : tenant.pricesIncludeTax) ?? tenant.pricesIncludeTax;

    // Fitment: Universal Yes, or the listed vehicles. Blank on an update keeps the current fitment.
    // Without the module the columns are ignored and the stored fitment is kept as it is.
    const currentVehicles = current ? current.item_vehicle_compatibility.map((v) => v.vehicle_id) : [];
    let isUniversal: boolean;
    let vehicles: number[];
    if (!fitment) {
      isUniversal = current && update ? current.is_universal : true;
      vehicles = isUniversal ? [] : currentVehicles;
    } else {
      const { specs, invalid } = parseVehiclesCell(c.vehicles);
      for (const text of invalid) err("vehicles", `Can't read "${text}". Write it as a year or years, then make and model: 2018-2022 SUZUKI Alto.`);
      const ids = new Set<number>();
      for (const s of specs) {
        const found = vehicleIds.get(`${s.from}-${s.to} ${s.label}`) ?? [];
        if (found.length === 0) err("vehicles", `No vehicle "${s.text}" in the vehicle list.`);
        for (const id of found) ids.add(id);
      }
      const listed = specs.length > 0 || invalid.length > 0;
      const universalCell = yesNo("universal", null);
      isUniversal = universalCell ?? (current && update && !listed ? current.is_universal : !listed);
      vehicles = [...ids];
      if (!listed && current && update && !isUniversal) vehicles = currentVehicles;
      if (isUniversal && listed) err("vehicles", "Universal products fit every vehicle: leave Vehicles empty, or set Universal to No.");
    }

    // Attributes: attr:<key> cells. Blank keeps the current value on updates; required ones for the
    // category must end up with a value.
    const values: AttrValues = current && update ? { ...asValues(current.attributes) } : {};
    for (const [key, raw] of Object.entries(row.attributes ?? {})) {
      const def = attributes.find((a) => a.key === key);
      if (!def) {
        attrErr(key, `There's no attribute "${key}". Check the column name against the template.`);
        continue;
      }
      if (raw === "") continue;
      if (def.is_archived) {
        attrErr(key, `${def.label} is archived and can't be set any more.`);
        continue;
      }
      const parsed = attributeCell(def, raw);
      if ("error" in parsed) attrErr(key, parsed.error);
      else values[key] = parsed.value;
    }
    if (categoryId) {
      for (const a of applicableAttributes(attributes, index, categoryId)) {
        if (a.is_required && values[a.key] === undefined && !errors.some((e) => e.column === ATTR_COLUMN + a.key)) {
          attrErr(a.key, `${a.label} is required for this category.`);
        }
      }
    }

    // Units (Phase 19): blank keeps the current ones on updates; new items start in pieces with no packs.
    const unitCell = (k: CsvColumnKey, raw: string, keep?: string) => {
      const u = unitByCode.get(raw.trim().toLowerCase());
      if (!u) err(k, `"${raw}" isn't one of your units (${unitCodes}). Add it in Settings → Units.`);
      else if (u.is_archived && u.id !== keep) err(k, `${u.code} is archived. Choose another unit.`);
      return u?.id;
    };
    const baseUomId = has("unit") ? (unitCell("unit", c.unit!, current?.base_uom_id) ?? "") : current && update ? current.base_uom_id : (defaultUnit?.id ?? "");
    const currentConversions = current ? [...current.item_uom_conversions].sort((a, b) => a.sort_order - b.sort_order) : [];
    let conversions = current && update
      ? currentConversions.map((cv) => ({ uomId: cv.uom_id, factor: Number(cv.factor), sellingPrice: cv.selling_price === null ? null : Number(cv.selling_price), barcode: cv.barcode ?? "" }))
      : [];
    if (has("conversions")) {
      const cleared = ["none", "-"].includes(c.conversions!.trim().toLowerCase());
      const { specs, invalid } = cleared ? { specs: [], invalid: [] } : parseUnitsCell(c.conversions);
      for (const t of invalid) err("conversions", `Can't read "${t}". Write each unit as code=how many base units, with an optional @price: box=12@1500.`);
      conversions = specs.flatMap((sp) => {
        const id = unitCell("conversions", sp.code, currentConversions.find((cv) => unitByCode.get(sp.code)?.id === cv.uom_id)?.uom_id);
        if (!id) return [];
        // A unit that stays keeps its barcode (barcodes aren't in the file).
        const barcode = currentConversions.find((cv) => cv.uom_id === id)?.barcode ?? "";
        return [{ uomId: id, factor: sp.factor, sellingPrice: sp.price, barcode }];
      });
    }
    const pickUnit = (k: "purchaseUnit" | "saleUnit", currentValue: string | null | undefined) => {
      if (!has(k)) return current && update ? (currentValue ?? null) : null;
      const id = unitCell(k, c[k]!, currentValue ?? undefined);
      return id && id !== baseUomId ? id : null;
    };
    const purchaseUomId = pickUnit("purchaseUnit", current?.purchase_uom_id);
    const saleUomId = pickUnit("saleUnit", current?.sale_uom_id);

    const text = (k: CsvColumnKey, existingValue: string | null | undefined) => (c[k] !== undefined && (c[k] !== "" || !update) ? c[k]! : (existingValue ?? ""));
    const candidate = {
      sku,
      name: text("name", current?.name),
      description: text("description", current?.description),
      vendorName: text("vendor", current?.vendor_name),
      categoryId,
      costPrice,
      sellingPrice,
      quantityOnHand,
      lowStockThreshold,
      priceIncludesTax,
      isUniversal,
      vehicleIds: isUniversal ? [] : vehicles,
      attributes: values,
      baseUomId,
      conversions,
      purchaseUomId,
      saleUomId,
    };

    let input: InventoryItemInput | undefined;
    if (errors.length === 0) {
      const parsed = inventoryItemSchema.safeParse(candidate);
      if (parsed.success) input = parsed.data;
      else {
        const column: Partial<Record<string, CsvColumnKey>> = {
          sku: "sku", name: "name", description: "description", vendorName: "vendor", categoryId: "category",
          costPrice: "costPrice", sellingPrice: "sellingPrice", quantityOnHand: "stock", lowStockThreshold: "lowStock", vehicleIds: "vehicles",
          baseUomId: "unit", conversions: "conversions", purchaseUomId: "purchaseUnit", saleUomId: "saleUnit",
        };
        for (const issue of parsed.error.issues) {
          const key = column[String(issue.path[0])];
          const message = key === "vehicles" ? "Vehicle-specific products need at least one vehicle in Vehicles (or set Universal to Yes)." : issue.message;
          if (key) err(key, message);
          else err("row", message);
        }
      }
    }

    return {
      check: { line: row.line, sku, name: candidate.name, action: errors.length ? "error" : update ? "update" : "new", errors },
      input,
      existingId: update ? current?.id : undefined,
    };
  });
}

/** Import dialog, step 2: what each row would do, with every problem found. Nothing is saved. */
export async function checkInventoryCsv(rows: CsvItemRow[], updateExisting: boolean): Promise<{ status: "success"; rows: CsvRowCheck[] } | { status: "error"; message: string }> {
  if (!Array.isArray(rows) || rows.length === 0) return { status: "error", message: "The file has no items." };
  if (rows.length > MAX_IMPORT_ROWS) return { status: "error", message: `Import up to ${MAX_IMPORT_ROWS} items at a time.` };
  try {
    return { status: "success", rows: (await prepare(rows, updateExisting)).map((p) => p.check) };
  } catch (e) {
    console.error("checkInventoryCsv failed:", e);
    return { status: "error", message: "We couldn't check the file. Please try again." };
  }
}

/** Step 3: saves one batch of rows (≤ 100); rows with problems are skipped and reported. */
export async function importInventoryCsv(rows: CsvItemRow[], updateExisting: boolean): Promise<{ status: "success"; results: CsvImportResult[] } | { status: "error"; message: string }> {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > IMPORT_BATCH) return { status: "error", message: "Send up to 100 items at a time." };
  let prepared: Prepared[];
  try {
    prepared = await prepare(rows, updateExisting);
  } catch (e) {
    console.error("importInventoryCsv failed:", e);
    return { status: "error", message: "We couldn't read these rows. Please try again." };
  }
  const supabase = await createClient();
  const storeId = await csvStore();
  const results: CsvImportResult[] = [];
  for (const p of prepared) {
    const { line, sku } = p.check;
    if (!p.input) {
      results.push({ line, sku, status: "error", message: p.check.errors.map((e) => e.message).join(" ") });
      continue;
    }
    const item = p.input;
    const { error } = await supabase.rpc("save_inventory_item", {
      p_item_id: p.existingId,
      p_store_id: storeId ?? undefined,
      p_sku: item.sku,
      p_name: item.name,
      p_description: item.description || undefined,
      p_category_id: item.categoryId,
      p_cost_price: item.costPrice,
      p_selling_price: item.sellingPrice,
      p_quantity_on_hand: item.quantityOnHand,
      p_low_stock_threshold: item.lowStockThreshold,
      p_is_universal: item.isUniversal,
      p_price_includes_tax: item.priceIncludesTax,
      p_vendor_name: item.vendorName || undefined,
      p_vehicle_ids: item.isUniversal ? [] : item.vehicleIds,
      p_attributes: item.attributes,
      p_base_uom_id: item.baseUomId,
      p_purchase_uom_id: item.purchaseUomId ?? undefined,
      p_sale_uom_id: item.saleUomId ?? undefined,
      p_conversions: item.conversions.map((cv) => ({ uom_id: cv.uomId, factor: cv.factor, selling_price: cv.sellingPrice, barcode: cv.barcode || null })),
    });
    if (error) {
      const limit = planLimitMessage(error);
      // Category, attribute and fitment checks in the database explain themselves.
      const explained =
        ["22023", "23502"].includes(error.code) ||
        (error.code === "23503" && error.message.includes("category")) ||
        (error.code === "23514" && (error.message.includes("unit") || error.message.includes("pack")));
      const message = limit
        ? limit
        : error.code === "23505"
          ? `SKU ${sku} is already used by another item.`
          : error.code === "23514" && error.message.includes("inventory_reserved_within_stock")
            ? "Stock can't go below what open quotations have reserved."
            : explained
              ? error.message
              : "This row couldn't be saved.";
      if (!limit && !explained && !["23505", "23514"].includes(error.code)) console.error("importInventoryCsv row failed:", error.message);
      results.push({ line, sku, status: "error", message });
    } else results.push({ line, sku, status: p.existingId ? "updated" : "created" });
  }
  if (results.some((r) => r.status !== "error")) refresh();
  return { status: "success", results };
}

/** Attribute keys that get an attr: column (template and export): every attribute that isn't archived. */
const columnAttributes = (attributes: Attribute[]) => attributes.filter((a) => !a.is_archived);

/** "Export Inventory (CSV)": every item in the shop (all pages), in the import template's columns. */
export async function exportInventoryCsv(): Promise<{ status: "success"; header: string[]; rows: (string | number)[][] } | { status: "error"; message: string }> {
  const supabase = await createClient();
  const [categories, attributeDefs, fitment, units, storeId] = await Promise.all([getCategories(), getAttributes(), hasModule("vehicle_fitment"), getUnits(), csvStore()]);
  const index = buildCategoryIndex(categories);
  const attrs = columnAttributes(attributeDefs);
  const codeOf = new Map(units.map((u) => [u.id, u.code]));
  type Row = Omit<Existing, "item_vehicle_compatibility"> & { item_vehicle_compatibility: { vehicles: { year: number; make: string; model: string } | null }[] };
  const all: Row[] = [];
  // PostgREST returns at most 1000 rows per request: page through everything.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select(`${ITEM_COLUMNS}, item_vehicle_compatibility(vehicles(year, make, model))`)
      .order("name")
      .order("id")
      .range(from, from + 999)
      .overrideTypes<Row[], { merge: false }>();
    if (error) {
      console.error("exportInventoryCsv failed:", error.message);
      return { status: "error", message: "We couldn't export the inventory. Please try again." };
    }
    all.push(...data);
    if (data.length < 1000) break;
  }
  const yes = (b: boolean) => (b ? "Yes" : "No");
  const columns = csvColumns(fitment);
  return {
    status: "success",
    header: [...columns.map((c) => c.label), ...attrs.map((a) => ATTR_COLUMN + a.key)],
    rows: all.map((i) => {
      const node = index.byId.get(i.category_id);
      const cell: Record<CsvColumnKey, string | number> = {
        sku: i.sku,
        name: i.name,
        category: node ? fullPath(node) : "",
        costPrice: Number(i.cost_price),
        sellingPrice: Number(i.selling_price),
        stock: stockOf(i, storeId),
        universal: yes(i.is_universal),
        vehicles: i.is_universal ? "" : formatVehiclesCell(i.item_vehicle_compatibility.flatMap((l) => (l.vehicles ? [l.vehicles] : []))),
        vendor: i.vendor_name ?? "",
        lowStock: Number(i.low_stock_threshold),
        priceIncludesTax: yes(i.price_includes_tax),
        description: i.description ?? "",
        unit: codeOf.get(i.base_uom_id) ?? "",
        conversions: formatUnitsCell(
          [...i.item_uom_conversions]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((cv) => ({ code: codeOf.get(cv.uom_id) ?? "", factor: Number(cv.factor), price: cv.selling_price === null ? null : Number(cv.selling_price) })),
        ),
        purchaseUnit: i.purchase_uom_id ? (codeOf.get(i.purchase_uom_id) ?? "") : "",
        saleUnit: i.sale_uom_id ? (codeOf.get(i.sale_uom_id) ?? "") : "",
      };
      const values = asValues(i.attributes);
      return [
        ...columns.map((c) => cell[c.key]),
        ...attrs.map((a) => {
          const v = values[a.key];
          return v === undefined ? "" : typeof v === "boolean" ? yes(v) : v;
        }),
      ];
    }),
  };
}

/** "Download template": the organization's columns (fitment ones only with the module) and its attr: columns. */
export async function inventoryCsvTemplate(): Promise<string[][]> {
  const [categories, attributeDefs, fitment] = await Promise.all([getCategories(), getAttributes(), hasModule("vehicle_fitment")]);
  const example = buildCategoryIndex(categories).flat.find((n) => !n.archived && n.depth > 1) ?? null;
  return templateRows(fitment, columnAttributes(attributeDefs).map((a) => a.key), example ? fullPath(example) : "");
}

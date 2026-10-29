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
  formatKitCell,
  formatVehiclesCell,
  groupKey,
  IMPORT_BATCH,
  MAX_GROUP_ROWS,
  MAX_IMPORT_ROWS,
  normalizeCategoryPath,
  formatUnitsCell,
  parseKitCell,
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
import type { ProductGroupEntry } from "@/lib/types/inventory";
import { inventoryItemSchema, type InventoryItemInput } from "@/lib/validations/inventory.schema";
import { comboKey, productGroupSchema, SKU_PATTERN, type ProductGroupInput, type VariantInput } from "@/lib/validations/product-group.schema";
import { getProductGroup, saveProductGroup } from "./product-groups";

// Inventory CSV import / export (Phase 15). Every query runs with the caller's session (RLS: their
// own shop); rows are saved one by one through save_inventory_item, the same function as the
// part dialog, so the same rules apply (SKU unique per shop, stock can't go below reservations).
// Phase 18: import never creates categories (an unknown one is a row error), attr:<key> columns carry
// custom attribute values, and without the Vehicle Fitment module the Universal / Vehicles columns are
// ignored (the database keeps any stored fitment).
// Phase 21: Barcode and Kit Components columns; rows with a Group are the variants of that product group
// and are saved together through save_product_group (the group's details come from its first row;
// variants already in the group that the file doesn't list are kept as they are).

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
  barcode: string | null;
  is_kit: boolean;
  is_archived: boolean;
  group_id: string | null;
  option_values: Json;
  variant_label: string | null;
  group: { name: string } | null;
  item_uom_conversions: { uom_id: string; factor: number; selling_price: number | null; barcode: string | null; sort_order: number }[];
  item_vehicle_compatibility: { vehicle_id: number }[];
  stock_levels: { store_id: string; on_hand: number }[];
  kit_components: { quantity: number; position: number; component: { sku: string } | null }[];
};

/**
 * Phase 20: the Stock column is the current store's stock (the organization total with one store);
 * imports set it there and leave other stores as they are.
 */
async function csvStore(): Promise<{ multi: string | null; current: string }> {
  const ctx = await getStoreContext();
  return { multi: ctx.multi ? ctx.current.id : null, current: ctx.current.id };
}

const stockOf = (row: Pick<Existing, "quantity_on_hand" | "stock_levels">, storeId: string | null) =>
  storeId ? Number(row.stock_levels.find((l) => l.store_id === storeId)?.on_hand ?? 0) : Number(row.quantity_on_hand);

const ITEM_COLUMNS =
  "id, sku, name, description, vendor_name, category_id, cost_price, selling_price, quantity_on_hand, low_stock_threshold, is_universal, price_includes_tax, attributes, base_uom_id, purchase_uom_id, sale_uom_id, barcode, is_kit, is_archived, group_id, option_values, variant_label, group:product_groups!inventory_items_group_fkey(name), item_uom_conversions(uom_id, factor, selling_price, barcode, sort_order), stock_levels(store_id, on_hand), kit_components!kit_components_kit_fkey(quantity, position, component:inventory_items!kit_components_component_fkey(sku))";

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** Items already in the shop with these SKUs (upper-cased). */
async function existingBySku(supabase: Supabase, skus: string[]) {
  const map = new Map<string, Existing>();
  for (const part of chunks([...new Set(skus)].filter(Boolean), 200)) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select(`${ITEM_COLUMNS}, item_vehicle_compatibility(vehicle_id)`)
      .in("sku", part)
      .overrideTypes<Existing[], { merge: false }>();
    if (error) throw new Error("Could not check existing SKUs.");
    for (const item of data) map.set(item.sku, item);
  }
  return map;
}

/** Kit components by SKU: id, and whether it's a kit or archived (those can't go in a kit). */
async function componentsBySku(supabase: Supabase, skus: string[]) {
  const map = new Map<string, { id: string; is_kit: boolean; is_archived: boolean }>();
  for (const part of chunks([...new Set(skus)].filter(Boolean), 200)) {
    const { data, error } = await supabase.from("inventory_items").select("id, sku, is_kit, is_archived").in("sku", part);
    if (error) throw new Error("Could not look up the kit products.");
    for (const r of data) map.set(r.sku, r);
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

/** A product or kit row, ready to save (kit products by SKU: one may be added earlier in the same import). */
type ItemPlan = { kind: "item"; check: CsvRowCheck; input?: InventoryItemInput; existingId?: string; kitSkus: { sku: string; quantity: number }[] };
/** A product group's rows, saved together. */
type GroupPlan = { kind: "group"; checks: CsvRowCheck[]; input?: ProductGroupInput; existingId: string | null; label: string };
type Plan = ItemPlan | GroupPlan;

/** Stands in for a kit product that the same import adds before the kit (resolved again when saving). */
const PENDING_ID = "00000000-0000-4000-8000-000000000000";

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

const OPTION_CELLS = [
  ["option1Name", "option1Value"],
  ["option2Name", "option2Value"],
  ["option3Name", "option3Value"],
] as const;

/** POLO-RED-M, POLO-RED-L → "POLO-RED"; one SKU → its first part. */
function prefixFrom(skus: string[]) {
  let common = skus[0] ?? "";
  for (const s of skus.slice(1)) {
    let i = 0;
    while (i < common.length && common[i] === s[i]) i++;
    common = common.slice(0, i);
  }
  if (skus.length === 1) common = common.split("-")[0];
  const prefix = common.replace(/[^A-Z0-9]+$/, "").slice(0, 24);
  return SKU_PATTERN.test(prefix) ? prefix : "GRP";
}

/** Validates every row against the shop (categories, SKUs, vehicles, attributes) and builds what would be saved. */
async function prepare(rows: CsvItemRow[], updateExisting: boolean): Promise<{ plans: Plan[]; checks: CsvRowCheck[] }> {
  const supabase = await createClient();
  const [{ tenant }, categories, attributes, fitment, units, store] = await Promise.all([
    getShopSession(),
    getCategories(),
    getAttributes(),
    hasModule("vehicle_fitment"),
    getUnits(),
    csvStore(),
  ]);
  const storeId = store.multi;
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
  const kitCells = rows.map((r) => parseKitCell(r.cells.kit));
  const groupNames = [...new Set(rows.flatMap((r) => (groupKey(r) ? [r.cells.group!.trim()] : [])))];
  const [existing, vehicleIds, components, groupRows] = await Promise.all([
    existingBySku(supabase, rows.map(skuOf)),
    resolveVehicles(supabase, fitment ? rows.map((r) => r.cells.vehicles) : []),
    componentsBySku(supabase, kitCells.flatMap((k) => k.parts.map((p) => p.sku))),
    groupNames.length
      ? supabase.from("product_groups").select("id, name").eq("is_archived", false).then((r) => r.data ?? [])
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const groupIdByName = new Map(groupRows.map((g) => [g.name.trim().toLowerCase(), g.id]));
  // Products the file itself adds (they can go in a kit further down).
  const fileSkus = new Map(rows.filter((r) => !(r.cells.kit ?? "").trim()).map((r) => [skuOf(r), r.line]));
  // The first row of each group carries the group's details.
  const firstOfGroup = new Map<string, number>();
  for (const r of rows) {
    const key = groupKey(r);
    if (key && !firstOfGroup.has(key)) firstOfGroup.set(key, r.line);
  }

  type RowResult = {
    row: CsvItemRow;
    check: CsvRowCheck;
    errors: CsvRowCheck["errors"];
    candidate: InventoryItemInput;
    current?: Existing;
    update: boolean;
    has: (k: CsvColumnKey) => boolean;
    kitSkus: { sku: string; quantity: number }[];
  };

  const seen = new Map<string, number>();
  const results: RowResult[] = rows.map((row, rowIndex) => {
    const c = row.cells;
    const sku = skuOf(row);
    const errors: CsvRowCheck["errors"] = [];
    const err = (column: CsvColumnKey | "row", message: string) =>
      errors.push({ column: column === "row" ? "" : CSV_COLUMN_LABEL[column], message });
    const attrErr = (key: string, message: string) => errors.push({ column: ATTR_COLUMN + key, message });
    const has = (k: CsvColumnKey) => c[k] !== undefined && c[k] !== "";
    const current = sku ? existing.get(sku) : undefined;
    const group = groupKey(row);
    const update = Boolean(current && updateExisting);
    // A variant row that isn't its group's first one only needs its own columns.
    const detailRow = !group || firstOfGroup.get(group) === row.line;
    const newGroup = Boolean(group && !groupIdByName.has(group));

    if (sku && seen.has(sku)) err("sku", `SKU ${sku} is already on line ${seen.get(sku)} of this file.`);
    else if (sku) seen.set(sku, row.line);
    if (current && !updateExisting) err("sku", `SKU ${sku} is already in your inventory. Tick "Update items with the same SKU" to change it.`);
    else if (current?.is_archived && !(group && current.group_id)) err("sku", `SKU ${sku} belongs to an archived variant. Use another SKU.`);
    else if (current?.group_id && !group) {
      const name = current.group?.name ?? "its product";
      err("group", `${sku} is a variant of ${name}. Put "${name}" in the Group column (and its options) to change it.`);
    } else if (current && group && !current.group_id) err("group", `${sku} is a product without variants, so it can't become a variant. Use another SKU.`);
    else if (current?.group_id && group && current.group?.name.trim().toLowerCase() !== group) {
      err("group", `${sku} is a variant of ${current.group?.name ?? "another product"}, not ${c.group}.`);
    }

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
    } else if (!update && detailRow && (!group || newGroup)) err("category", "Enter a category.");

    // Numbers: blank keeps the current value on updates; new items get the defaults.
    const num = (k: CsvColumnKey, fallback: number, required = false) => {
      const v = parseNumberCell(c[k]);
      if (v === null) {
        if (required && !update && detailRow && (!group || newGroup)) err(k, `Enter a ${CSV_COLUMN_LABEL[k].toLowerCase()}.`);
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
    const currentVehicles = current ? (current.item_vehicle_compatibility ?? []).map((v) => v.vehicle_id) : [];
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
    if (categoryId && detailRow) {
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
      if (group && specs.length) err("conversions", "Variants are sold in their unit only (no packs).");
      for (const t of invalid) err("conversions", `Can't read "${t}". Write each unit as code=how many base units, with an optional @price: box=12@1500.`);
      conversions = specs.flatMap((sp) => {
        const id = unitCell("conversions", sp.code, currentConversions.find((cv) => unitByCode.get(sp.code)?.id === cv.uom_id)?.uom_id);
        if (!id) return [];
        // A unit that stays keeps its barcode (pack barcodes aren't in the file).
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

    // RF-21.1: Kit Components. Blank keeps an existing kit's products; "none" isn't allowed (a kit needs some).
    const kitCell = kitCells[rowIndex];
    for (const t of kitCell.invalid) err("kit", `Can't read "${t}". Write each product as SKU=how many per kit: CLIP-01=2.`);
    let kitSkus: { sku: string; quantity: number }[] =
      current && update && current.is_kit
        ? [...current.kit_components].sort((a, b) => a.position - b.position).flatMap((k) => (k.component ? [{ sku: k.component.sku, quantity: Number(k.quantity) }] : []))
        : [];
    if (kitCell.parts.length) kitSkus = kitCell.parts.map(({ sku: s, quantity }) => ({ sku: s, quantity }));
    const isKit = kitSkus.length > 0 || Boolean(current && update && current.is_kit);
    if (group && kitCell.parts.length) err("kit", "A variant can't be a kit.");
    if (current && update && !current.is_kit && kitCell.parts.length) err("kit", `${sku} is a product with its own stock; it can't become a kit. Use a new SKU for the kit.`);
    for (const p of kitCell.parts) {
      const found = components.get(p.sku);
      if (p.sku === sku) err("kit", "A kit can't contain itself.");
      else if (found?.is_kit) err("kit", `${p.sku} is a kit: kits can't go inside kits.`);
      else if (found?.is_archived) err("kit", `${p.sku} is archived and can't go in a kit.`);
      else if (!found && !fileSkus.has(p.sku)) err("kit", `There's no product ${p.sku} in your inventory or in this file.`);
      else if (!found && (fileSkus.get(p.sku) ?? 0) > row.line) err("kit", `Put ${p.sku} above this kit in the file (it's on line ${fileSkus.get(p.sku)}).`);
    }

    const barcode = has("barcode") ? c.barcode! : current && update ? (current.barcode ?? "") : "";
    const text = (k: CsvColumnKey, existingValue: string | null | undefined) => (c[k] !== undefined && (c[k] !== "" || !update) ? c[k]! : (existingValue ?? ""));
    const candidate: InventoryItemInput = {
      sku,
      name: group ? (current?.name ?? c.group ?? "") : text("name", current?.name),
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
      conversions: isKit ? [] : conversions,
      purchaseUomId: isKit ? null : purchaseUomId,
      saleUomId: isKit ? null : saleUomId,
      barcode,
      isKit,
      kitComponents: kitSkus.map((p) => ({ itemId: components.get(p.sku)?.id ?? PENDING_ID, quantity: p.quantity })),
    };
    const check: CsvRowCheck = { line: row.line, sku, name: group ? c.group!.trim() : candidate.name, action: "new", errors };
    return { row, check, errors, candidate, current, update, has, kitSkus };
  });

  // Products and kits: checked by the product schema, like the product dialog.
  const column: Partial<Record<string, CsvColumnKey>> = {
    sku: "sku", name: "name", description: "description", vendorName: "vendor", categoryId: "category",
    costPrice: "costPrice", sellingPrice: "sellingPrice", quantityOnHand: "stock", lowStockThreshold: "lowStock", vehicleIds: "vehicles",
    baseUomId: "unit", conversions: "conversions", purchaseUomId: "purchaseUnit", saleUomId: "saleUnit", barcode: "barcode", kitComponents: "kit",
  };
  const plans: Plan[] = [];
  const groupPlans = new Map<string, RowResult[]>();
  for (const r of results) {
    const key = groupKey(r.row);
    if (key) {
      if (!groupPlans.has(key)) {
        groupPlans.set(key, []);
        plans.push({ kind: "group", checks: [], input: undefined, existingId: groupIdByName.get(key) ?? null, label: key });
      }
      groupPlans.get(key)!.push(r);
      continue;
    }
    let input: InventoryItemInput | undefined;
    if (r.errors.length === 0) {
      const parsed = inventoryItemSchema.safeParse(r.candidate);
      if (parsed.success) input = parsed.data;
      else {
        for (const issue of parsed.error.issues) {
          const key = column[String(issue.path[0])];
          const message = key === "vehicles" ? "Vehicle-specific products need at least one vehicle in Vehicles (or set Universal to Yes)." : issue.message;
          r.errors.push({ column: key ? CSV_COLUMN_LABEL[key] : "", message });
        }
      }
    }
    r.check.action = r.errors.length ? "error" : r.update ? "update" : "new";
    plans.push({ kind: "item", check: r.check, input, existingId: r.update ? r.current?.id : undefined, kitSkus: r.kitSkus });
  }

  // Product groups: one input per group from its rows (and the variants it already has).
  for (const plan of plans) {
    if (plan.kind !== "group") continue;
    const list = groupPlans.get(plan.label)!;
    plan.checks = list.map((r) => r.check);
    const groupError = (message: string, column = "") => list.forEach((r) => r.errors.push({ column, message }));
    const base = list[0];
    let saved: ProductGroupEntry | null = null;
    if (plan.existingId) {
      if (!updateExisting) groupError(`A product called ${base.row.cells.group!.trim()} already exists. Tick "Update items with the same SKU" to change it.`, CSV_COLUMN_LABEL.group);
      else saved = await getProductGroup(plan.existingId);
    }
    if (list.length > MAX_GROUP_ROWS) groupError(`A product can have at most ${MAX_GROUP_ROWS} variants.`, CSV_COLUMN_LABEL.group);

    // Options: their names from the first row; values in the order the file lists them.
    const names = OPTION_CELLS.map(([n]) => base.row.cells[n]?.trim() ?? "");
    const count = names.findIndex((n) => !n) === -1 ? 3 : names.findIndex((n) => !n);
    if (count === 0) groupError("Name its options (Option 1 Name, e.g. Size).", CSV_COLUMN_LABEL.option1Name);
    if (names.slice(count).some(Boolean)) groupError("Fill Option 1 Name before Option 2, and Option 2 before Option 3.", CSV_COLUMN_LABEL.option1Name);
    if (saved && count > 0 && saved.options.length !== count) {
      groupError(`${saved.name} has ${saved.options.length} option${saved.options.length === 1 ? "" : "s"} (${saved.options.map((o) => o.name).join(", ")}); its options can't be added or removed.`, CSV_COLUMN_LABEL.option1Name);
    }
    const options: ProductGroupInput["options"] = names.slice(0, count).map((name, i) => {
      const old = saved?.options[i];
      return { id: old?.id ?? null, name, values: (old?.values ?? []).map((v) => ({ id: v.id, value: v.value, priceDelta: Number(v.price_delta) })) };
    });
    for (const r of list) {
      OPTION_CELLS.slice(0, count).forEach(([, valueCell], i) => {
        const value = r.row.cells[valueCell]?.trim() ?? "";
        if (!value) r.errors.push({ column: CSV_COLUMN_LABEL[valueCell], message: `Enter its ${names[i] || `option ${i + 1}`}.` });
        else if (!options[i].values.some((v) => v.value.toLowerCase() === value.toLowerCase())) options[i].values.push({ id: null, value, priceDelta: 0 });
      });
    }

    const groupPrice = base.has("sellingPrice") || !saved ? base.candidate.sellingPrice : saved.selling_price;
    const groupCost = base.has("costPrice") || !saved ? base.candidate.costPrice : saved.cost_price;
    const deltaOf = (values: string[]) =>
      values.reduce((sum, v, i) => sum + (options[i]?.values.find((x) => x.value.toLowerCase() === v.toLowerCase())?.priceDelta ?? 0), 0);
    const savedVariants = new Map(
      (saved?.variants ?? []).map((v) => {
        const ids = (Array.isArray(v.option_values) ? v.option_values : []).map(String);
        const values = ids.map((id, i) => options[i]?.values.find((x) => x.id === id)?.value ?? "");
        return [comboKey(values), { item: v, values }];
      }),
    );
    const listed = new Set<string>();
    const variants: VariantInput[] = list.map((r) => {
      const values = OPTION_CELLS.slice(0, count).map(([, cell]) => r.row.cells[cell]?.trim() ?? "");
      const key = comboKey(values);
      if (listed.has(key)) r.errors.push({ column: CSV_COLUMN_LABEL.option1Value, message: `${values.join(" / ")} is listed twice for this product.` });
      listed.add(key);
      const old = savedVariants.get(key)?.item;
      if (old && r.current && r.current.id !== old.id) r.errors.push({ column: CSV_COLUMN_LABEL.sku, message: `${r.check.sku} is ${r.current.variant_label ?? "another variant"}, not ${values.join(" / ")}.` });
      r.check.action = old || (r.current && r.update) ? "update" : "new";
      const auto = groupPrice + deltaOf(values);
      const price = r.has("sellingPrice") ? r.candidate.sellingPrice : old?.own_price ? Number(old.selling_price) : null;
      const cost = r.has("costPrice") ? r.candidate.costPrice : old?.own_cost ? Number(old.cost_price) : null;
      return {
        id: old?.id ?? r.current?.id ?? null,
        values,
        sku: r.check.sku,
        barcode: r.has("barcode") ? r.candidate.barcode : (old?.barcode ?? ""),
        sellingPrice: price === null || price === auto ? null : price,
        costPrice: cost === null || cost === groupCost ? null : cost,
        lowStockThreshold: r.has("lowStock") ? r.candidate.lowStockThreshold : old ? Number(old.low_stock_threshold) : base.candidate.lowStockThreshold,
        enabled: true,
        stock: r.has("stock") ? [{ storeId: store.current, onHand: r.candidate.quantityOnHand }] : [],
      };
    });
    // Variants the file doesn't list stay as they are.
    for (const [key, { item, values }] of savedVariants) {
      if (listed.has(key)) continue;
      variants.push({
        id: item.id,
        values,
        sku: item.sku,
        barcode: item.barcode ?? "",
        sellingPrice: item.own_price ? Number(item.selling_price) : null,
        costPrice: item.own_cost ? Number(item.cost_price) : null,
        lowStockThreshold: Number(item.low_stock_threshold),
        enabled: true,
        stock: [],
      });
    }

    const input: ProductGroupInput = {
      name: base.row.cells.group!.trim(),
      skuPrefix: saved?.sku_prefix ?? prefixFrom(list.map((r) => r.check.sku)),
      description: base.has("description") || !saved ? base.candidate.description : (saved.description ?? ""),
      vendorName: base.has("vendor") || !saved ? base.candidate.vendorName : (saved.vendor_name ?? ""),
      categoryId: base.candidate.categoryId || saved?.category_id || "",
      baseUomId: base.has("unit") || !saved ? base.candidate.baseUomId : saved.base_uom_id,
      costPrice: groupCost,
      sellingPrice: groupPrice,
      lowStockThreshold: base.has("lowStock") || !saved ? base.candidate.lowStockThreshold : saved.low_stock_threshold,
      priceIncludesTax: base.has("priceIncludesTax") || !saved ? base.candidate.priceIncludesTax : saved.price_includes_tax,
      isUniversal: base.has("universal") || base.has("vehicles") || !saved ? base.candidate.isUniversal : saved.is_universal,
      vehicleIds: base.has("universal") || base.has("vehicles") || !saved ? base.candidate.vehicleIds : saved.vehicles.map((v) => v.id),
      attributes: { ...(saved ? asValues(saved.attributes) : {}), ...base.candidate.attributes },
      options,
      variants,
    };
    if (list.every((r) => r.errors.length === 0)) {
      const parsed = productGroupSchema.safeParse(input);
      if (parsed.success) plan.input = parsed.data;
      else {
        for (const issue of parsed.error.issues) {
          const [field, i] = issue.path;
          const target = field === "variants" && typeof i === "number" && i < list.length ? [list[i]] : list;
          target.forEach((r) => r.errors.push({ column: "", message: issue.message }));
        }
      }
    }
    for (const r of list) if (r.errors.length) r.check.action = "error";
  }

  const byLine = new Map(results.map((r) => [r.row.line, r.check]));
  return { plans, checks: rows.map((r) => byLine.get(r.line)!) };
}

/** Import dialog, step 2: what each row would do, with every problem found. Nothing is saved. */
export async function checkInventoryCsv(rows: CsvItemRow[], updateExisting: boolean): Promise<{ status: "success"; rows: CsvRowCheck[] } | { status: "error"; message: string }> {
  if (!Array.isArray(rows) || rows.length === 0) return { status: "error", message: "The file has no items." };
  if (rows.length > MAX_IMPORT_ROWS) return { status: "error", message: `Import up to ${MAX_IMPORT_ROWS} items at a time.` };
  try {
    return { status: "success", rows: (await prepare(rows, updateExisting)).checks };
  } catch (e) {
    console.error("checkInventoryCsv failed:", e);
    return { status: "error", message: "We couldn't check the file. Please try again." };
  }
}

function rowError(error: { code: string; message: string }, sku: string) {
  const limit = planLimitMessage(error);
  // Category, attribute, fitment and kit checks in the database explain themselves.
  const explained =
    ["22023", "23502", "55000"].includes(error.code) ||
    (error.code === "23503" && error.message.includes("category")) ||
    (error.code === "23514" && (error.message.includes("unit") || error.message.includes("pack")));
  const message = limit
    ? limit
    : error.code === "23505"
      ? /barcode/i.test(error.message) ? `The barcode of ${sku} is already used by another product or pack.` : `SKU ${sku} is already used by another item.`
      : error.code === "23514" && error.message.includes("inventory_reserved_within_stock")
        ? "Stock can't go below what open quotations have reserved."
        : explained
          ? error.message
          : "This row couldn't be saved.";
  if (!limit && !explained && !["23505", "23514"].includes(error.code)) console.error("importInventoryCsv row failed:", error.message);
  return message;
}

/** Step 3: saves one batch of rows (about 100; a product group's rows always come together); rows with problems are skipped and reported. */
export async function importInventoryCsv(rows: CsvItemRow[], updateExisting: boolean): Promise<{ status: "success"; results: CsvImportResult[] } | { status: "error"; message: string }> {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > Math.max(IMPORT_BATCH, MAX_GROUP_ROWS)) return { status: "error", message: "Send up to 100 items at a time." };
  let plans: Plan[];
  try {
    plans = (await prepare(rows, updateExisting)).plans;
  } catch (e) {
    console.error("importInventoryCsv failed:", e);
    return { status: "error", message: "We couldn't read these rows. Please try again." };
  }
  const supabase = await createClient();
  const store = await csvStore();
  const results: CsvImportResult[] = [];
  for (const p of plans) {
    if (p.kind === "group") {
      if (!p.input || p.checks.some((c) => c.action === "error")) {
        for (const c of p.checks) results.push({ line: c.line, sku: c.sku, status: "error", message: c.errors.map((e) => e.message).join(" ") || "Another row of this product has a problem." });
        continue;
      }
      const saved = await saveProductGroup(p.existingId, p.input);
      for (const c of p.checks) {
        results.push(saved.status === "error" ? { line: c.line, sku: c.sku, status: "error", message: saved.message } : { line: c.line, sku: c.sku, status: c.action === "update" ? "updated" : "created" });
      }
      continue;
    }
    const { line, sku } = p.check;
    if (!p.input) {
      results.push({ line, sku, status: "error", message: p.check.errors.map((e) => e.message).join(" ") });
      continue;
    }
    const item = p.input;
    // A kit's products may have been added by earlier rows of this import.
    let kitComponents = item.kitComponents;
    if (item.isKit && kitComponents.some((k) => k.itemId === PENDING_ID)) {
      const found = await componentsBySku(supabase, p.kitSkus.map((k) => k.sku));
      const missing = p.kitSkus.filter((k) => !found.get(k.sku));
      if (missing.length) {
        results.push({ line, sku, status: "error", message: `${missing.map((m) => m.sku).join(", ")} wasn't added, so the kit can't be made.` });
        continue;
      }
      kitComponents = p.kitSkus.map((k) => ({ itemId: found.get(k.sku)!.id, quantity: k.quantity }));
    }
    const { error } = await supabase.rpc("save_inventory_item", {
      p_item_id: p.existingId,
      p_store_id: store.multi ?? undefined,
      p_sku: item.sku,
      p_name: item.name,
      p_description: item.description || undefined,
      p_category_id: item.categoryId,
      p_cost_price: item.costPrice,
      p_selling_price: item.sellingPrice,
      p_quantity_on_hand: item.isKit ? 0 : item.quantityOnHand,
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
      p_barcode: item.barcode,
      p_is_kit: item.isKit,
      p_kit_components: item.isKit ? kitComponents.map((k) => ({ item_id: k.itemId, quantity: k.quantity })) : [],
    });
    if (error) results.push({ line, sku, status: "error", message: rowError(error, sku) });
    else results.push({ line, sku, status: p.existingId ? "updated" : "created" });
  }
  if (results.some((r) => r.status !== "error")) refresh();
  return { status: "success", results };
}

/** Attribute keys that get an attr: column (template and export): every attribute that isn't archived. */
const columnAttributes = (attributes: Attribute[]) => attributes.filter((a) => !a.is_archived);

/** "Export Inventory (CSV)": every item in the shop (all pages), in the import template's columns. */
export async function exportInventoryCsv(): Promise<{ status: "success"; header: string[]; rows: (string | number)[][] } | { status: "error"; message: string }> {
  const supabase = await createClient();
  const [categories, attributeDefs, fitment, units, store] = await Promise.all([getCategories(), getAttributes(), hasModule("vehicle_fitment"), getUnits(), csvStore()]);
  const storeId = store.multi;
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
      .eq("is_archived", false)
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
  // Phase 21: each variant's options by name, from its group's option values.
  const groupIds = [...new Set(all.flatMap((i) => (i.group_id ? [i.group_id] : [])))];
  const valueOf = new Map<string, { option: string; position: number; value: string }>();
  for (const part of chunks(groupIds, 200)) {
    const { data } = await supabase.from("product_option_types").select("name, position, product_option_values(id, value)").in("group_id", part);
    for (const o of data ?? []) for (const v of o.product_option_values) valueOf.set(v.id, { option: o.name, position: o.position, value: v.value });
  }
  const yes = (b: boolean) => (b ? "Yes" : "No");
  const columns = csvColumns(fitment);
  return {
    status: "success",
    header: [...columns.map((c) => c.label), ...attrs.map((a) => ATTR_COLUMN + a.key)],
    rows: all.map((i) => {
      const node = index.byId.get(i.category_id);
      const options = (Array.isArray(i.option_values) ? i.option_values : []).map((id) => valueOf.get(String(id)));
      const opt = (n: number) => options[n] ?? null;
      const cell: Record<CsvColumnKey, string | number> = {
        sku: i.sku,
        name: i.name,
        category: node ? fullPath(node) : "",
        costPrice: Number(i.cost_price),
        sellingPrice: Number(i.selling_price),
        stock: i.is_kit ? "" : stockOf(i, storeId),
        universal: yes(i.is_universal),
        vehicles: i.is_universal ? "" : formatVehiclesCell(i.item_vehicle_compatibility.flatMap((l) => (l.vehicles ? [l.vehicles] : []))),
        vendor: i.vendor_name ?? "",
        lowStock: i.is_kit ? "" : Number(i.low_stock_threshold),
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
        barcode: i.barcode ?? "",
        kit: i.is_kit
          ? formatKitCell([...i.kit_components].sort((a, b) => a.position - b.position).flatMap((k) => (k.component ? [{ sku: k.component.sku, quantity: Number(k.quantity) }] : [])))
          : "",
        group: i.group?.name ?? "",
        option1Name: opt(0)?.option ?? "",
        option1Value: opt(0)?.value ?? "",
        option2Name: opt(1)?.option ?? "",
        option2Value: opt(1)?.value ?? "",
        option3Name: opt(2)?.option ?? "",
        option3Value: opt(2)?.value ?? "",
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

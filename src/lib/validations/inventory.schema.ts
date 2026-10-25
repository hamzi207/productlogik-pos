import { z } from "zod";
import { attributeValuesSchema } from "@/lib/attributes";
import { fitsDecimals } from "@/lib/uom";

export const FITMENT_FILTERS = ["universal", "specific"] as const;
export type FitmentFilter = (typeof FITMENT_FILTERS)[number];

/** in = some available · low = at or below the alert level (incl. none) · out = none available. */
export const STOCK_FILTERS = ["in", "low", "out"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

export const INVENTORY_SORTS = ["name", "newest", "stock", "price-high", "price-low"] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

// numeric(10,2) tops out just under 100 million.
const MAX_PRICE = 99_999_999.99;

const price = (label: string) =>
  z
    .number({ error: `Enter a ${label}.` })
    .min(0, `${label[0].toUpperCase()}${label.slice(1)} can't be negative.`)
    .max(MAX_PRICE, "That price is too large.");

// numeric(14,3), in the product's base unit; the database also checks the unit's own decimal places.
const quantity = (label: string) =>
  z
    .number({ error: `Enter a ${label}.` })
    .min(0, "Can't be negative.")
    .max(100_000_000, "That number is too large.")
    .refine((n) => fitsDecimals(n, 3), "Use at most 3 decimal places.");

/** One unit conversion: 1 <unit> = factor base units (RF-19.1 uses them as purchase / sale units). */
export const conversionSchema = z.object({
  uomId: z.uuid({ error: "Choose a unit." }),
  factor: z
    .number({ error: "Enter how many base units it holds." })
    .positive("Must be more than 0.")
    .max(1_000_000, "That number is too large.")
    .refine((n) => fitsDecimals(n, 6), "Use at most 6 decimal places."),
  /** Own price for one of this unit; null = base price × factor. */
  sellingPrice: z
    .number({ error: "Enter a price or leave it empty." })
    .min(0, "Price can't be negative.")
    .max(MAX_PRICE, "That price is too large.")
    .nullable(),
  barcode: z.string().trim().max(64, "Barcode must be 64 characters or fewer."),
});

export type ConversionInput = z.infer<typeof conversionSchema>;

export const inventoryItemSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Enter a SKU / product code.")
      .max(40, "SKU must be 40 characters or fewer.")
      .regex(/^[A-Z0-9][A-Z0-9._/-]*$/, "Use letters, numbers, dashes, dots or slashes only."),
    name: z
      .string()
      .trim()
      .min(2, "Enter a product name.")
      .max(120, "Name must be 120 characters or fewer."),
    description: z.string().trim().max(500, "Description must be 500 characters or fewer."),
    /** Who the shop buys it from (free text; no supplier records yet). */
    vendorName: z.string().trim().max(255, "Vendor name must be 255 characters or fewer."),
    categoryId: z.uuid({ error: "Choose a category." }),
    costPrice: price("cost price"),
    sellingPrice: price("selling price"),
    quantityOnHand: quantity("stock quantity"),
    lowStockThreshold: quantity("low-stock alert level"),
    /** The unit stock is counted in. */
    baseUomId: z.uuid({ error: "Choose a unit." }),
    conversions: z.array(conversionSchema).max(10, "Add at most 10 units to one product."),
    /** RF-19.1: the unit new purchases / document lines start in; null = the base unit. */
    purchaseUomId: z.uuid().nullable(),
    saleUomId: z.uuid().nullable(),
    /** Selling price already includes the shop tax (default from shop settings). */
    priceIncludesTax: z.boolean(),
    isUniversal: z.boolean(),
    vehicleIds: z
      .array(z.number().int().positive())
      .max(500, "Link at most 500 vehicles to one item."),
    /** Custom attribute values keyed by attribute key (RF-18.1); the database checks them against the definitions. */
    attributes: attributeValuesSchema,
  })
  .superRefine((item, ctx) => {
    if (!item.isUniversal && item.vehicleIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["vehicleIds"],
        message: "Add at least one compatible vehicle, or switch to Universal Fit.",
      });
    }
    const seen = new Set<string>();
    item.conversions.forEach((c, i) => {
      if (c.uomId === item.baseUomId) {
        ctx.addIssue({ code: "custom", path: ["conversions", i, "uomId"], message: "This is already the base unit." });
      } else if (seen.has(c.uomId)) {
        ctx.addIssue({ code: "custom", path: ["conversions", i, "uomId"], message: "This unit is listed twice." });
      }
      seen.add(c.uomId);
    });
    for (const key of ["purchaseUomId", "saleUomId"] as const) {
      const id = item[key];
      if (id && id !== item.baseUomId && !seen.has(id)) {
        ctx.addIssue({ code: "custom", path: [key], message: "Pick the base unit or one of the units above." });
      }
    }
  });

export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

/** URL prefix of an attribute filter: ?attr.<key>=<option> (list) or yes / no (yes/no type). */
export const ATTR_PARAM = "attr.";

// URL search params for /inventory. Invalid values are dropped, not errors.
export const inventoryFiltersSchema = z.object({
  /** A category id; includes everything below it. */
  category: z.uuid().optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
  fitment: z.enum(FITMENT_FILTERS).optional().catch(undefined),
  stock: z.enum(STOCK_FILTERS).optional().catch(undefined),
  sort: z.enum(INVENTORY_SORTS).optional().catch(undefined),
  /** Attribute filters (list and yes/no attributes), keyed by attribute key. */
  attributes: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.string().max(100)).optional().catch(undefined),
});

export type InventoryFilters = z.infer<typeof inventoryFiltersSchema>;

import { z } from "zod";
import { attributeValuesSchema } from "@/lib/attributes";
import { fitsDecimals } from "@/lib/uom";
import { barcodeSchema } from "./inventory.schema";

// Phase 21: a product group, its options and its variant matrix (save_product_group checks all of it again).

const MAX_PRICE = 99_999_999.99;

const price = (label: string) =>
  z.number({ error: `Enter a ${label}.` }).min(0, `${label[0].toUpperCase()}${label.slice(1)} can't be negative.`).max(MAX_PRICE, "That price is too large.");

const optionalPrice = z.number({ error: "Enter a price or leave it empty." }).min(0, "Price can't be negative.").max(MAX_PRICE, "That price is too large.").nullable();

const quantity = (label: string) =>
  z
    .number({ error: `Enter a ${label}.` })
    .min(0, "Can't be negative.")
    .max(100_000_000, "That number is too large.")
    .refine((n) => fitsDecimals(n, 3), "Use at most 3 decimal places.");

export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._/-]*$/;
const skuMessage = "Use letters, numbers, dashes, dots or slashes only.";

export const optionValueSchema = z.object({
  id: z.uuid().nullable(),
  value: z.string().trim().min(1, "Enter a value.").max(40, "Values must be 40 characters or fewer."),
  /** Added to the group price for variants with this value ("+200 for XL"); can be negative. */
  priceDelta: z.number({ error: "Enter an amount or 0." }).min(-MAX_PRICE).max(MAX_PRICE, "That amount is too large."),
});

export const optionSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, "Name the option (e.g. Size).").max(30, "Option names must be 30 characters or fewer."),
  values: z.array(optionValueSchema).min(1, "Add at least one value.").max(40, "An option can have at most 40 values."),
});

export const variantSchema = z.object({
  id: z.uuid().nullable(),
  /** One value per option, in option order. */
  values: z.array(z.string()),
  sku: z.string().trim().toUpperCase().min(1, "Enter a SKU.").max(40, "SKU must be 40 characters or fewer.").regex(SKU_PATTERN, skuMessage),
  barcode: barcodeSchema,
  /** Null = the group price plus its values' price changes. */
  sellingPrice: optionalPrice,
  /** Null = the group's cost. */
  costPrice: optionalPrice,
  lowStockThreshold: quantity("low-stock alert level"),
  enabled: z.boolean(),
  /** On hand per store; null = leave that store's stock as it is. */
  stock: z.array(z.object({ storeId: z.uuid(), onHand: quantity("stock quantity").nullable() })).max(100),
});

export const productGroupSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a product name.").max(90, "Name must be 90 characters or fewer."),
    skuPrefix: z.string().trim().toUpperCase().min(1, "Enter a SKU prefix.").max(24, "Keep the prefix to 24 characters.").regex(SKU_PATTERN, skuMessage),
    description: z.string().trim().max(500, "Description must be 500 characters or fewer."),
    vendorName: z.string().trim().max(255, "Vendor name must be 255 characters or fewer."),
    categoryId: z.uuid({ error: "Choose a category." }),
    baseUomId: z.uuid({ error: "Choose a unit." }),
    costPrice: price("cost price"),
    sellingPrice: price("selling price"),
    lowStockThreshold: quantity("low-stock alert level"),
    priceIncludesTax: z.boolean(),
    isUniversal: z.boolean(),
    vehicleIds: z.array(z.number().int().positive()).max(500, "Link at most 500 vehicles to one product."),
    attributes: attributeValuesSchema,
    options: z.array(optionSchema).min(1, "Add at least one option (e.g. Size).").max(3, "A product can have at most 3 options."),
    variants: z.array(variantSchema).max(300, "A product can have at most 300 variants."),
  })
  .superRefine((group, ctx) => {
    if (!group.isUniversal && group.vehicleIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["vehicleIds"], message: "Add at least one compatible vehicle, or switch to Universal Fit." });
    }
    const names = new Set<string>();
    group.options.forEach((o, i) => {
      const key = o.name.trim().toLowerCase();
      if (names.has(key)) ctx.addIssue({ code: "custom", path: ["options", i, "name"], message: "Two options have this name." });
      names.add(key);
      const values = new Set<string>();
      o.values.forEach((v, j) => {
        const k = v.value.trim().toLowerCase();
        if (values.has(k)) ctx.addIssue({ code: "custom", path: ["options", i, "values", j, "value"], message: "This value is listed twice." });
        values.add(k);
      });
    });
    const enabled = group.variants.filter((v) => v.enabled);
    if (enabled.length === 0) ctx.addIssue({ code: "custom", path: ["variants"], message: "Switch on at least one variant." });
    const skus = new Map<string, number>();
    const barcodes = new Map<string, number>();
    group.variants.forEach((v, i) => {
      if (!v.enabled) return;
      if (skus.has(v.sku)) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: `${v.sku} is used by two variants.` });
      skus.set(v.sku, i);
      if (v.barcode) {
        if (barcodes.has(v.barcode)) ctx.addIssue({ code: "custom", path: ["variants", i, "barcode"], message: "Two variants have this barcode." });
        barcodes.set(v.barcode, i);
      }
    });
  });

export type ProductGroupInput = z.infer<typeof productGroupSchema>;
export type OptionInput = z.infer<typeof optionSchema>;
export type VariantInput = z.infer<typeof variantSchema>;

/** "POLO" + ["Red", "L"] → "POLO-RED-L" (letters and digits of each value). */
export function variantSku(prefix: string, values: string[]) {
  const part = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "X";
  return [prefix.toUpperCase(), ...values.map(part)].join("-").slice(0, 40);
}

/** Every combination of the options' values, in option order (the first option changes slowest). */
export function combinations(options: { values: { value: string }[] }[]): string[][] {
  return options.reduce<string[][]>(
    (rows, option) => rows.flatMap((row) => option.values.map((v) => [...row, v.value.trim()])),
    [[]],
  );
}

/** One key per combination ("red|l"), the same whatever the case. */
export const comboKey = (values: string[]) => values.map((v) => v.trim().toLowerCase()).join("|");

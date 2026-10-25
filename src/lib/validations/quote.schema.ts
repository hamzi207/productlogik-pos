import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/documents";
import { fitsDecimals } from "@/lib/uom";

export const DISCOUNT_TYPES = ["amount", "percent"] as const;
export const DOCUMENT_STAGES = ["draft", "quotation", "invoice"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");

/**
 * One line as the builder sends it: an inventory part (itemId; its price
 * comes from inventory) or a custom item not in inventory (itemId null).
 * The discount is per unit: % of the unit price or a flat amount.
 */
export const quoteLineSchema = z
  .object({
    itemId: z.uuid().nullable(),
    /** Inventory parts: the unit it's sold in (base unit or a conversion); null = base unit. The database checks the decimals. */
    uomId: z.uuid().nullable().optional(),
    description: z.string().trim().min(1, "Every line needs a description.").max(300, "Keep descriptions under 300 characters."),
    isLabor: z.boolean(),
    quantity: z
      .number({ error: "Enter a quantity." })
      .positive("Quantities must be more than 0.")
      .max(100_000, "That quantity is too large.")
      .refine((n) => fitsDecimals(n, 3), "Use at most 3 decimal places."),
    unitPrice: z.number({ error: "Enter a price." }).min(0, "Prices can't be negative.").max(100_000_000, "That price is too large."),
    discountType: z.enum(DISCOUNT_TYPES),
    discountValue: z
      .number({ error: "Enter a discount (0 for none)." })
      .min(0, "A sale price can't be more than the unit price."),
  })
  .refine((l) => l.discountType !== "percent" || l.discountValue <= 100, "A discount can't be more than 100%.")
  .refine((l) => l.discountType !== "amount" || l.discountValue <= l.unitPrice, "A discount can't be more than the unit price.");

export const quoteSchema = z
  .object({
    customerId: z.uuid({ error: "Choose a customer." }),
    discountType: z.enum(DISCOUNT_TYPES),
    discountValue: z.number({ error: "Enter a discount (0 for none)." }).min(0, "The discount can't be negative."),
    discountReason: z.string().trim().max(255, "Keep the discount reason under 255 characters."),
    notes: z.string().trim().max(2000, "Keep notes under 2,000 characters."),
    /** Walk-in sales only: who the cash customer is (kept on the document). */
    walkInName: z.string().trim().max(120, "Keep the name under 120 characters."),
    /** As typed; the server converts it to E.164 with the shop's phone rules. */
    walkInPhone: z.string().trim().max(30),
    /** Invoices: when payment is due (YYYY-MM-DD), or "" for the shop default. */
    dueDate: z.union([isoDate, z.literal("")]),
    lines: z.array(quoteLineSchema).max(200, "A document can have up to 200 lines."),
  })
  .refine((q) => q.discountType !== "percent" || q.discountValue <= 100, {
    message: "A percentage discount can't be more than 100%.",
    path: ["discountValue"],
  })
  .refine((q) => q.discountValue === 0 || q.discountReason.length > 0, {
    message: "Give a reason for the discount.",
    path: ["discountReason"],
  });

export type QuoteInput = z.infer<typeof quoteSchema>;
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;

export const paymentSchema = z
  .object({
    amount: z.number({ error: "Enter an amount." }).positive("Enter an amount above 0.").max(100_000_000, "That amount is too large."),
    method: z.enum(PAYMENT_METHODS, { error: "Choose how it was paid." }),
    paidOn: isoDate,
    notes: z.string().trim().max(300, "Keep notes under 300 characters."),
    /** Optional: which invoice lines this payment is for, and how much of it goes to each. */
    items: z
      .array(
        z.object({
          quoteItemId: z.uuid(),
          amount: z.number().positive("Each item needs an amount above 0."),
          quantity: z.number().positive().nullable(),
        }),
      )
      .max(200)
      .default([]),
  })
  .refine((p) => p.items.reduce((sum, i) => sum + i.amount, 0) <= p.amount + 0.005, {
    message: "The amounts for items add up to more than the payment.",
    path: ["items"],
  });
export type PaymentInput = z.input<typeof paymentSchema>;

export const documentFiltersSchema = z.object({
  search: z.string().trim().max(100).optional().catch(undefined),
  status: z.string().max(20).optional().catch(undefined),
});

export type DocumentFilters = z.infer<typeof documentFiltersSchema>;

import { z } from "zod";
import { COLOR_KEYS } from "@/lib/category-colors";

// Settings → Units and Settings → Customers (Phase 19): the organization's own lists.

export const unitSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a short code, e.g. box.")
    .max(12, "Keep the code to 12 characters.")
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} .²³/-]*$/u, "Use letters, numbers, spaces, dots or dashes."),
  name: z.string().trim().min(1, "Enter a name, e.g. Box.").max(40, "Keep the name to 40 characters."),
  decimals: z.number({ error: "Choose how many decimal places." }).int().min(0).max(3),
  isPack: z.boolean(),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const customerTypeSchema = z.object({
  name: z.string().trim().min(1, "Enter a name for the type.").max(40, "Keep the name to 40 characters."),
  requiresTaxDetails: z.boolean(),
});
export type CustomerTypeInput = z.infer<typeof customerTypeSchema>;

export const customerTagSchema = z.object({
  name: z.string().trim().min(1, "Enter a name for the tag.").max(30, "Keep the name to 30 characters."),
  color: z.enum(COLOR_KEYS as [string, ...string[]]).nullable(),
});
export type CustomerTagInput = z.infer<typeof customerTagSchema>;

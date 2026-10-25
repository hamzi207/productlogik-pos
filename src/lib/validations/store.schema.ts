import { z } from "zod";

const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => v || null);

/** Settings → Stores → Add / edit a store. Address, phone and tax numbers override the business profile on its documents. */
export const storeSchema = z.object({
  name: z.string().trim().min(1, "Enter the store's name.").max(60, "Keep the name to 60 characters."),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .max(8, "Keep the code to 8 characters.")
    .regex(/^([A-Z0-9]+(-[A-Z0-9]+)*)?$/, "Use letters and numbers, e.g. LHR1.")
    .transform((v) => v || null),
  address: optional(300, "Keep the address to 300 characters."),
  phone: optional(30, "Keep the phone number to 30 characters."),
  ntn: z
    .string()
    .trim()
    .regex(/^([0-9]{7}(-[0-9])?)?$/, "An NTN is 7 digits, optionally with a check digit (1234567-8).")
    .transform((v) => v || null),
  strn: z
    .string()
    .trim()
    .regex(/^([0-9]{13})?$/, "An STRN is 13 digits.")
    .transform((v) => v || null),
  isActive: z.boolean(),
});
export type StoreInput = z.input<typeof storeSchema>;

/** Settings → Stores → selling from other stores and per-store numbering (RF-20.2). */
export const storeSettingsSchema = z.object({
  allowCrossStore: z.boolean(),
  crossStoreRoles: z.enum(["managers", "all"]),
  numberPerStore: z.boolean(),
});
export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;

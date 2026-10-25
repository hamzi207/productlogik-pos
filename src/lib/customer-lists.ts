// Customer types and tags (Phase 19). Each organization keeps its own lists; shared by server and client.

/** One of the organization's customer types (customers.customer_type holds its name). */
export type CustomerTypeOption = {
  id: string;
  name: string;
  /** Customers of this type need a CNIC / NTN (V1's dealership / fleet rule, now per type). */
  requires_tax_details: boolean;
  /** Used for the walk-in customer and new customers. */
  is_default: boolean;
  is_archived: boolean;
  sort_order: number;
};

export const CUSTOMER_TYPE_COLUMNS = "id, name, requires_tax_details, is_default, is_archived, sort_order";

/** A customer tag (RF-19.2): a name and a colour from the category palette. */
export type CustomerTag = { id: string; name: string; color: string | null };

export const CUSTOMER_TAG_COLUMNS = "id, name, color";

/** Types a customer can be given: active ones, plus `current` even if it was archived since. */
export const choosableTypes = (types: CustomerTypeOption[], current?: string | null) =>
  types.filter((t) => !t.is_archived || t.name === current);

/** The type new customers start with. */
export const defaultType = (types: CustomerTypeOption[]) =>
  types.find((t) => t.is_default && !t.is_archived) ?? types.find((t) => !t.is_archived);

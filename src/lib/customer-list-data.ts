import "server-only";
import { cache } from "react";
import { allRows } from "@/lib/supabase/all-rows";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_TAG_COLUMNS, CUSTOMER_TYPE_COLUMNS, type CustomerTag, type CustomerTypeOption } from "@/lib/customer-lists";

/** The organization's customer types, archived ones too (RLS: own organization). Deduplicated per request. */
export const getCustomerTypes = cache(async (): Promise<CustomerTypeOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customer_types").select(CUSTOMER_TYPE_COLUMNS).order("sort_order").order("name");
  if (error) {
    console.error("getCustomerTypes failed:", error.message);
    throw new Error("Could not load customer types.");
  }
  return data;
});

/** The organization's customer tags, A–Z (RF-19.2). */
export const getCustomerTags = cache(async (): Promise<CustomerTag[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customer_tags").select(CUSTOMER_TAG_COLUMNS).order("name");
  if (error) {
    console.error("getCustomerTags failed:", error.message);
    throw new Error("Could not load customer tags.");
  }
  return data;
});

/** Customers per tag id (Settings → Customers). */
export const getCustomerTagCounts = cache(async (): Promise<Record<string, number>> => {
  const supabase = await createClient();
  let data: { tag_id: string }[];
  try {
    // Every link, past the API's 1,000-row cap.
    data = await allRows((a, b) => supabase.from("customer_tag_links").select("tag_id").order("customer_id").order("tag_id").range(a, b));
  } catch (error) {
    console.error("getCustomerTagCounts failed:", (error as Error).message);
    return {};
  }
  return countTags(data);
});

/** { tag id: number of customers } from customer_tag_links rows. */
export function countTags(rows: { tag_id: string }[]) {
  const counts: Record<string, number> = {};
  for (const { tag_id } of rows) counts[tag_id] = (counts[tag_id] ?? 0) + 1;
  return counts;
}

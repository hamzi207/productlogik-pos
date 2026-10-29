import "server-only";
import { cache } from "react";
import { allRows } from "@/lib/supabase/all-rows";
import { createClient } from "@/lib/supabase/server";
import type { Attribute } from "@/lib/attributes";
import { CATEGORY_COLUMNS, type Category } from "@/lib/categories";

/** The shop's categories (RLS: its industry's catalog and its own). Deduplicated per request. */
export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  try {
    return await allRows((a, b) => supabase.from("categories").select(CATEGORY_COLUMNS).order("id").range(a, b));
  } catch (error) {
    console.error("getCategories failed:", (error as Error).message);
    throw new Error("Could not load categories.");
  }
});

/** Items per category id (directly on it, not counting subcategories). */
export const getCategoryCounts = cache(async (): Promise<Record<string, number>> => {
  const supabase = await createClient();
  let data: { category_id: string }[];
  try {
    // Every item, past the API's 1,000-row cap.
    data = await allRows((a, b) => supabase.from("inventory_items").select("category_id").eq("is_archived", false).order("id").range(a, b));
  } catch (error) {
    console.error("getCategoryCounts failed:", (error as Error).message);
    throw new Error("Could not load categories.");
  }
  const counts: Record<string, number> = {};
  for (const { category_id } of data) counts[category_id] = (counts[category_id] ?? 0) + 1;
  return counts;
});

export type CategoryRequestRow = {
  id: string;
  name: string;
  status: "pending" | "approved_tenant" | "approved_industry" | "rejected";
  note: string | null;
  resolution_note: string | null;
  suggested_parent_id: string | null;
  created_category_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

/** The organization's category requests, newest first (RLS: own organization). */
export const getCategoryRequests = cache(async (): Promise<CategoryRequestRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("category_requests")
    .select("id, name, status, note, resolution_note, suggested_parent_id, created_category_id, created_at, resolved_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("getCategoryRequests failed:", error.message);
    return [];
  }
  return data as CategoryRequestRow[];
});

/** Attribute definitions the organization's items can use (RLS: its industry's and its own; archived ones too). */
export const getAttributes = cache(async (): Promise<Attribute[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("category_attributes").select("*").order("sort_order").order("label");
  if (error) {
    console.error("getAttributes failed:", error.message);
    return [];
  }
  return data;
});

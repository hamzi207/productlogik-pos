import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { UNIT_COLUMNS, UNIT_PRESET_COLUMNS, type Unit, type UnitPreset } from "@/lib/uom";

/** The organization's units of measure, archived ones too (RLS: own organization). Deduplicated per request. */
export const getUnits = cache(async (): Promise<Unit[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("units_of_measure").select(UNIT_COLUMNS).order("sort_order").order("code");
  if (error) {
    console.error("getUnits failed:", error.message);
    throw new Error("Could not load units.");
  }
  return data;
});

/** The platform's unit presets (any signed-in user reads them), in list order. */
export const getUnitPresets = cache(async (): Promise<UnitPreset[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("uom_presets").select(UNIT_PRESET_COLUMNS).order("sort_order");
  if (error) {
    console.error("getUnitPresets failed:", error.message);
    return [];
  }
  return data;
});

/** How many products have packs set up (Settings → Units warns before packs are switched off). */
export const getPackProductCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("item_uom_conversions").select("item_id");
  if (error) {
    console.error("getPackProductCount failed:", error.message);
    return 0;
  }
  return new Set(data.map((r) => r.item_id)).size;
});

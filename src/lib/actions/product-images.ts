"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { imagePaths, MAX_PRODUCT_IMAGES, PRODUCT_IMAGE_BUCKET } from "@/lib/product-images";
import { createClient } from "@/lib/supabase/server";

// RF-21.2: removing and ordering product images (adding goes through POST /api/product-images). The
// caller's session: RLS keeps it to their organization's images and folder.

export type ImageActionResult = { status: "success" } | { status: "error"; message: string };

/** Removes images and their files. */
export async function removeProductImages(ids: string[]): Promise<ImageActionResult> {
  const parsed = z.array(z.uuid()).max(MAX_PRODUCT_IMAGES * 2).safeParse(ids);
  if (!parsed.success) return { status: "error", message: "Invalid image." };
  if (parsed.data.length === 0) return { status: "success" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_images").delete().in("id", parsed.data).select("url");
  if (error) {
    console.error("removeProductImages failed:", error);
    return { status: "error", message: "We couldn't remove the image. Please try again." };
  }
  const paths = data.flatMap((i) => imagePaths(i.url));
  if (paths.length) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(paths);
  return { status: "success" };
}

/** Puts a product's images in this order (the first is the main image), and refreshes the page. */
export async function orderProductImages(ids: string[]): Promise<ImageActionResult> {
  const parsed = z.array(z.uuid()).max(MAX_PRODUCT_IMAGES).safeParse(ids);
  if (!parsed.success) return { status: "error", message: "Invalid image." };
  const supabase = await createClient();
  const results = await Promise.all(parsed.data.map((id, position) => supabase.from("product_images").update({ position }).eq("id", id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("orderProductImages failed:", failed.error);
    return { status: "error", message: "We couldn't save the order of the images." };
  }
  refresh();
  return { status: "success" };
}

import { z } from "zod";
import { getShopSession } from "@/lib/auth";
import { MAX_PRODUCT_IMAGES, PRODUCT_IMAGE_BUCKET } from "@/lib/product-images";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 1024 * 1024;

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

/**
 * RF-21.2: adds one image to a product, kit or product group. The browser sends two JPEGs it made from the
 * picked file (`image`, at most 1200px, and `thumb`, 240px) and the owner (`itemId` or `groupId`). They're
 * checked here and stored in the organization's folder of the product-images bucket with the user's
 * session, so the bucket's per-organization policies apply; product_images' trigger allows 8 per owner.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const session = await getShopSession();
  const itemId = form?.get("itemId");
  const groupId = form?.get("groupId");
  const owner =
    typeof itemId === "string" && z.uuid().safeParse(itemId).success
      ? { item_id: itemId }
      : typeof groupId === "string" && z.uuid().safeParse(groupId).success
        ? { group_id: groupId }
        : null;
  if (!owner) return json(400, { error: "Save the product first." });

  const image = form?.get("image");
  const thumb = form?.get("thumb");
  if (!(image instanceof File) || !(thumb instanceof File)) return json(400, { error: "Choose an image to upload." });
  if (image.size > MAX_BYTES || thumb.size > MAX_BYTES) return json(400, { error: "That image is too large. Use one under 1 MB." });
  const [bytes, thumbBytes] = await Promise.all([image.arrayBuffer(), thumb.arrayBuffer()]).then((b) => b.map((x) => new Uint8Array(x)));
  if (!isJpeg(bytes) || !isJpeg(thumbBytes)) return json(400, { error: "Use a PNG or JPG image." });

  const supabase = await createClient();
  const column = "item_id" in owner ? "item_id" : "group_id";
  const ownerId = "item_id" in owner ? owner.item_id! : owner.group_id!;
  const { count } = await supabase.from("product_images").select("id", { count: "exact", head: true }).eq(column, ownerId);
  if ((count ?? 0) >= MAX_PRODUCT_IMAGES) return json(400, { error: `A product can have at most ${MAX_PRODUCT_IMAGES} images.` });

  const name = crypto.randomUUID();
  const path = `${session.tenant.id}/${name}.jpg`;
  const thumbPath = `${session.tenant.id}/${name}-t.jpg`;
  const bucket = supabase.storage.from(PRODUCT_IMAGE_BUCKET);
  const [up, upThumb] = await Promise.all([
    bucket.upload(path, bytes, { contentType: "image/jpeg", cacheControl: "31536000" }),
    bucket.upload(thumbPath, thumbBytes, { contentType: "image/jpeg", cacheControl: "31536000" }),
  ]);
  if (up.error || upThumb.error) {
    console.error("product image upload failed:", up.error ?? upThumb.error);
    await bucket.remove([path, thumbPath]);
    return json(500, { error: "The upload failed. Please try again." });
  }
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const { data, error } = await supabase
    .from("product_images")
    .insert({ tenant_id: session.tenant.id, ...owner, path, url, position: count ?? 0 })
    .select("id, url, position")
    .single();
  if (error) {
    await bucket.remove([path, thumbPath]);
    // The trigger's own words (8 images, variants use the group's images); else the product is gone.
    if (error.code === "22023") return json(400, { error: error.message });
    console.error("product image save failed:", error);
    return json(400, { error: "We couldn't add this image. The product may have been deleted." });
  }
  return json(200, { image: data });
}

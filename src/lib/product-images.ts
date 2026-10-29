// RF-21.2 product images. Each upload is two JPEGs made in the browser: the image (at most 1200px) and a
// thumbnail (240px) next to it, `<id>.jpg` and `<id>-t.jpg` in the organization's folder of the public
// product-images bucket. Lists, line search and PDFs use the thumbnail. Shared by server and client code.

export const PRODUCT_IMAGE_BUCKET = "product-images";

/** Up to 8 per product, kit or product group (also checked in SQL). */
export const MAX_PRODUCT_IMAGES = 8;

export type ProductImage = { id: string; url: string; position: number };

/** PostgREST embeds (product_images has foreign keys to both inventory_items and product_groups). */
export const ITEM_IMAGES_EMBED = "product_images!product_images_item_fkey(id, url, position)";
export const GROUP_IMAGES_EMBED = "product_images!product_images_group_fkey(id, url, position)";

/** The thumbnail beside an image. */
export const thumbUrl = (url: string) => url.replace(/\.jpg$/, "-t.jpg");

/** Storage paths of an image and its thumbnail, from the image's public URL. */
export function imagePaths(url: string) {
  const marker = `/${PRODUCT_IMAGE_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return [];
  const path = decodeURIComponent(url.slice(at + marker.length));
  return [path, path.replace(/\.jpg$/, "-t.jpg")];
}

/** In gallery order. */
export const sortImages = (images: ProductImage[] | null | undefined) => [...(images ?? [])].sort((a, b) => a.position - b.position);

/** The main image (the first) of a product, or of its group for a variant. */
export function mainImage(own: ProductImage[] | null | undefined, group?: ProductImage[] | null) {
  return sortImages(own)[0]?.url ?? sortImages(group)[0]?.url ?? null;
}

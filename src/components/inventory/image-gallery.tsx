"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, X } from "lucide-react";
import { orderProductImages, removeProductImages } from "@/lib/actions/product-images";
import { prepareProductImage } from "@/lib/image-resize";
import { MAX_PRODUCT_IMAGES, thumbUrl, type ProductImage } from "@/lib/product-images";

// RF-21.2: the gallery in the product, kit and product group dialogs. Changes wait in the form and are
// saved after the product (a new product has no id until then): removed images go, new ones upload,
// then the order is saved.

/** An image in the dialog: saved (`id`) or picked and waiting to upload (`upload`). */
export type GalleryImage = { key: string; id: string | null; preview: string; upload?: { image: Blob; thumb: Blob } };

export const galleryFrom = (images: ProductImage[]): GalleryImage[] => images.map((i) => ({ key: i.id, id: i.id, preview: thumbUrl(i.url) }));

/** True when the gallery differs from what's saved (for the unsaved-changes guard). */
export const galleryChanged = (saved: ProductImage[], now: GalleryImage[]) =>
  now.length !== saved.length || now.some((g, i) => g.id !== saved[i]?.id);

/**
 * Saves the gallery for a product (`itemId`) or group (`groupId`) after the product itself was saved.
 * Returns a message when part of it failed (the product is saved either way).
 */
export async function saveGallery(owner: { itemId: string } | { groupId: string }, saved: ProductImage[], now: GalleryImage[]): Promise<string | null> {
  if (!galleryChanged(saved, now)) return null;
  const kept = new Set(now.flatMap((g) => (g.id ? [g.id] : [])));
  const removed = saved.filter((s) => !kept.has(s.id)).map((s) => s.id);
  if (removed.length) {
    const result = await removeProductImages(removed);
    if (result.status === "error") return result.message;
  }
  const ids: string[] = [];
  for (const g of now) {
    if (g.id) {
      ids.push(g.id);
      continue;
    }
    if (!g.upload) continue;
    const body = new FormData();
    if ("itemId" in owner) body.set("itemId", owner.itemId);
    else body.set("groupId", owner.groupId);
    body.set("image", g.upload.image, "image.jpg");
    body.set("thumb", g.upload.thumb, "thumb.jpg");
    const res = await fetch("/api/product-images", { method: "POST", body });
    const json = (await res.json().catch(() => ({}))) as { image?: ProductImage; error?: string };
    if (!res.ok || !json.image) return json.error ?? "An image didn't upload. Try adding it again.";
    ids.push(json.image.id);
  }
  const ordered = await orderProductImages(ids);
  return ordered.status === "error" ? ordered.message : null;
}

type Props = {
  value: GalleryImage[];
  onChange: (next: GalleryImage[]) => void;
  /** Variants: "Variants show these images." */
  note?: string;
};

/** Up to 8 images; the first is the main one. Drag to reorder (or use the arrows); × removes. */
export function ImageGallery({ value, onChange, note }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const room = MAX_PRODUCT_IMAGES - value.length;

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const next = [...value];
    const problems: string[] = [];
    for (const file of Array.from(files).slice(0, Math.max(room, 0))) {
      try {
        const upload = await prepareProductImage(file);
        next.push({ key: crypto.randomUUID(), id: null, preview: URL.createObjectURL(upload.thumb), upload });
      } catch (err) {
        problems.push(err instanceof Error ? err.message : `${file.name} couldn't be added.`);
      }
    }
    if (files.length > room) problems.push(`A product can have at most ${MAX_PRODUCT_IMAGES} images.`);
    setBusy(false);
    setError(problems.length ? problems.join(" ") : null);
    onChange(next);
    if (input.current) input.current.value = "";
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="compatibility product-gallery">
      <div className="unit-packs-head">
        <div>
          <h3>Images</h3>
          <p>{note ?? "Up to 8 photos (PNG or JPG). The first is the main image; drag to change the order."}</p>
        </div>
      </div>
      <ul className="gallery-grid" aria-label="Product images">
        {value.map((g, i) => (
          <li
            key={g.key}
            className={`gallery-tile${dragging === i ? " dragging" : ""}`}
            draggable
            onDragStart={(e) => {
              setDragging(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null) move(dragging, i);
              setDragging(null);
            }}
            onDragEnd={() => setDragging(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on Supabase Storage / local previews */}
            <img src={g.preview} alt={i === 0 ? "Main image" : `Image ${i + 1}`} />
            {i === 0 && <span className="gallery-main"><Star size={10} /> Main</span>}
            {!g.id && <span className="gallery-new">New</span>}
            <span className="gallery-actions">
              <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, i - 1)}><ChevronLeft size={13} /></button>
              <button type="button" aria-label="Move later" disabled={i === value.length - 1} onClick={() => move(i, i + 1)}><ChevronRight size={13} /></button>
              <button type="button" aria-label="Remove image" onClick={() => onChange(value.filter((_, j) => j !== i))}><X size={13} /></button>
            </span>
          </li>
        ))}
        {room > 0 && (
          <li>
            <button type="button" className="gallery-add" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
              <span>{busy ? "Preparing…" : "Add images"}</span>
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/png,image/jpeg" multiple hidden onChange={(e) => void add(e.target.files)} />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

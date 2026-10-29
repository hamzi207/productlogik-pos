// RF-21.2: product photos are made smaller in the browser before upload: a JPEG of at most 1200px for the
// details view and a 240px thumbnail for lists, line search and PDFs (both under 1 MB).

const MAX_SIDE = 1200;
const THUMB_SIDE = 240;
const MAX_BYTES = 1024 * 1024;

async function load(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(img: HTMLImageElement, side: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("This browser can't prepare images."));
  // PNGs with see-through parts get a white background (JPEG has none).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare this image."))), "image/jpeg", quality));
}

/** The upload pair for a PNG / JPEG the user picked; throws a message for anything else. */
export async function prepareProductImage(file: File): Promise<{ image: Blob; thumb: Blob }> {
  if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error(`${file.name}: use a PNG or JPG image.`);
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is too large (over 25 MB).`);
  let img: HTMLImageElement;
  try {
    img = await load(file);
  } catch {
    throw new Error(`${file.name} couldn't be opened as an image.`);
  }
  let image = await toJpeg(img, MAX_SIDE, 0.85);
  for (const quality of [0.75, 0.6]) {
    if (image.size <= MAX_BYTES) break;
    image = await toJpeg(img, MAX_SIDE, quality);
  }
  if (image.size > MAX_BYTES) throw new Error(`${file.name} is still over 1 MB after resizing.`);
  return { image, thumb: await toJpeg(img, THUMB_SIDE, 0.8) };
}

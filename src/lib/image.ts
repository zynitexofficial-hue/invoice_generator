export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export class ImageError extends Error {}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageError("This image couldn't be read."));
    img.src = src;
  });
}

/**
 * Validate an uploaded logo/signature and convert it to a compact PNG data URL.
 * SVGs are rasterised here, so no SVG markup is ever stored or rendered inline.
 */
export async function processImage(file: File, maxDimension = 640): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new ImageError("Please choose a PNG, JPG, WebP or SVG image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageError("Images must be 2 MB or smaller.");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth || 512;
    const height = img.naturalHeight || 512;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError("Your browser couldn't process this image.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

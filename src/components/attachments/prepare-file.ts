import { checkAttachment, isImageType } from "@/lib/purchases/attachment-utils";

export interface PreparedFile {
  name: string;
  mime: string;
  size: number;
  /** Base64 contents without a data: prefix. */
  data: string;
}

const MAX_SIDE = 1600;

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("This file couldn't be read."));
    reader.readAsDataURL(blob);
  });
}

const stripPrefix = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

/** Shrink a photo to at most 1600 px and re-encode as JPEG; null when the browser can't. */
async function compressImage(file: File): Promise<Blob | null> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("image"));
        el.src = url;
      });
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff"; // JPEG has no transparency
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/**
 * Validate a picked file, compress photos when that makes them smaller, and
 * return base64 ready for saveAttachment. Throws an Error with a plain-language
 * message when the file is not acceptable.
 */
export async function prepareAttachmentFile(file: File, maxFileKb: number): Promise<PreparedFile> {
  let blob: Blob = file;
  let name = file.name || "receipt";
  if (isImageType(file.type)) {
    const small = await compressImage(file);
    if (small && small.size < file.size) {
      blob = small;
      name = name.replace(/\.[^.]+$/, "") + ".jpg";
    }
  }
  const mime = blob.type || file.type;
  const verdict = checkAttachment({ type: mime, size: blob.size }, maxFileKb);
  if (!verdict.ok) throw new Error(verdict.message);
  return { name, mime, size: blob.size, data: stripPrefix(await readDataUrl(blob)) };
}
